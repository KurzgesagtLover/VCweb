import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import sharp from "sharp";
import { getSession } from "@/src/auth/session";
import { db } from "@/src/db";
import { getActiveCampaign } from "@/src/db/queries/viewer";
import {
  applyBorderLayerSettings,
  borderClassificationsSchema,
  borderLayerColorsSchema,
  borderLayerKind,
  borderLayerKindSchema,
  DEFAULT_BORDER_LAYER_COLORS,
  type BorderClassification,
} from "@/src/domain/map/border-palette";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_WIDTHS = [1024, 2048, 4096];
const MAX_INPUT_PIXELS = 16_384 * 8_192;
const CACHE_LIMIT = 16;
const TEXTURE_PIPELINE_VERSION = 3;

type Crop = { left: number; top: number; width: number; height: number };

const textureCache = new Map<string, Uint8Array>();

function cacheTexture(key: string, data: Uint8Array) {
  textureCache.set(key, data);
  while (textureCache.size > CACHE_LIMIT) {
    const oldest = textureCache.keys().next().value;
    if (oldest === undefined) break;
    textureCache.delete(oldest);
  }
}

function parseCrop(url: URL): Crop | null | "invalid" {
  const names = ["left", "top", "width", "height"] as const;
  const present = names.filter((name) => url.searchParams.has(name));
  if (!present.length) return null;
  if (present.length !== names.length) return "invalid";

  const [left, top, width, height] = names.map((name) => Number(url.searchParams.get(name)));
  if (
    ![left, top, width, height].every(Number.isFinite) ||
    left < 0 ||
    top < 0 ||
    width <= 0 ||
    height <= 0 ||
    left + width > 1.000001 ||
    top + height > 1.000001
  ) {
    return "invalid";
  }
  return { left, top, width, height };
}

function parseVisibleLayers(url: URL) {
  return (url.searchParams.get("layers") ?? "")
    .split(",")
    .map((value) => borderLayerKindSchema.safeParse(value))
    .filter((value) => value.success)
    .map((value) => value.data);
}

function copyVisibleBorders(base: Uint8Array, overlay: Uint8Array) {
  const output = new Uint8Array(base);
  for (let offset = 0; offset < output.length; offset += 4) {
    if (overlay[offset + 3] === 0) continue;
    output[offset] = overlay[offset];
    output[offset + 1] = overlay[offset + 1];
    output[offset + 2] = overlay[offset + 2];
    output[offset + 3] = 255;
  }
  return output;
}

