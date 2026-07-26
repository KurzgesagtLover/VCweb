import { and, eq, sql } from "drizzle-orm";
import {
  cellToChildren,
  cellToLatLng,
  getRes0Cells,
  gridDisk,
  latLngToCell,
  polygonToCells,
} from "h3-js";
import { getSession } from "@/src/auth/session";
import { db } from "@/src/db";
import { campaignMaps } from "@/src/db/schema";
import { getMapCellWkt } from "@/src/domain/map/cells";
import {
  getMapTileResolution,
  getMinimumSafeTileZoom,
  MAP_H3_RESOLUTIONS,
  type MapH3Resolution,
} from "@/src/domain/map/grid";
import { getMapCellCandidates, resolveCellValue } from "@/src/domain/map/hierarchy";
import { getActiveCampaign } from "@/src/db/queries/viewer";

export const dynamic = "force-dynamic";

function tileLongitude(x: number, zoom: number) {
  return (x / 2 ** zoom) * 360 - 180;
}

function tileLatitude(y: number, zoom: number) {
  const mercator = Math.PI * (1 - (2 * y) / 2 ** zoom);
  return (Math.atan(Math.sinh(mercator)) * 180) / Math.PI;
}

function getTileCells(z: number, x: number, y: number, resolution: MapH3Resolution) {
  if (z === 0) {
    return getRes0Cells().flatMap((cellId) => cellToChildren(cellId, resolution));
  }

  const west = tileLongitude(x, z);
  const east = tileLongitude(x + 1, z);
  const north = tileLatitude(y, z);
  const south = tileLatitude(y + 1, z);
  if (z === 1) {
    return getRes0Cells()
      .flatMap((cellId) => cellToChildren(cellId, resolution))
      .filter((cellId) => {
        const [latitude, longitude] = cellToLatLng(cellId);
        return (
          longitude >= west - 5 &&
          longitude <= east + 5 &&
          latitude >= south - 5 &&
          latitude <= north + 5
        );
      });
  }
  const polygon = [
    [
      [west, south],
      [east, south],
      [east, north],
      [west, north],
      [west, south],
    ],
  ];
  const inside = polygonToCells(polygon, resolution, true);
  const centerCell = latLngToCell((north + south) / 2, (west + east) / 2, resolution);
  return [
    ...new Set([
      ...inside,
      ...inside.flatMap((cellId) => gridDisk(cellId, 1)),
      ...gridDisk(centerCell, 2),
    ]),
  ];
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ z: string; x: string; y: string }> },
) {
  const session = await getSession();
  if (!session) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const campaign = await getActiveCampaign();
  if (!campaign) return Response.json({ error: "NO_ACTIVE_CAMPAIGN" }, { status: 404 });
  const requestedMapId = new URL(request.url).searchParams.get("mapId");
  if (requestedMapId && !/^[0-9a-f-]{36}$/i.test(requestedMapId)) {
    return Response.json({ error: "INVALID_MAP" }, { status: 400 });
  }
  const campaignMap = await db.query.campaignMaps.findFirst({
    where: requestedMapId
      ? and(eq(campaignMaps.id, requestedMapId), eq(campaignMaps.campaignId, campaign.id))
      : and(eq(campaignMaps.campaignId, campaign.id), eq(campaignMaps.position, 1)),
  });
  if (!campaignMap || campaignMap.position > campaign.mapCount) {
    return Response.json({ error: "MAP_NOT_FOUND" }, { status: 404 });
  }

  const raw = await params;
  const z = Number(raw.z);
  const x = Number(raw.x);
  const y = Number(raw.y);
  const maxCoordinate = 2 ** z - 1;
  if (
    ![z, x, y].every(Number.isInteger) ||
    z < 0 ||
    z > 12 ||
    x < 0 ||
    y < 0 ||
    x > maxCoordinate ||
    y > maxCoordinate ||
    !MAP_H3_RESOLUTIONS.includes(campaignMap.hexResolution as MapH3Resolution)
  ) {
    return Response.json({ error: "INVALID_TILE" }, { status: 400 });
  }

  const selectedResolution = campaignMap.hexResolution as MapH3Resolution;
  const minimumSafeZoom = getMinimumSafeTileZoom(selectedResolution);
  if (!campaignMap.adaptiveResolution && z < minimumSafeZoom) {
    return new Response(new Uint8Array() as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.mapbox-vector-tile",
        "Cache-Control": "private, max-age=300",
        "X-Map-Tile-Deferred": String(minimumSafeZoom),
      },
    });
  }
  const tileResolution = campaignMap.adaptiveResolution
    ? getMapTileResolution(selectedResolution, z)
    : selectedResolution;
  const cellIds = getTileCells(z, x, y, tileResolution);
  const candidatesByCell = new Map(cellIds.map((cellId) => [cellId, getMapCellCandidates(cellId)]));
  const candidateIds = [...new Set([...candidatesByCell.values()].flat())];
  const candidateIdsJson = JSON.stringify(candidateIds);
  const [ownershipRows, divisionRows] = await Promise.all([
    db.execute<{
      cellId: string;
      countryId: string | null;
      revision: number;
    }>(sql`
      SELECT DISTINCT ON (cell_id)
        cell_id AS "cellId",
        country_id AS "countryId",
        revision
      FROM map_ownership
      WHERE map_id = ${campaignMap.id}
        AND cell_id IN (
          SELECT jsonb_array_elements_text(${candidateIdsJson}::text::jsonb)
        )
        AND revision <= ${campaignMap.revision}
      ORDER BY cell_id, revision DESC
    `),
    db.execute<{
      cellId: string;
      divisionId: string;
      divisionName: string;
      updatedAt: Date;
    }>(sql`
      SELECT
        division_cell.cell_id AS "cellId",
        division_cell.division_id::text AS "divisionId",
        division.name AS "divisionName",
        division_cell.updated_at AS "updatedAt"
      FROM administrative_division_cells division_cell
      INNER JOIN administrative_divisions division ON division.id = division_cell.division_id
      WHERE division_cell.map_id = ${campaignMap.id}
        AND division_cell.cell_id IN (
          SELECT jsonb_array_elements_text(${candidateIdsJson}::text::jsonb)
        )
    `),
  ]);

  const ownershipByCell = new Map(ownershipRows.map((row) => [row.cellId, row]));
  const divisionByCell = new Map(
    divisionRows.map((row) => [
      row.cellId,
      { ...row, revision: new Date(row.updatedAt).getTime() },
    ]),
  );

  const inputRowsJson = JSON.stringify(
    cellIds.map((cellId) => {
      const owner = resolveCellValue(candidatesByCell.get(cellId)!, ownershipByCell);
      const division = resolveCellValue(candidatesByCell.get(cellId)!, divisionByCell);
      return {
        cell_id: cellId,
        country_id: owner?.countryId ?? null,
        division_id: division?.divisionId ?? null,
        is_overview: tileResolution !== selectedResolution,
        geometry_wkt: getMapCellWkt(cellId),
      };
    }),
  );

  const rows = await db.execute<{ tile: Uint8Array | null }>(sql`
    WITH bounds AS (
      SELECT ST_TileEnvelope(${z}, ${x}, ${y}) AS geom_3857
    ), input_rows AS (
      SELECT
        record.cell_id,
        record.country_id,
        record.division_id,
        record.is_overview,
        ST_GeomFromText(record.geometry_wkt, 4326) AS geometry
      FROM jsonb_to_recordset(${inputRowsJson}::text::jsonb) AS record(
        cell_id text,
        country_id uuid,
        division_id text,
        is_overview boolean,
        geometry_wkt text
      )
    ), tile_rows AS (
      SELECT
        input.cell_id,
        false AS is_locked,
        country.code AS country_code,
        country.color AS country_color,
        input.division_id,
        input.is_overview,
        ST_AsMVTGeom(
          ST_Transform(input.geometry, 3857),
          bounds.geom_3857,
          4096,
          64,
          true
        ) AS geom
      FROM input_rows input
      CROSS JOIN bounds
      LEFT JOIN countries country ON country.id = input.country_id
    ), division_rows AS (
      SELECT
        input.division_id,
        MAX(division.name) AS division_name,
        ST_AsMVTGeom(
          ST_Transform(ST_UnaryUnion(ST_Collect(input.geometry)), 3857),
          bounds.geom_3857,
          4096,
          64,
          true
        ) AS geom
      FROM input_rows input
      CROSS JOIN bounds
      LEFT JOIN administrative_divisions division ON division.id = input.division_id::uuid
      WHERE input.division_id IS NOT NULL
      GROUP BY input.division_id, bounds.geom_3857
    )
    SELECT
      COALESCE(
        (SELECT ST_AsMVT(tile_rows, 'hexes', 4096, 'geom') FROM tile_rows),
        decode('', 'hex')
      )
      ||
      COALESCE(
        (SELECT ST_AsMVT(division_rows, 'divisions', 4096, 'geom') FROM division_rows),
        decode('', 'hex')
      )
      AS tile
  `);
  const tile = rows.at(0)?.tile ?? new Uint8Array();
  return new Response(tile as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.mapbox-vector-tile",
      "Cache-Control": "private, max-age=300",
    },
  });
}
