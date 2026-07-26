import sharp from "sharp";
import { and, eq, sql } from "drizzle-orm";
import { db, sqlClient } from "../src/db";
import {
  campaignMaps,
  campaigns,
  mapRasterColorAssignments,
  mapRasters,
  users,
} from "../src/db/schema";
import { getMapCellCandidates, resolveCellValue } from "../src/domain/map/hierarchy";

const WIDTH = 16_384;
const HEIGHT = 8_192;

type OwnershipRow = {
  cellId: string;
  countryId: string | null;
  revision: number;
};

type GeoJsonGeometry = {
  type: "Polygon" | "MultiPolygon";
  coordinates: number[][][] | number[][][][];
};

type BoundaryRow = {
  countryId: string;
  color: string;
  geometry: string;
};

function quantizedColor(color: string) {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16));
  return `#${channels
    .map((channel) => (channel & 0xf8).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

function point([longitude, latitude]: number[]) {
  const x = ((longitude + 180) / 360) * WIDTH;
  const y = ((90 - latitude) / 180) * HEIGHT;
  return `${x.toFixed(2)} ${y.toFixed(2)}`;
}

function ringPath(ring: number[][]) {
  if (!ring.length) return "";
  return `M ${point(ring[0])} ${ring
    .slice(1)
    .map((coordinate) => `L ${point(coordinate)}`)
    .join(" ")} Z`;
}

function geometryPath(geometry: GeoJsonGeometry) {
  const polygons =
    geometry.type === "Polygon"
      ? [geometry.coordinates as number[][][]]
      : (geometry.coordinates as number[][][][]);
  return polygons.flatMap((polygon) => polygon.map(ringPath)).join(" ");
}

async function generate() {
  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.isActive, true),
  });
  if (!campaign) throw new Error("활성 캠페인을 찾을 수 없습니다.");
  const map = await db.query.campaignMaps.findFirst({
    where: and(eq(campaignMaps.campaignId, campaign.id), eq(campaignMaps.position, 1)),
  });
  if (!map) throw new Error("기본 세계 지도를 찾을 수 없습니다.");

  const [baseCells, ownershipRows, admin] = await Promise.all([
    db.execute<{ cellId: string }>(sql`
      SELECT id AS "cellId"
      FROM map_cells
      WHERE r = 4
      ORDER BY id
    `),
    db.execute<OwnershipRow>(sql`
      SELECT DISTINCT ON (cell_id)
        cell_id AS "cellId",
        country_id AS "countryId",
        revision
      FROM map_ownership
      WHERE map_id = ${map.id}
        AND revision <= ${map.revision}
      ORDER BY cell_id, revision DESC
    `),
    db.query.users.findFirst({ where: eq(users.role, "ADMIN") }),
  ]);
  if (!admin) throw new Error("지도 생성 기록에 사용할 관리자가 없습니다.");

  const ownershipByCell = new Map(ownershipRows.map((row) => [row.cellId, row]));
  const effective = baseCells.map(({ cellId }) => ({
    cell_id: cellId,
    country_id: resolveCellValue(getMapCellCandidates(cellId), ownershipByCell)?.countryId ?? null,
  }));
  const effectiveJson = JSON.stringify(effective);

  console.log(`${effective.length.toLocaleString()}개 셀의 최신 영토를 병합합니다.`);
  const boundaries = await db.execute<BoundaryRow>(sql`
    WITH effective AS (
      SELECT record.cell_id, record.country_id
      FROM jsonb_to_recordset(${effectiveJson}::text::jsonb) AS record(
        cell_id text,
        country_id uuid
      )
    ), merged AS (
      SELECT
        effective.country_id,
        ST_SimplifyPreserveTopology(
          ST_UnaryUnion(ST_Collect(cell.geometry)),
          0.006
        ) AS geometry
      FROM effective
      INNER JOIN map_cells cell ON cell.id = effective.cell_id
      WHERE effective.country_id IS NOT NULL
      GROUP BY effective.country_id
    )
    SELECT
      country.id::text AS "countryId",
      country.color,
      ST_AsGeoJSON(merged.geometry)::text AS geometry
    FROM merged
    INNER JOIN countries country ON country.id = merged.country_id
    ORDER BY country.id
  `);

  const paths = boundaries
    .map((row) => {
      const geometry = JSON.parse(row.geometry) as GeoJsonGeometry;
      return `<path d="${geometryPath(geometry)}" fill="${quantizedColor(row.color)}" />`;
    })
    .join("");
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
      <rect width="100%" height="100%" fill="#050507" />
      <g fill-rule="evenodd" shape-rendering="crispEdges">${paths}</g>
    </svg>
  `;

  console.log("16K PNG를 렌더링합니다.");
  const png = await sharp(Buffer.from(svg), { limitInputPixels: WIDTH * HEIGHT })
    .png({ palette: true, colors: 64, compressionLevel: 9, effort: 10 })
    .toBuffer();

  await db.transaction(async (tx) => {
    await tx
      .insert(mapRasters)
      .values({
        mapId: map.id,
        campaignId: map.campaignId,
        imageData: png,
        contentType: "image/png",
        width: WIDTH,
        height: HEIGHT,
        updatedBy: admin.id,
      })
      .onConflictDoUpdate({
        target: mapRasters.mapId,
        set: {
          imageData: png,
          contentType: "image/png",
          width: WIDTH,
          height: HEIGHT,
          revision: sql`${mapRasters.revision} + 1`,
          updatedBy: admin.id,
          updatedAt: new Date(),
        },
      });
    await tx.delete(mapRasterColorAssignments).where(eq(mapRasterColorAssignments.mapId, map.id));
    if (boundaries.length) {
      await tx.insert(mapRasterColorAssignments).values(
        boundaries.map((row) => ({
          campaignId: map.campaignId,
          mapId: map.id,
          colorHex: quantizedColor(row.color),
          countryId: row.countryId,
          updatedBy: admin.id,
        })),
      );
    }
  });

  console.log(
    `16K 픽셀 지도 생성 완료: ${WIDTH}×${HEIGHT}, ${(png.byteLength / 1024 / 1024).toFixed(1)}MB`,
  );
}

generate().finally(() => sqlClient.end());