function savedLayerColors(rows: BorderClassification[]) {
  const colors = { ...DEFAULT_BORDER_LAYER_COLORS };
  for (const row of rows) {
    const layer = borderLayerKind(row.kind);
    if (layer) colors[layer] = row.displayColor.toUpperCase();
  }
  return colors;
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const campaign = await getActiveCampaign();
  if (!campaign) return Response.json({ error: "NO_ACTIVE_CAMPAIGN" }, { status: 404 });

  const url = new URL(request.url);
  const mapId = url.searchParams.get("mapId") ?? "";
  const requestedWidth = Number(url.searchParams.get("size") ?? "2048");
  const targetWidth = ALLOWED_WIDTHS.includes(requestedWidth) ? requestedWidth : 2048;
  const visibleLayers = parseVisibleLayers(url);
  const crop = parseCrop(url);
  if (!/^[0-9a-f-]{36}$/i.test(mapId)) {
    return Response.json({ error: "INVALID_MAP" }, { status: 400 });
  }
  if (crop === "invalid") {
    return Response.json({ error: "INVALID_CROP" }, { status: 400 });
  }

  const rows = await db.execute<{
    imageData: Buffer;
    borderlessImageData: Buffer | null;
    width: number;
    height: number;
    revision: number;
    borderRevision: number | null;
    classifications: unknown;
    layerColors: unknown;
  }>(sql`
    SELECT
      raster.image_data AS "imageData",
      raster.borderless_image_data AS "borderlessImageData",
      raster.width,
      raster.height,
      raster.revision,
      border.revision AS "borderRevision",
      border.classifications,
      border.layer_colors AS "layerColors"
    FROM map_rasters raster
    INNER JOIN campaign_maps map ON map.id = raster.map_id
    LEFT JOIN map_raster_border_layers border ON border.map_id = raster.map_id
    WHERE raster.map_id = ${mapId}
      AND raster.campaign_id = ${campaign.id}
      AND map.position <= ${campaign.mapCount}
    LIMIT 1
  `);
  const raster = rows.at(0);
  if (!raster) return Response.json({ error: "MAP_IMAGE_NOT_FOUND" }, { status: 404 });

  const cropKey = crop
    ? [crop.left, crop.top, crop.width, crop.height].map((value) => value.toFixed(6)).join(":")
    : "full";
  const cacheKey = `${TEXTURE_PIPELINE_VERSION}:${mapId}:${raster.revision}:${raster.borderRevision ?? 0}:${visibleLayers.join("-") || "clean"}:${targetWidth}:${cropKey}`;
  const cached = textureCache.get(cacheKey);
  const etag = createHash("sha1").update(cacheKey).digest("hex").slice(0, 16);
  if (cached) {
    return new Response(cached as BodyInit, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=86400, immutable",
        ETag: `"map-globe-texture-${etag}"`,
      },
    });
  }

  const extract = crop
    ? {
        left: Math.max(0, Math.min(raster.width - 1, Math.floor(crop.left * raster.width))),
        top: Math.max(0, Math.min(raster.height - 1, Math.floor(crop.top * raster.height))),
        width: 0,
        height: 0,
      }
    : null;
  if (extract && crop) {
    const right = Math.max(
      extract.left + 1,
      Math.min(raster.width, Math.ceil((crop.left + crop.width) * raster.width)),
    );
    const bottom = Math.max(
      extract.top + 1,
      Math.min(raster.height, Math.ceil((crop.top + crop.height) * raster.height)),
    );
    extract.width = right - extract.left;
    extract.height = bottom - extract.top;
  }

  const sourceWidth = extract?.width ?? raster.width;
  const sourceHeight = extract?.height ?? raster.height;
  const scale = Math.min(1, targetWidth / Math.max(1, sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const decode = (source: Buffer) => {
    let image = sharp(source, { limitInputPixels: MAX_INPUT_PIXELS, sequentialRead: true });
    if (extract) image = image.extract(extract);
    return image
      .resize(width, height, { fit: "fill", kernel: "nearest" })
      .ensureAlpha()
      .raw()
      .toBuffer();
  };

  let texture: Buffer;
  // 국명 라벨은 텍스처에 굽지 않는다. 평면 라벨을 구체에 감으면 극지방이 늘어나므로
  // /api/map/globe/labels 좌표를 받아 지표면 바로 위의 접평면 객체로 그린다.
  try {
    const classifications = borderClassificationsSchema.safeParse(raster.classifications);
    const layerColors = borderLayerColorsSchema.safeParse(raster.layerColors);
    if (classifications.success && raster.borderlessImageData) {
      const [base, marked] = await Promise.all([
        decode(raster.borderlessImageData),
        decode(raster.imageData),
      ]);
      const overlay = applyBorderLayerSettings(
        marked,
        classifications.data,
        visibleLayers,
        layerColors.success ? layerColors.data : savedLayerColors(classifications.data),
      );
      texture = await sharp(copyVisibleBorders(base, overlay), {
        raw: { width, height, channels: 4 },
      })
        .png({ compressionLevel: 6 })
        .toBuffer();
    } else {
      const source = visibleLayers.length
        ? raster.imageData
        : (raster.borderlessImageData ?? raster.imageData);
      texture = await sharp(await decode(source), {
        raw: { width, height, channels: 4 },
      })
        .png({ compressionLevel: 6 })
        .toBuffer();
    }
  } catch {
    return Response.json({ error: "TEXTURE_FAILED" }, { status: 500 });
  }

  const body = new Uint8Array(texture);
  cacheTexture(cacheKey, body);
  return new Response(body as BodyInit, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=86400, immutable",
      ETag: `"map-globe-texture-${etag}"`,
    },
  });
}
