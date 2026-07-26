import { and, eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { getSession } from "@/src/auth/session";
import { db } from "@/src/db";
import { auditLogs, campaignMaps, mapRasterBorderLayers, mapRasters } from "@/src/db/schema";
import { removeBlackBorders } from "@/src/domain/map/raster-territory";
import { actionRateLimiter } from "@/src/services/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_RASTER_WIDTH = 16_384;
const MAX_RASTER_HEIGHT = 8_192;
const MAX_RASTER_PIXELS = MAX_RASTER_WIDTH * MAX_RASTER_HEIGHT;

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
  if (!(file instanceof File) || file.size === 0 || file.size > 100 * 1024 * 1024) {
    return Response.json({ error: "100MB 이하 이미지 파일을 선택하세요." }, { status: 400 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(campaignId) || !/^[0-9a-f-]{36}$/i.test(mapId)) {
    return Response.json({ error: "잘못된 지도 정보입니다." }, { status: 400 });
  }

  const campaignMap = await db.query.campaignMaps.findFirst({
    where: and(eq(campaignMaps.id, mapId), eq(campaignMaps.campaignId, campaignId)),
  });
  if (!campaignMap) {
    return Response.json({ error: "지도를 찾을 수 없습니다." }, { status: 404 });
  }

  let png: Buffer;
  let borderlessPng: Buffer;
  let width = 0;
  let height = 0;
  let sourceWidth = 0;
  let sourceHeight = 0;
  try {
    const input = Buffer.from(await file.arrayBuffer());
    const source = sharp(input, { limitInputPixels: MAX_RASTER_PIXELS });
    const metadata = await source.metadata();
    sourceWidth = metadata.width ?? 0;
    sourceHeight = metadata.height ?? 0;
    if (!sourceWidth || !sourceHeight) throw new Error("INVALID_SIZE");

    width = mode === "upload" ? sourceWidth * 2 : sourceWidth;
    height = mode === "upload" ? sourceHeight * 2 : sourceHeight;
    if (
      width > MAX_RASTER_WIDTH ||
      height > MAX_RASTER_HEIGHT ||
      width * height > MAX_RASTER_PIXELS
    ) {
      throw new Error("TOO_LARGE");
    }

    png = await source
      .resize(width, height, { fit: "fill", kernel: sharp.kernel.nearest })
      .ensureAlpha()
      .png({ compressionLevel: 9 })
      .toBuffer();
    const decoded = await sharp(png)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const cleaned = removeBlackBorders(decoded.data, width, height);
    borderlessPng = await sharp(cleaned, {
      raw: { width, height, channels: 4 },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === "TOO_LARGE";
    return Response.json(
      {
        error: tooLarge
          ? "2배 확장 후 최대 16384×8192를 넘을 수 없습니다."
          : "PNG, JPEG 또는 WebP 이미지를 읽을 수 없습니다.",
      },
      { status: 400 },
    );
  }

  const [raster] = await db
    .insert(mapRasters)
    .values({
      mapId,
      campaignId,
      imageData: png,
      borderlessImageData: borderlessPng,
      contentType: "image/png",
      width,
      height,
      updatedBy: session.user.id,
    })
    .onConflictDoUpdate({
      target: mapRasters.mapId,
      set: {
        imageData: png,
        borderlessImageData: borderlessPng,
        contentType: "image/png",
        width,
        height,
        revision: sql`${mapRasters.revision} + 1`,
        updatedBy: session.user.id,
        updatedAt: new Date(),
      },
    })
    .returning({ revision: mapRasters.revision });

  if (mode === "upload") {
    await db.delete(mapRasterBorderLayers).where(eq(mapRasterBorderLayers.mapId, mapId));
  }
  await db.insert(auditLogs).values({
    campaignId,
    actorId: session.user.id,
    action: mode === "upload" ? "UPLOAD_PIXEL_MAP_2X" : "SAVE_PIXEL_MAP",
    targetType: "CAMPAIGN_MAP",
    targetId: mapId,
    afterSummary: {
      sourceWidth,
      sourceHeight,
      width,
      height,
      pixelExpansion: mode === "upload" ? 4 : 1,
      rasterRevision: raster.revision,
    },
    reason: mode === "upload" ? "평면 픽셀 지도 2×2 최근접 확장" : "평면 픽셀 지도 편집 저장",
  });
  return Response.json({ revision: raster.revision, width, height });
}
