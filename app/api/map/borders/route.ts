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
  const mapId = new URL(request.url).searchParams.get("mapId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(mapId)) {
    return Response.json({ error: "INVALID_MAP" }, { status: 400 });
  }
  const rows = await db.execute<{ renderedData: Buffer; revision: number }>(sql`
    SELECT border.rendered_data AS "renderedData", border.revision
    FROM map_raster_border_layers border
    INNER JOIN campaign_maps map ON map.id = border.map_id
    WHERE border.map_id = ${mapId}
      AND border.campaign_id = ${campaign.id}
      AND map.position <= ${campaign.mapCount}
    LIMIT 1
  `);
  const layer = rows.at(0);
  if (!layer) return Response.json({ error: "BORDER_LAYER_NOT_FOUND" }, { status: 404 });
  return new Response(new Uint8Array(layer.renderedData) as BodyInit, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=300",
      ETag: `"map-borders-${layer.revision}"`,
    },
  });
}
