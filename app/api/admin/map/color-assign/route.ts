import { and, eq, sql } from "drizzle-orm";
import sharp from "sharp";
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
  mapRasterColorAssignments,
  mapRasters,
} from "@/src/db/schema";
import { GLOBAL_MAP_H3_RESOLUTION } from "@/src/domain/map/grid";
import { parseHexColor, rgbToHex } from "@/src/domain/map/image-colors";
import { assertMapRevision } from "@/src/domain/map/revision";
import { actionRateLimiter } from "@/src/services/rate-limit";

type CellRow = {
  cellId: string;
  latitude: string;
  longitude: string;
  countryId: string | null;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.user.role !== "ADMIN") {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const rateLimit = actionRateLimiter.consume(`map-color-assign:${session.user.id}`, 20, 60_000);
  if (!rateLimit.allowed)
    return Response.json(
      { error: "\uc694\uccad\uc774 \ub108\ubb34 \ube60\ub985\ub2c8\ub2e4." },
      { status: 429 },
    );
  const body = (await request.json()) as Record<string, unknown>;
  const campaignId = String(body.campaignId ?? "");
  const mapId = String(body.mapId ?? "");
  const countryId = String(body.countryId ?? "");
  const colorHex = String(body.colorHex ?? "").toUpperCase();
  const expectedRevision = Number(body.expectedRevision);
  if (
    !/^[0-9a-f-]{36}$/i.test(campaignId) ||
    !/^[0-9a-f-]{36}$/i.test(mapId) ||
    !/^[0-9a-f-]{36}$/i.test(countryId) ||
    !parseHexColor(colorHex) ||
    !Number.isInteger(expectedRevision)
  ) {
    return Response.json(
      {
        error:
          "\uc0c9\uc0c1 \ud560\ub2f9 \uac12\uc774 \uc62c\ubc14\ub974\uc9c0 \uc54a\uc2b5\ub2c8\ub2e4.",
      },
      { status: 400 },
    );
  }
  const [campaignMap, country, raster] = await Promise.all([
    db.query.campaignMaps.findFirst({
      where: and(eq(campaignMaps.id, mapId), eq(campaignMaps.campaignId, campaignId)),
    }),
    db.query.countries.findFirst({
      where: and(eq(countries.id, countryId), eq(countries.campaignId, campaignId)),
    }),
    db.query.mapRasters.findFirst({
      where: and(eq(mapRasters.mapId, mapId), eq(mapRasters.campaignId, campaignId)),
    }),
  ]);
  if (!campaignMap || !country || !raster) {
    return Response.json(
      {
        error:
          "\uc9c0\ub3c4 \ub610\ub294 \uad6d\uac00\ub97c \ucc3e\uc744 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4.",
      },
      { status: 404 },
    );
  }
  if (campaignMap.revision !== expectedRevision) {
    return Response.json(
      {
        error:
          "\uc9c0\ub3c4\uac00 \ubcc0\uacbd\ub410\uc2b5\ub2c8\ub2e4. \uc0c8\ub85c\uace0\uce68 \ud6c4 \ub2e4\uc2dc \uc2dc\ub3c4\ud558\uc138\uc694.",
      },
      { status: 409 },
    );
  }
  const decoded = await sharp(raster.imageData)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = decoded.info;
  const cells = await db.execute<CellRow>(sql`
    WITH latest_ownership AS (
      SELECT DISTINCT ON (cell_id) cell_id, country_id
      FROM map_ownership
      WHERE map_id = ${mapId}
        AND revision <= ${expectedRevision}
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
    const offset = (y * width + x) * channels;
    const red = decoded.data[offset];
    const green = decoded.data[offset + 1];
    const blue = decoded.data[offset + 2];
    const alpha = decoded.data[offset + 3];
    if (alpha < 128 || (red <= 32 && green <= 32 && blue <= 32)) continue;
    if (
      rgbToHex([red & 0xf8, green & 0xf8, blue & 0xf8]) === colorHex &&
      cell.countryId !== countryId
    ) {
      changes.push({ cellId: cell.cellId, previousCountryId: cell.countryId });
    }
  }
  const revision = changes.length ? expectedRevision + 1 : expectedRevision;
  await db.transaction(async (tx) => {
    const locked = await tx.execute<{ revision: number; position: number }>(sql`
      SELECT revision, position
      FROM campaign_maps
      WHERE id = ${mapId} AND campaign_id = ${campaignId}
      FOR UPDATE
    `);
    if (!locked.at(0)) throw new Error("MAP_NOT_FOUND");
    assertMapRevision(expectedRevision, locked[0].revision);
    await tx
      .delete(mapRasterColorAssignments)
      .where(
        and(
          eq(mapRasterColorAssignments.mapId, mapId),
          eq(mapRasterColorAssignments.countryId, countryId),
        ),
      );
    await tx
      .insert(mapRasterColorAssignments)
      .values({ campaignId, mapId, colorHex, countryId, updatedBy: session.user.id })
      .onConflictDoUpdate({
        target: [mapRasterColorAssignments.mapId, mapRasterColorAssignments.colorHex],
        set: { countryId, updatedBy: session.user.id, updatedAt: new Date() },
      });
    if (changes.length) {
      const [changeSet] = await tx
        .insert(mapChangeSets)
        .values({
          campaignId,
          mapId,
          baseRevision: expectedRevision,
          newRevision: revision,
          targetCountryId: countryId,
          actorId: session.user.id,
          reason: `\ud3c9\uba74 \uc9c0\ub3c4 \uc0c9\uc0c1 ${colorHex} \uad6d\uac00 \ud560\ub2f9`,
          cellCount: changes.length,
        })
        .returning();
      for (let offset = 0; offset < changes.length; offset += 2000) {
        const chunk = changes.slice(offset, offset + 2000);
        await tx.insert(mapOwnership).values(
          chunk.map((change) => ({
            campaignId,
            mapId,
            revision,
            cellId: change.cellId,
            countryId,
          })),
        );
        await tx.insert(mapCellChanges).values(
          chunk.map((change) => ({
            changeSetId: changeSet.id,
            cellId: change.cellId,
            previousCountryId: change.previousCountryId,
            newCountryId: countryId,
          })),
        );
      }
      await tx
        .update(campaignMaps)
        .set({ revision, updatedAt: new Date() })
        .where(eq(campaignMaps.id, mapId));
      if (locked[0].position === 1) {
        await tx
          .update(campaigns)
          .set({ mapRevision: revision, updatedAt: new Date() })
          .where(eq(campaigns.id, campaignId));
      }
    }
    await tx
      .update(countries)
      .set({ color: colorHex, updatedAt: new Date() })
      .where(eq(countries.id, countryId));
    await tx.insert(auditLogs).values({
      campaignId,
      actorId: session.user.id,
      action: "ASSIGN_PIXEL_MAP_COLOR",
      targetType: "CAMPAIGN_MAP",
      targetId: mapId,
      afterSummary: { colorHex, countryId, changed: changes.length, revision },
      reason: `\ud3c9\uba74 \uc9c0\ub3c4 \uc0c9\uc0c1 ${colorHex} \uad6d\uac00 \ud560\ub2f9`,
    });
  });
  return Response.json({ changed: changes.length, revision, colorHex, countryId });
}
