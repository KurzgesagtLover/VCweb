import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import sharp from "sharp";
import { getSession } from "@/src/auth/session";
import { db } from "@/src/db";
import { getActiveCampaign } from "@/src/db/queries/viewer";
import {
  applyBorderLayerSettings,
  borderClassificationsSchema,
  borderLayerKindSchema,
  DEFAULT_BORDER_LAYER_COLORS,
  type BorderLayerKind,
} from "@/src/domain/map/border-palette";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requestedColor(url: URL, kind: BorderLayerKind) {
  const value = url.searchParams.get(`color-${kind.toLowerCase()}`);
  return value && /^[0-9a-f]{6}$/i.test(value)
    ? `#${value.toUpperCase()}`
    : DEFAULT_BORDER_LAYER_COLORS[kind];
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const campaign = await getActiveCampaign();
  if (!campaign) return Response.json({ error: "NO_ACTIVE_CAMPAIGN" }, { status: 404 });
  const url = new URL(request.url);
  const mapId = url.searchParams.get("mapId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(mapId)) {
    return Response.json({ error: "INVALID_MAP" }, { status: 400 });
  }
  const rows = await db.execute<{
    renderedData: Buffer;
    imageData: Buffer;
    classifications: unknown;
    revision: number;
  }>(sql`
    SELECT border.rendered_data AS "renderedData",
      border.classifications,
      border.revision,
      raster.image_data AS "imageData"
    FROM map_raster_border_layers border
    INNER JOIN campaign_maps map ON map.id = border.map_id
    INNER JOIN map_rasters raster ON raster.map_id = border.map_id
    WHERE border.map_id = ${mapId}
      AND border.campaign_id = ${campaign.id}
      AND map.position <= ${campaign.mapCount}
    LIMIT 1
  `);
  const layer = rows.at(0);
  if (!layer) return Response.json({ error: "BORDER_LAYER_NOT_FOUND" }, { status: 404 });

  const customDisplay = url.searchParams.has("layers");
  if (!customDisplay) {
    return new Response(new Uint8Array(layer.renderedData) as BodyInit, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=300",
        ETag: `"map-borders-${layer.revision}"`,
      },
    });
  }

  const classifications = borderClassificationsSchema.safeParse(layer.classifications);
  if (!classifications.success) {
    return Response.json({ error: "INVALID_BORDER_CONFIGURATION" }, { status: 500 });
  }
  const visibleLayers = (url.searchParams.get("layers") ?? "")
    .split(",")
    .map((value) => borderLayerKindSchema.safeParse(value))
    .filter((value) => value.success)
    .map((value) => value.data);
  const colors: Record<BorderLayerKind, string> = {
    COAST: requestedColor(url, "COAST"),
    LEGAL: requestedColor(url, "LEGAL"),
    ACTIVE: requestedColor(url, "ACTIVE"),
    INACTIVE: requestedColor(url, "INACTIVE"),
  };
  const decoded = await sharp(layer.imageData)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rendered = applyBorderLayerSettings(
    decoded.data,
    classifications.data,
    visibleLayers,
    colors,
  );
  const renderedData = await sharp(rendered, {
    raw: { width: decoded.info.width, height: decoded.info.height, channels: 4 },
  })
    .png({ compressionLevel: 9 })
    .toBuffer();
  const displayKey = createHash("sha1")
    .update(JSON.stringify({ visibleLayers, colors }))
    .digest("hex")
    .slice(0, 12);

  return new Response(new Uint8Array(renderedData) as BodyInit, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=300",
      ETag: `"map-borders-${layer.revision}-${displayKey}"`,
    },
  });
}
