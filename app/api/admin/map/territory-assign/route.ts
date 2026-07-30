import { and, eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { z } from "zod";
import { getSession } from "@/src/auth/session";
import { db } from "@/src/db";
import {
  auditLogs,
  campaignMaps,
  campaigns,
  countries,
  mapCellChanges,
  mapChangeSets,
  mapOwnership,
  mapRasterBorderLayers,
  mapRasterColorAssignments,
  mapRasters,
} from "@/src/db/schema";
import { applyBorderClassifications, borderSourceRgbs } from "@/src/domain/map/border-palette";
import { GLOBAL_MAP_H3_RESOLUTION } from "@/src/domain/map/grid";
import { parseHexColor, rgbToHex } from "@/src/domain/map/image-colors";
import {
  assignColorPixels,
  assignConnectedRegion,
  assignIslandBrush,
  removeRasterBorders,
} from "@/src/domain/map/raster-territory";
import { assertMapRevision } from "@/src/domain/map/revision";
import { createRasterPreviewFromRaw } from "@/src/domain/map/raster-preview";
import { actionRateLimiter } from "@/src/services/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  campaignId: z.string().uuid(),
  mapId: z.string().uuid(),
  countryId: z.string().uuid(),
  mode: z.enum(["COLOR", "REGION", "ISLAND"]),
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  territoryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  oceanColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .default("#2F8CA3"),
  brushRadius: z.number().int().min(1).max(256).default(8),
  points: z
    .array(z.object({ x: z.number().int().nonnegative(), y: z.number().int().nonnegative() }))
    .max(5000)
    .default([]),
  expectedMapRevision: z.number().int().nonnegative(),
  expectedRasterRevision: z.number().int().positive(),
});

