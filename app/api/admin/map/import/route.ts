import { and, eq, sql } from "drizzle-orm";
import sharp, { type OutputInfo } from "sharp";
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
  mapRasters,
} from "@/src/db/schema";
import { GLOBAL_MAP_H3_RESOLUTION } from "@/src/domain/map/grid";
import { detectMapColors, matchCountryColor, parseHexColor } from "@/src/domain/map/image-colors";
import { assertMapRevision } from "@/src/domain/map/revision";
import { actionRateLimiter } from "@/src/services/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const rateLimit = actionRateLimiter.consume(`map-import:${session.user.id}`, 8, 60_000);
  if (!rateLimit.allowed) {
    return Response.json(
      {
        error: `요청이 너무 빠릅니다. ${Math.ceil(rateLimit.retryAfterMs / 1000)}초 후 다시 시도해 주세요.`,
      },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rateLimit.retryAfterMs / 1000)) } },
    );
  }
  const formData = await request.formData();
  const file = formData.get("file");
  const campaignId = String(formData.get("campaignId") ?? "");
  const mapId = String(formData.get("mapId") ?? "");
  const expectedRevision = Number(formData.get("expectedRevision"));
  const mode = formData.get("mode") === "analyze" ? "analyze" : "apply";
  if (mode === "apply" && formData.get("confirm") !== "yes") {
    return Response.json({ error: "적용 내용을 확인해 주세요." }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0 || file.size > 25 * 1024 * 1024) {
    return Response.json({ error: "25MB 이하 이미지가 필요합니다." }, { status: 400 });
  }
  if (
    !Number.isInteger(expectedRevision) ||
    !/^[0-9a-f-]{36}$/i.test(campaignId) ||
    !/^[0-9a-f-]{36}$/i.test(mapId)
  ) {
    return Response.json({ error: "지도 리비전이 올바르지 않습니다." }, { status: 400 });
  }
  const campaignMap = await db.query.campaignMaps.findFirst({
    where: and(eq(campaignMaps.id, mapId), eq(campaignMaps.campaignId, campaignId)),
  });
  if (!campaignMap) return Response.json({ error: "지도를 찾을 수 없습니다." }, { status: 404 });
  if (campaignMap.revision !== expectedRevision) {
    return Response.json(
      { error: "지도가 변경되었습니다. 새로고침 후 다시 시도해 주세요." },
      { status: 409 },
    );
  }
  const fileBuffer = Buffer.from(await file.arrayBuffer());
  let decoded: { data: Buffer; info: OutputInfo };
  try {
    decoded = await sharp(fileBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  } catch {
    return Response.json(
      { error: "PNG, JPEG 또는 WebP 이미지를 읽을 수 없습니다." },
      { status: 400 },
    );
  }
  const { width, height, channels } = decoded.info;
  if (!width || !height || channels < 3) {
    return Response.json({ error: "이미지 크기를 확인할 수 없습니다." }, { status: 400 });
  }

  const detected = detectMapColors(decoded.data, width, height, channels);
  if (mode === "analyze") {
    const png = await sharp(fileBuffer).png().toBuffer();
    const [raster] = await db
      .insert(mapRasters)
      .values({
        mapId,
        campaignId,
        imageData: png,
        contentType: "image/png",
        width,
        height,
        updatedBy: session.user.id,
      })
      .onConflictDoUpdate({
        target: mapRasters.mapId,
        set: {
          imageData: png,
          contentType: "image/png",
          width,
          height,
          revision: sql`${mapRasters.revision} + 1`,
          updatedBy: session.user.id,
          updatedAt: new Date(),
        },
      })
      .returning({ revision: mapRasters.revision });
    await db.insert(auditLogs).values({
      campaignId,
      actorId: session.user.id,
      action: "UPLOAD_PIXEL_MAP",
      targetType: "CAMPAIGN_MAP",
      targetId: mapId,
      afterSummary: { width, height, rasterRevision: raster.revision },
      reason: `\ud3c9\uba74 \ud53d\uc140 \uc9c0\ub3c4 \uc5c5\ub85c\ub4dc: ${file.name}`,
    });
    return Response.json({
      rasterRevision: raster.revision,
      colors: detected.colors.map(({ hex, samples, percentage }) => ({
        hex,
        samples,
        percentage,
      })),
      blackBorders: detected.borderSamples,
    });
  }

  let assignments: Array<{ hex: string; countryId: string }>;
  try {
    const raw = JSON.parse(String(formData.get("assignments") ?? "[]")) as unknown;
    if (!Array.isArray(raw)) throw new Error();
    assignments = raw.map((item) => {
      if (!item || typeof item !== "object") throw new Error();
      const hex = String((item as Record<string, unknown>).hex ?? "").toUpperCase();
      const countryId = String((item as Record<string, unknown>).countryId ?? "");
      if (!parseHexColor(hex) || !/^[0-9a-f-]{36}$/i.test(countryId)) throw new Error();
      return { hex, countryId };
    });
  } catch {
    return Response.json({ error: "색상별 국가 배정을 확인해 주세요." }, { status: 400 });
  }
  if (!assignments.length) {
    return Response.json(
      { error: "한 개 이상의 지도 색상을 국가에 배정해 주세요." },
      { status: 400 },
    );
  }
  if (new Set(assignments.map(({ countryId }) => countryId)).size !== assignments.length) {
    return Response.json(
      { error: "한 국가는 하나의 지도 색상에만 배정할 수 있습니다." },
      { status: 400 },
    );
  }
  const detectedColors = new Set(detected.colors.map(({ hex }) => hex));
  if (assignments.some(({ hex }) => !detectedColors.has(hex))) {
    return Response.json({ error: "다시 분석한 뒤 검출된 색상만 배정해 주세요." }, { status: 400 });
  }

  const countryRows = await db.query.countries.findMany({
    where: eq(countries.campaignId, campaignId),
  });
  const countriesById = new Map(countryRows.map((country) => [country.id, country]));
  if (assignments.some(({ countryId }) => !countriesById.has(countryId))) {
    return Response.json(
      { error: "현재 캠페인에 없는 국가가 포함되어 있습니다." },
      { status: 400 },
    );
  }
  const palette = assignments.map(({ hex, countryId }) => ({
    country: countriesById.get(countryId)!,
    rgb: parseHexColor(hex)!,
    hex,
  }));

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
  const changes: Array<{ cellId: string; previousCountryId: string | null; countryId: string }> =
    [];
  let blackBorders = 0;
  let unmatched = 0;
  for (const cell of cells) {
    const longitude = Number(cell.longitude);
    const latitude = Number(cell.latitude);
    const x = Math.min(width - 1, Math.max(0, Math.floor(((longitude + 180) / 360) * width)));
    const y = Math.min(height - 1, Math.max(0, Math.floor(((90 - latitude) / 180) * height)));
    const offset = (y * width + x) * channels;
    const red = decoded.data[offset];
    const green = decoded.data[offset + 1];
    const blue = decoded.data[offset + 2];
    const alpha = channels >= 4 ? decoded.data[offset + 3] : 255;
    const match = matchCountryColor(
      [red, green, blue, alpha],
      palette.map(({ country, rgb }) => ({ value: country, rgb })),
    );
    if (match.kind === "border") {
      blackBorders += 1;
      continue;
    }
    if (match.kind === "unmatched") {
      unmatched += 1;
      continue;
    }
    if (cell.countryId !== match.value.id) {
      changes.push({
        cellId: cell.cellId,
        previousCountryId: cell.countryId,
        countryId: match.value.id,
      });
    }
  }
  const newRevision = expectedRevision + 1;
  try {
    await db.transaction(async (tx) => {
      const locked = await tx.execute<{ revision: number; position: number }>(sql`
        SELECT revision, position
        FROM campaign_maps
        WHERE id = ${mapId}
          AND campaign_id = ${campaignId}
        FOR UPDATE
      `);
      if (!locked.at(0)) throw new Error("MAP_NOT_FOUND");
      assertMapRevision(expectedRevision, locked[0].revision);
      const [changeSet] = await tx
        .insert(mapChangeSets)
        .values({
          campaignId,
          mapId,
          baseRevision: expectedRevision,
          newRevision,
          actorId: session.user.id,
          reason: `이미지 색상 가져오기: ${file.name}`,
          cellCount: changes.length,
        })
        .returning();
      for (let offset = 0; offset < changes.length; offset += 2000) {
        const chunk = changes.slice(offset, offset + 2000);
        await tx.insert(mapOwnership).values(
          chunk.map((change) => ({
            campaignId,
            mapId,
            revision: newRevision,
            cellId: change.cellId,
            countryId: change.countryId,
          })),
        );
        await tx.insert(mapCellChanges).values(
          chunk.map((change) => ({
            changeSetId: changeSet.id,
            cellId: change.cellId,
            previousCountryId: change.previousCountryId,
            newCountryId: change.countryId,
          })),
        );
      }
      await tx
        .update(campaignMaps)
        .set({ revision: newRevision, updatedAt: new Date() })
        .where(and(eq(campaignMaps.id, mapId), eq(campaignMaps.revision, expectedRevision)));
      if (locked[0].position === 1) {
        await tx
          .update(campaigns)
          .set({ mapRevision: newRevision, updatedAt: new Date() })
          .where(eq(campaigns.id, campaignId));
      }
      for (const assignment of palette) {
        await tx
          .update(countries)
          .set({ color: assignment.hex, updatedAt: new Date() })
          .where(
            and(eq(countries.id, assignment.country.id), eq(countries.campaignId, campaignId)),
          );
      }
      await tx.insert(auditLogs).values({
        campaignId,
        actorId: session.user.id,
        action: "IMPORT_MAP_IMAGE",
        targetType: "MAP_CHANGE_SET",
        targetId: changeSet.id,
        beforeSummary: { mapId, revision: expectedRevision },
        afterSummary: {
          mapId,
          revision: newRevision,
          changed: changes.length,
          blackBorders,
          unmatched,
          assignments: palette.map(({ hex, country }) => ({ hex, countryId: country.id })),
        },
        reason: `검출 색상별 국가 배정 이미지 가져오기: ${file.name}`,
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("지도 리비전 충돌")) {
      return Response.json(
        { error: "지도가 변경되었습니다. 새로고침 후 다시 시도해 주세요." },
        { status: 409 },
      );
    }
    throw error;
  }
  return Response.json({
    changed: changes.length,
    blackBorders,
    unmatched,
    assignedColors: palette.length,
    revision: newRevision,
  });
}
