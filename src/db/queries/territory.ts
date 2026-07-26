import { and, asc, desc, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db } from "@/src/db";
import { administrativeDivisionRequests, administrativeDivisions } from "@/src/db/schema";
import { GLOBAL_MAP_H3_RESOLUTION } from "@/src/domain/map/grid";

export async function getCountryTerritory(
  campaignId: string,
  mapId: string,
  countryId: string,
  mapRevision: number,
) {
  const [summaryRows, divisions, requests] = await Promise.all([
    db.execute<{
      cellCount: number;
      areaKm2: string;
      centerLatitude: string | null;
      centerLongitude: string | null;
    }>(sql`
      WITH latest AS (
        SELECT DISTINCT ON (cell_id) cell_id, country_id
        FROM map_ownership
        WHERE map_id = ${mapId}
          AND revision <= ${mapRevision}
        ORDER BY cell_id, revision DESC
      )
      SELECT
        COUNT(*)::int AS "cellCount",
        COALESCE(SUM(cell.area_km2), 0)::text AS "areaKm2",
        AVG(cell.center_latitude)::text AS "centerLatitude",
        AVG(cell.center_longitude)::text AS "centerLongitude"
      FROM latest
      INNER JOIN map_cells cell ON cell.id = latest.cell_id
      WHERE latest.country_id = ${countryId}
        AND cell.r = ${GLOBAL_MAP_H3_RESOLUTION}
    `),
    db.query.administrativeDivisions.findMany({
      where: and(
        eq(administrativeDivisions.countryId, countryId),
        eq(administrativeDivisions.level, 1),
      ),
      orderBy: [asc(administrativeDivisions.name)],
    }),
    db.query.administrativeDivisionRequests.findMany({
      where: eq(administrativeDivisionRequests.countryId, countryId),
      orderBy: [desc(administrativeDivisionRequests.createdAt)],
    }),
  ]);
  const summary = summaryRows.at(0);
  return {
    summary: {
      cellCount: summary?.cellCount ?? 0,
      areaKm2: summary?.areaKm2 ?? "0",
      centerLatitude: summary?.centerLatitude,
      centerLongitude: summary?.centerLongitude,
    },
    divisions,
    requests,
  };
}
