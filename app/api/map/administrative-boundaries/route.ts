import { sql } from "drizzle-orm";
import { getSession } from "@/src/auth/session";
import { db } from "@/src/db";
import { getActiveCampaign } from "@/src/db/queries/viewer";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const campaign = await getActiveCampaign();
  if (!campaign) return Response.json({ error: "NO_ACTIVE_CAMPAIGN" }, { status: 404 });

  const url = new URL(request.url);
  const longitude = Number(url.searchParams.get("lon"));
  const latitude = Number(url.searchParams.get("lat"));
  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    longitude < -180 ||
    longitude > 180 ||
    latitude < -90 ||
    latitude > 90
  ) {
    return Response.json({ error: "INVALID_POINT" }, { status: 400 });
  }

  const rows = await db.execute<{ id: string; level: 1 | 2; geometry: string }>(sql`
    WITH point AS (
      SELECT ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326) AS geometry
    ), selected AS (
      SELECT boundary.id, boundary.parent_id, boundary.level, boundary.geometry
      FROM world_administrative_divisions AS boundary
      CROSS JOIN point
      WHERE boundary.level IN (1, 2)
        AND ST_Covers(boundary.geometry, point.geometry)
      ORDER BY boundary.level DESC, ST_Area(boundary.geometry) ASC
      LIMIT 1
    ), visible AS (
      SELECT selected.id, selected.level, selected.geometry
      FROM selected
      UNION ALL
      SELECT parent.id, parent.level, parent.geometry
      FROM selected
      INNER JOIN world_administrative_divisions AS parent
        ON selected.level = 2
       AND parent.id = selected.parent_id
    )
    SELECT
      visible.id,
      visible.level,
      ST_AsGeoJSON(visible.geometry, 5) AS geometry
    FROM visible
    ORDER BY visible.level ASC
  `);
  return Response.json(
    {
      boundaries: rows.map((row) => ({
        id: row.id,
        level: row.level,
        geometry: JSON.parse(row.geometry) as unknown,
      })),
    },
    { headers: { "Cache-Control": "private, no-cache" } },
  );
}
