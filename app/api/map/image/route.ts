import { sql } from "drizzle-orm";
import { getSession } from "@/src/auth/session";
import { db } from "@/src/db";
import { getActiveCampaign } from "@/src/db/queries/viewer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const campaign = await getActiveCampaign();
  if (!campaign) return Response.json({ error: "NO_ACTIVE_CAMPAIGN" }, { status: 404 });
  const url = new URL(request.url);
  const mapId = url.searchParams.get("mapId") ?? "";
  const showBorders = url.searchParams.get("borders") !== "0";
  if (!/^[0-9a-f-]{36}$/i.test(mapId)) {
    return Response.json({ error: "INVALID_MAP" }, { status: 400 });
  }
  const rows = await db.execute<{
    imageData: Buffer;
    borderlessImageData: Buffer | null;
    contentType: string;
    revision: number;
  }>(sql`
    SELECT
      raster.image_data AS "imageData",
      raster.borderless_image_data AS "borderlessImageData",
      raster.content_type AS "contentType",
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
  const imageData =
    showBorders || !raster.borderlessImageData ? raster.imageData : raster.borderlessImageData;
  return new Response(new Uint8Array(imageData) as BodyInit, {
    headers: {
      "Content-Type": raster.contentType,
      "Cache-Control": "private, max-age=300",
      ETag: `"map-raster-${raster.revision}-${showBorders ? "borders" : "clean"}"`,
    },
  });
}
