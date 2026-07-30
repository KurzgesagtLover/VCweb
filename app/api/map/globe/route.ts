import { sql } from "drizzle-orm";
import sharp from "sharp";
import { getSession } from "@/src/auth/session";
import { db } from "@/src/db";
import { getActiveCampaign } from "@/src/db/queries/viewer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_WIDTHS = [2048, 4096, 8192];
const CACHE_LIMIT = 6;

/** 구체 텍스처는 요청마다 16K 원본을 축소하면 느리므로 프로세스 메모리에 소량만 캐시한다. */
const textureCache = new Map<string, Uint8Array>();

function cacheTexture(key: string, data: Uint8Array) {
  textureCache.set(key, data);
  while (textureCache.size > CACHE_LIMIT) {
    const oldest = textureCache.keys().next().value;
    if (oldest === undefined) break;
    textureCache.delete(oldest);
  }
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const campaign = await getActiveCampaign();
  if (!campaign) return Response.json({ error: "NO_ACTIVE_CAMPAIGN" }, { status: 404 });

  const url = new URL(request.url);
  const mapId = url.searchParams.get("mapId") ?? "";
  const showBorders = url.searchParams.get("borders") !== "0";
  const requestedWidth = Number(url.searchParams.get("size") ?? "4096");
  const targetWidth = ALLOWED_WIDTHS.includes(requestedWidth) ? requestedWidth : 4096;
  if (!/^[0-9a-f-]{36}$/i.test(mapId)) {
    return Response.json({ error: "INVALID_MAP" }, { status: 400 });
  }

  const rows = await db.execute<{
    imageData: Buffer;
    borderlessImageData: Buffer | null;
    width: number;
    height: number;
    revision: number;
  }>(sql`
    SELECT
      raster.image_data AS "imageData",
      raster.borderless_image_data AS "borderlessImageData",
      raster.width,
      raster.height,
      raster.revision
    FROM map_rasters raster
    INNER JOIN campaign_maps map ON map.id = raster.map_id
    WHERE raster.map_id = ${mapId}
      AND raster.campaign_id = ${campaign.id}
      AND map.position <= ${campaign.mapCount}
    LIMIT 1
  `);
  const raster = rows.at(0);
  if (!raster) return Response.json({ error: "MAP_IMAGE_NOT_FOUND" }, { status: 404 });

  const cacheKey = `${mapId}:${raster.revision}:${showBorders ? "b" : "c"}:${targetWidth}`;
  const cached = textureCache.get(cacheKey);
  if (cached) {
    return new Response(cached as BodyInit, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=86400, immutable",
        ETag: `"map-globe-${cacheKey}"`,
      },
    });
  }

  const source =
    showBorders || !raster.borderlessImageData ? raster.imageData : raster.borderlessImageData;
  const scale = Math.min(1, targetWidth / Math.max(1, raster.width));
  const width = Math.max(1, Math.round(raster.width * scale));
  const height = Math.max(1, Math.round(raster.height * scale));
  let texture: Buffer;
  try {
    texture = await sharp(source, { limitInputPixels: 16_384 * 8_192, sequentialRead: true })
      .resize(width, height, { fit: "fill", kernel: "nearest" })
      .ensureAlpha()
      .png({ compressionLevel: 6 })
      .toBuffer();
  } catch {
    return Response.json({ error: "TEXTURE_FAILED" }, { status: 500 });
  }

  const body = new Uint8Array(texture);
  cacheTexture(cacheKey, body);
  return new Response(body as BodyInit, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=86400, immutable",
      ETag: `"map-globe-${cacheKey}"`,
    },
  });
}