type CellRow = {
  cellId: string;
  latitude: string;
  longitude: string;
  countryId: string | null;
};

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.user.role !== "ADMIN") {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const rateLimit = actionRateLimiter.consume(
    `map-territory-assign:${session.user.id}`,
    20,
    60_000,
  );
  if (!rateLimit.allowed) {
    return Response.json({ error: "요청이 너무 빠릅니다." }, { status: 429 });
  }

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "영토 할당 정보가 올바르지 않습니다." }, { status: 400 });
  }
  const input = parsed.data;
  const [campaignMap, country, raster, borderLayer, colorConflict] = await Promise.all([
    db.query.campaignMaps.findFirst({
      where: and(eq(campaignMaps.id, input.mapId), eq(campaignMaps.campaignId, input.campaignId)),
    }),
    db.query.countries.findFirst({
      where: and(eq(countries.id, input.countryId), eq(countries.campaignId, input.campaignId)),
    }),
    db.query.mapRasters.findFirst({
      where: and(eq(mapRasters.mapId, input.mapId), eq(mapRasters.campaignId, input.campaignId)),
    }),
    db.query.mapRasterBorderLayers.findFirst({
      where: eq(mapRasterBorderLayers.mapId, input.mapId),
    }),
    db.query.mapRasterColorAssignments.findFirst({
      where: and(
        eq(mapRasterColorAssignments.mapId, input.mapId),
        eq(mapRasterColorAssignments.colorHex, input.territoryColor.toUpperCase()),
      ),
    }),
  ]);
  if (!campaignMap || !country || !raster) {
    return Response.json({ error: "지도 또는 국가를 찾을 수 없습니다." }, { status: 404 });
  }
  if (
    campaignMap.revision !== input.expectedMapRevision ||
    raster.revision !== input.expectedRasterRevision
  ) {
    return Response.json(
      { error: "지도가 변경됐습니다. 새로고침 후 다시 시도하세요." },
      { status: 409 },
    );
  }
  if (colorConflict && colorConflict.countryId !== input.countryId) {
    return Response.json({ error: "선택한 영토색은 다른 국가가 사용 중입니다." }, { status: 409 });
  }

  const territoryRgb = parseHexColor(input.territoryColor)!;
  const oceanRgb = parseHexColor(input.oceanColor)!;
  const borderColors = borderLayer ? borderSourceRgbs(borderLayer.classifications) : [];
  const decoded = await sharp(raster.imageData)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = decoded.info;
  if (input.x >= width || input.y >= height) {
    return Response.json({ error: "지도 밖의 위치입니다." }, { status: 400 });
  }
  const startOffset = (input.y * width + input.x) * 4;
  const sourceRgb = [
    decoded.data[startOffset],
    decoded.data[startOffset + 1],
    decoded.data[startOffset + 2],
  ] as const;
  const sourceHex = rgbToHex([sourceRgb[0] & 0xf8, sourceRgb[1] & 0xf8, sourceRgb[2] & 0xf8]);
  if (
    borderLayer?.classifications.some(
      (classification) => classification.sourceColor.toUpperCase() === sourceHex,
    )
  ) {
    return Response.json({ error: "국경 픽셀은 영토로 할당할 수 없습니다." }, { status: 400 });
  }

  const changedPixels =
    input.mode === "COLOR"
      ? assignColorPixels(decoded.data, width, height, sourceRgb, territoryRgb, borderColors)
      : input.mode === "REGION"
        ? assignConnectedRegion(decoded.data, width, height, input.x, input.y, territoryRgb)
        : assignIslandBrush(
            decoded.data,
            width,
            height,
            input.points.length ? input.points : [{ x: input.x, y: input.y }],
            input.brushRadius,
            oceanRgb,
            territoryRgb,
            borderColors,
          );
  if (!changedPixels) {
    return Response.json({ error: "변경할 영토 픽셀이 없습니다." }, { status: 400 });
  }

  const [png, preview] = await Promise.all([
    sharp(decoded.data, { raw: { width, height, channels: 4 } })
      .png({ compressionLevel: 9 })
      .toBuffer(),
    createRasterPreviewFromRaw(decoded.data, width, height),
  ]);
  const borderlessRaw = removeRasterBorders(decoded.data, width, height, borderColors);
  const borderlessPng = await sharp(borderlessRaw, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  const renderedBorderData = borderLayer
    ? await sharp(
        applyBorderClassifications(decoded.data, borderlessRaw, borderLayer.classifications),
        { raw: { width, height, channels: 4 } },
      )
        .png({ compressionLevel: 9 })
        .toBuffer()
    : null;

  const cells = await db.execute<CellRow>(sql`
    WITH latest_ownership AS (
      SELECT DISTINCT ON (cell_id) cell_id, country_id
      FROM map_ownership
      WHERE map_id = ${input.mapId}
        AND revision <= ${input.expectedMapRevision}
      ORDER BY cell_id, revision DESC
    )
    SELECT
      cell.id AS "cellId",
      cell.center_latitude AS latitude,
      cell.center_longitude AS longitude,
      owner.country_id AS "countryId"
    FROM map_cells cell
    LEFT JOIN latest_ownership owner ON owner.cell_id = cell.id
    WHERE cell.r = ${GLOBAL_MAP_H3_RESOLUTION}
  `);
  const changes: Array<{ cellId: string; previousCountryId: string | null }> = [];
  for (const cell of cells) {
    const x = Math.min(
      width - 1,
      Math.max(0, Math.floor(((Number(cell.longitude) + 180) / 360) * width)),
    );
    const y = Math.min(
      height - 1,
      Math.max(0, Math.floor(((90 - Number(cell.latitude)) / 180) * height)),
    );
    const offset = (y * width + x) * 4;
    const matches =
      Math.abs(decoded.data[offset] - territoryRgb[0]) <= 8 &&
      Math.abs(decoded.data[offset + 1] - territoryRgb[1]) <= 8 &&
      Math.abs(decoded.data[offset + 2] - territoryRgb[2]) <= 8;
    if (matches && cell.countryId !== input.countryId) {
      changes.push({ cellId: cell.cellId, previousCountryId: cell.countryId });
    }
  }

  const newMapRevision = changes.length ? input.expectedMapRevision + 1 : input.expectedMapRevision;
  const newRasterRevision = input.expectedRasterRevision + 1;
  await db.transaction(async (tx) => {
    const lockedMap = await tx.execute<{ revision: number; position: number }>(sql`
      SELECT revision, position
      FROM campaign_maps
      WHERE id = ${input.mapId} AND campaign_id = ${input.campaignId}
      FOR UPDATE
    `);
    const lockedRaster = await tx.execute<{ revision: number }>(sql`
      SELECT revision FROM map_rasters WHERE map_id = ${input.mapId} FOR UPDATE
    `);
    if (!lockedMap.at(0) || !lockedRaster.at(0)) throw new Error("MAP_NOT_FOUND");
    assertMapRevision(input.expectedMapRevision, lockedMap[0].revision);
    if (lockedRaster[0].revision !== input.expectedRasterRevision) {
      throw new Error("RASTER_REVISION_CONFLICT");
    }

    await tx
      .update(mapRasters)
      .set({
        imageData: png,
        borderlessImageData: borderlessPng,
        previewImageData: preview.data,
        previewWidth: preview.width,
        previewHeight: preview.height,
        revision: newRasterRevision,
        updatedBy: session.user.id,
        updatedAt: new Date(),
      })
      .where(eq(mapRasters.mapId, input.mapId));
    if (borderLayer && renderedBorderData) {
      await tx
        .update(mapRasterBorderLayers)
        .set({
          renderedData: renderedBorderData,
          revision: sql`${mapRasterBorderLayers.revision} + 1`,
          updatedBy: session.user.id,
          updatedAt: new Date(),
        })
        .where(eq(mapRasterBorderLayers.mapId, input.mapId));
    }

    await tx
      .delete(mapRasterColorAssignments)
      .where(
        and(
          eq(mapRasterColorAssignments.mapId, input.mapId),
          eq(mapRasterColorAssignments.countryId, input.countryId),
        ),
      );
    await tx
      .insert(mapRasterColorAssignments)
      .values({
        campaignId: input.campaignId,
        mapId: input.mapId,
        colorHex: input.territoryColor.toUpperCase(),
        countryId: input.countryId,
        updatedBy: session.user.id,
      })
      .onConflictDoUpdate({
        target: [mapRasterColorAssignments.mapId, mapRasterColorAssignments.colorHex],
        set: { countryId: input.countryId, updatedBy: session.user.id, updatedAt: new Date() },
      });

    let changeSetId: string | null = null;
    if (changes.length) {
      const [changeSet] = await tx
        .insert(mapChangeSets)
        .values({
          campaignId: input.campaignId,
          mapId: input.mapId,
          baseRevision: input.expectedMapRevision,
          newRevision: newMapRevision,
          targetCountryId: input.countryId,
          actorId: session.user.id,
          reason: `픽셀 지도 ${input.mode} 영토 할당`,
          cellCount: changes.length,
        })
        .returning();
      changeSetId = changeSet.id;
      for (let offset = 0; offset < changes.length; offset += 2000) {
        const chunk = changes.slice(offset, offset + 2000);
        await tx.insert(mapOwnership).values(
          chunk.map((change) => ({
            campaignId: input.campaignId,
            mapId: input.mapId,
            revision: newMapRevision,
            cellId: change.cellId,
            countryId: input.countryId,
          })),
        );
        await tx.insert(mapCellChanges).values(
          chunk.map((change) => ({
            changeSetId: changeSet.id,
            cellId: change.cellId,
            previousCountryId: change.previousCountryId,
            newCountryId: input.countryId,
          })),
        );
      }
      await tx
        .update(campaignMaps)
        .set({ revision: newMapRevision, updatedAt: new Date() })
        .where(eq(campaignMaps.id, input.mapId));
      if (lockedMap[0].position === 1) {
        await tx
          .update(campaigns)
          .set({ mapRevision: newMapRevision, updatedAt: new Date() })
          .where(eq(campaigns.id, input.campaignId));
      }
    }

    await tx
      .update(countries)
      .set({ color: input.territoryColor.toUpperCase(), updatedAt: new Date() })
      .where(eq(countries.id, input.countryId));
    await tx.insert(auditLogs).values({
      campaignId: input.campaignId,
      actorId: session.user.id,
      action: `ASSIGN_PIXEL_TERRITORY_${input.mode}`,
      targetType: changeSetId ? "MAP_CHANGE_SET" : "CAMPAIGN_MAP",
      targetId: changeSetId ?? input.mapId,
      afterSummary: {
        mode: input.mode,
        countryId: input.countryId,
        territoryColor: input.territoryColor.toUpperCase(),
        changedPixels,
        changedCells: changes.length,
        mapRevision: newMapRevision,
        rasterRevision: newRasterRevision,
      },
      reason: "업로드 지도 영토 할당",
    });
  });

  return Response.json({
    changedPixels,
    changedCells: changes.length,
    mapRevision: newMapRevision,
    rasterRevision: newRasterRevision,
  });
}
