import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { getSession } from "@/src/auth/session";
import { db } from "@/src/db";
import {
  auditLogs,
  campaignMaps,
  countries,
  countryRelations,
  mapRasterBorderLayers,
  mapRasterColorAssignments,
  mapRasters,
} from "@/src/db/schema";
import { countryEntityTypeSchema } from "@/src/domain/country/entity-type";
import { territoryRasterColors } from "@/src/domain/map/automatic-borders";
import {
  DEFAULT_BORDER_LAYER_COLORS,
  DEFAULT_BORDER_SOURCE_COLORS,
} from "@/src/domain/map/border-palette";
import { isMapProjection, type MapProjection } from "@/src/domain/map/projection";
import { actionRateLimiter } from "@/src/services/rate-limit";
import { buildAutomaticMapRaster } from "@/src/services/automatic-map-raster";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_RASTER_WIDTH = 16_384;
const MAX_RASTER_HEIGHT = 8_192;
const MAX_RASTER_PIXELS = MAX_RASTER_WIDTH * MAX_RASTER_HEIGHT;

function temporaryCountryCode(color: string, usedCodes: Set<string>) {
  const base = `T${color.slice(1)}`.toUpperCase();
  if (!usedCodes.has(base)) {
    usedCodes.add(base);
    return base;
  }
  for (let suffix = 1; suffix < 100; suffix += 1) {
    const candidate = `${base.slice(0, 7 - String(suffix).length)}${suffix}`;
    if (!usedCodes.has(candidate)) {
      usedCodes.add(candidate);
      return candidate;
    }
  }
  const fallback = `T${randomUUID().replaceAll("-", "").slice(0, 6)}`.toUpperCase();
  usedCodes.add(fallback);
  return fallback;
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.user.role !== "ADMIN") {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const rateLimit = actionRateLimiter.consume(`map-raster-save:${session.user.id}`, 12, 60_000);
  if (!rateLimit.allowed) {
    return Response.json({ error: "요청이 너무 빠릅니다." }, { status: 429 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const campaignId = String(formData.get("campaignId") ?? "");
  const mapId = String(formData.get("mapId") ?? "");
  const mode = formData.get("mode") === "save" ? "save" : "upload";
  const requestedProjection = formData.get("projection");
  const projection: MapProjection | null = isMapProjection(requestedProjection)
    ? requestedProjection
    : null;
  if (!(file instanceof File) || file.size === 0 || file.size > 100 * 1024 * 1024) {
    return Response.json({ error: "100MB 이하 이미지 파일을 선택하세요." }, { status: 400 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(campaignId) || !/^[0-9a-f-]{36}$/i.test(mapId)) {
    return Response.json({ error: "잘못된 지도 정보입니다." }, { status: 400 });
  }

  const [campaignMap, borderLayer, currentRaster, currentAssignments, countryRows, relationRows] =
    await Promise.all([
      db.query.campaignMaps.findFirst({
        where: and(eq(campaignMaps.id, mapId), eq(campaignMaps.campaignId, campaignId)),
      }),
      db.query.mapRasterBorderLayers.findFirst({
        where: eq(mapRasterBorderLayers.mapId, mapId),
        columns: { classifications: true, layerColors: true },
      }),
      db.query.mapRasters.findFirst({
        where: and(eq(mapRasters.mapId, mapId), eq(mapRasters.campaignId, campaignId)),
        columns: { sourceWidth: true, sourceHeight: true, projection: true },
      }),
      db.query.mapRasterColorAssignments.findMany({
        where: and(
          eq(mapRasterColorAssignments.mapId, mapId),
          eq(mapRasterColorAssignments.campaignId, campaignId),
        ),
      }),
      db.query.countries.findMany({ where: eq(countries.campaignId, campaignId) }),
      db.query.countryRelations.findMany({ where: eq(countryRelations.campaignId, campaignId) }),
    ]);
  if (!campaignMap) {
    return Response.json({ error: "지도를 찾을 수 없습니다." }, { status: 404 });
  }

  const input = Buffer.from(await file.arrayBuffer());
  const layerColors = { ...DEFAULT_BORDER_LAYER_COLORS, ...(borderLayer?.layerColors ?? {}) };
  const classifications = borderLayer?.classifications ?? [];
  let sourceImage: Buffer;
  let sourceWidth = 0;
  let sourceHeight = 0;
  try {
    const metadata = await sharp(input, { limitInputPixels: MAX_RASTER_PIXELS }).metadata();
    const inputWidth = metadata.width ?? 0;
    const inputHeight = metadata.height ?? 0;
    if (!inputWidth || !inputHeight) throw new Error("INVALID_SIZE");
    sourceWidth =
      mode === "save"
        ? (currentRaster?.sourceWidth ?? Math.max(1, Math.floor(inputWidth / 2)))
        : inputWidth;
    sourceHeight =
      mode === "save"
        ? (currentRaster?.sourceHeight ?? Math.max(1, Math.floor(inputHeight / 2)))
        : inputHeight;
    if (
      sourceWidth * 2 > MAX_RASTER_WIDTH ||
      sourceHeight * 2 > MAX_RASTER_HEIGHT ||
      sourceWidth * sourceHeight * 4 > MAX_RASTER_PIXELS
    ) {
      throw new Error("TOO_LARGE");
    }
    sourceImage = await sharp(input, { limitInputPixels: MAX_RASTER_PIXELS })
      .resize(sourceWidth, sourceHeight, { fit: "fill", kernel: sharp.kernel.nearest })
      .ensureAlpha()
      .png({ compressionLevel: 6 })
      .toBuffer();
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === "TOO_LARGE";
    return Response.json(
      {
        error: tooLarge
          ? "2배 확대 후 최대 16384×8192를 넘을 수 없습니다."
          : "PNG, JPEG 또는 WebP 이미지를 읽을 수 없습니다.",
      },
      { status: 400 },
    );
  }

  const existingByColor = new Map(
    currentAssignments.map((assignment) => [
      assignment.colorHex.toUpperCase(),
      assignment.countryId,
    ]),
  );
  const usedCodes = new Set(countryRows.map((country) => country.code.toUpperCase()));
  const newCountries: Array<typeof countries.$inferInsert> = [];
  let assignments = currentAssignments.map(({ colorHex, countryId }) => ({
    colorHex: colorHex.toUpperCase(),
    countryId,
  }));

  if (mode === "upload") {
    const decoded = await sharp(sourceImage)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const reserved = new Set([
      ...Object.values(DEFAULT_BORDER_SOURCE_COLORS),
      ...classifications.map((row) => row.sourceColor),
    ]);
    const colors = territoryRasterColors(decoded.data, sourceWidth, sourceHeight, reserved);
    assignments = colors.map((colorHex) => {
      const existingCountryId = existingByColor.get(colorHex);
      if (existingCountryId) return { colorHex, countryId: existingCountryId };
      const id = randomUUID();
      newCountries.push({
        id,
        campaignId,
        name: "국명 미정",
        code: temporaryCountryCode(colorHex, usedCodes),
        color: colorHex,
        entityType: "STATE",
        isAi: false,
        setupStatus: "DRAFT",
      });
      return { colorHex, countryId: id };
    });
  }

  const allCountries = [
    ...countryRows,
    ...newCountries.map((country) => ({ ...country, entityType: country.entityType ?? "STATE" })),
  ];
  const assignedCountryIds = new Set(assignments.map((assignment) => assignment.countryId));
  const built = await buildAutomaticMapRaster({
    sourceImage,
    assignments,
    countries: allCountries
      .filter((country) => country.id && assignedCountryIds.has(country.id))
      .map((country) => ({
        id: country.id!,
        entityType: countryEntityTypeSchema.parse(country.entityType),
      })),
    relations: relationRows,
    classifications,
    layerColors,
  });

  const rasterRevision = await db.transaction(async (tx) => {
    if (newCountries.length) await tx.insert(countries).values(newCountries);
    if (mode === "upload") {
      await tx.delete(mapRasterColorAssignments).where(eq(mapRasterColorAssignments.mapId, mapId));
      if (assignments.length) {
        await tx.insert(mapRasterColorAssignments).values(
          assignments.map((assignment) => ({
            campaignId,
            mapId,
            colorHex: assignment.colorHex,
            countryId: assignment.countryId,
            updatedBy: session.user.id,
          })),
        );
      }
    }
    const [raster] = await tx
      .insert(mapRasters)
      .values({
        mapId,
        campaignId,
        imageData: built.imageData,
        sourceImageData: built.sourceImageData,
        sourceWidth: built.sourceWidth,
        sourceHeight: built.sourceHeight,
        borderlessImageData: built.borderlessImageData,
        previewImageData: built.preview.data,
        previewWidth: built.preview.width,
        previewHeight: built.preview.height,
        contentType: "image/png",
        width: built.width,
        height: built.height,
        projection: projection ?? currentRaster?.projection ?? "EQUIRECTANGULAR",
        updatedBy: session.user.id,
      })
      .onConflictDoUpdate({
        target: mapRasters.mapId,
        set: {
          imageData: built.imageData,
          sourceImageData: built.sourceImageData,
          sourceWidth: built.sourceWidth,
          sourceHeight: built.sourceHeight,
          borderlessImageData: built.borderlessImageData,
          previewImageData: built.preview.data,
          previewWidth: built.preview.width,
          previewHeight: built.preview.height,
          contentType: "image/png",
          width: built.width,
          height: built.height,
          ...(projection ? { projection } : {}),
          revision: sql`${mapRasters.revision} + 1`,
          updatedBy: session.user.id,
          updatedAt: new Date(),
        },
      })
      .returning({ revision: mapRasters.revision });
    await tx
      .insert(mapRasterBorderLayers)
      .values({
        mapId,
        campaignId,
        classifications: built.classifications,
        layerColors,
        renderedData: built.renderedData,
        updatedBy: session.user.id,
      })
      .onConflictDoUpdate({
        target: mapRasterBorderLayers.mapId,
        set: {
          classifications: built.classifications,
          layerColors,
          renderedData: built.renderedData,
          revision: sql`${mapRasterBorderLayers.revision} + 1`,
          updatedBy: session.user.id,
          updatedAt: new Date(),
        },
      });
    await tx.insert(auditLogs).values({
      campaignId,
      actorId: session.user.id,
      action: mode === "upload" ? "UPLOAD_PIXEL_MAP_2X" : "SAVE_PIXEL_MAP",
      targetType: "CAMPAIGN_MAP",
      targetId: mapId,
      afterSummary: {
        sourceWidth: built.sourceWidth,
        sourceHeight: built.sourceHeight,
        width: built.width,
        height: built.height,
        temporaryCountries: newCountries.length,
        automaticBorders: built.generatedBorderCounts,
        projection: projection ?? currentRaster?.projection,
        rasterRevision: raster.revision,
      },
      reason:
        mode === "upload"
          ? "원본 지도 국가 자동 등록 및 2×2 픽셀 확대"
          : "픽셀 지도 편집 저장 및 자동 국경 재생성",
    });
    return raster.revision;
  });

  return Response.json({
    revision: rasterRevision,
    width: built.width,
    height: built.height,
    temporaryCountries: newCountries.length,
  });
}
