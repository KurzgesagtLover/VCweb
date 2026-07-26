import {
  UNITS,
  cellToBoundary,
  cellToChildren,
  cellToLatLng,
  getHexagonAreaAvg,
  getRes0Cells,
} from "h3-js";
import { eq, sql } from "drizzle-orm";
import { db, sqlClient } from "../src/db";
import { campaignMaps, campaigns, countries, mapCells, mapOwnership } from "../src/db/schema";
import { GLOBAL_MAP_H3_RESOLUTION } from "../src/domain/map/grid";

const resolution = GLOBAL_MAP_H3_RESOLUTION;
const chunkSize = 750;
type Point = [number, number];

function clipAtAntimeridian(points: Point[], keepLeft: boolean) {
  const result: Point[] = [];
  const inside = ([longitude]: Point) => (keepLeft ? longitude <= 180 : longitude >= 180);
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const previous = points[(index + points.length - 1) % points.length];
    const currentInside = inside(current);
    const previousInside = inside(previous);
    if (currentInside !== previousInside) {
      const ratio = (180 - previous[0]) / (current[0] - previous[0]);
      result.push([180, previous[1] + ratio * (current[1] - previous[1])]);
    }
    if (currentInside) result.push(current);
  }
  return result;
}

function ringWkt(points: Point[]) {
  const closed = [...points, points[0]];
  return `((${closed.map(([longitude, latitude]) => `${longitude.toFixed(7)} ${latitude.toFixed(7)}`).join(",")}))`;
}

function cellWkt(cellId: string) {
  const boundary = cellToBoundary(cellId, true) as Point[];
  const longitudes = boundary.map(([longitude]) => longitude);
  const crosses = Math.max(...longitudes) - Math.min(...longitudes) > 180;
  if (!crosses) return `MULTIPOLYGON(${ringWkt(boundary)})`;
  const shifted = boundary.map(
    ([longitude, latitude]) => [longitude < 0 ? longitude + 360 : longitude, latitude] as Point,
  );
  const left = clipAtAntimeridian(shifted, true);
  const right = clipAtAntimeridian(shifted, false).map(
    ([longitude, latitude]) => [longitude - 360, latitude] as Point,
  );
  const polygons = [left, right].filter((ring) => ring.length >= 3).map(ringWkt);
  return `MULTIPOLYGON(${polygons.join(",")})`;
}

async function generate() {
  const campaign = await db.query.campaigns.findFirst({ where: eq(campaigns.isActive, true) });
  if (!campaign) throw new Error("활성 캠페인을 먼저 시드해 주세요.");
  let campaignMap = await db.query.campaignMaps.findFirst({
    where: eq(campaignMaps.campaignId, campaign.id),
  });
  if (!campaignMap) {
    [campaignMap] = await db
      .insert(campaignMaps)
      .values({
        campaignId: campaign.id,
        position: 1,
        name: "지도 1",
        revision: campaign.mapRevision,
        administrativeDivisionRevision: campaign.administrativeDivisionRevision,
      })
      .returning();
  }
  const existing = await db.select({ count: sql<number>`count(*)::int` }).from(mapCells);
  if (existing[0].count > 0) {
    console.log(`Global map already exists: ${existing[0].count.toLocaleString()} cells.`);
    return;
  }
  const countryRows = await db.query.countries.findMany({
    where: eq(countries.campaignId, campaign.id),
  });
  if (!countryRows.length) throw new Error("국가 시드가 필요합니다.");
  const cellIds = getRes0Cells().flatMap((cell) => cellToChildren(cell, resolution));
  const averageArea = getHexagonAreaAvg(resolution, UNITS.km2).toFixed(4);
  console.log(
    `Generating ${cellIds.length.toLocaleString()} H3 cells at resolution ${resolution}.`,
  );

  for (let offset = 0; offset < cellIds.length; offset += chunkSize) {
    const chunk = cellIds.slice(offset, offset + chunkSize);
    await db
      .insert(mapCells)
      .values(
        chunk.map((cellId, localIndex) => {
          const [latitude, longitude] = cellToLatLng(cellId);
          return {
            id: cellId,
            q: offset + localIndex,
            r: resolution,
            geometry: sql`ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_GeomFromText(${cellWkt(cellId)}, 4326)), 3))`,
            centerLatitude: latitude.toFixed(7),
            centerLongitude: longitude.toFixed(7),
            areaKm2: averageArea,
            isLand: true,
          };
        }),
      )
      .onConflictDoNothing({ target: mapCells.id });
    if (offset % (chunkSize * 40) === 0) {
      console.log(
        `${Math.min(offset + chunk.length, cellIds.length).toLocaleString()} / ${cellIds.length.toLocaleString()}`,
      );
    }
  }

  const revision = Math.max(1, campaignMap.revision + 1);
  for (let offset = 0; offset < cellIds.length; offset += chunkSize) {
    const chunk = cellIds.slice(offset, offset + chunkSize);
    await db
      .insert(mapOwnership)
      .values(
        chunk.map((cellId) => {
          const [, longitude] = cellToLatLng(cellId);
          const sector = Math.min(
            countryRows.length - 1,
            Math.floor(((longitude + 180) / 360) * countryRows.length),
          );
          return {
            campaignId: campaign.id,
            mapId: campaignMap.id,
            revision,
            cellId,
            countryId: countryRows[sector].id,
          };
        }),
      )
      .onConflictDoNothing({
        target: [mapOwnership.mapId, mapOwnership.revision, mapOwnership.cellId],
      });
  }
  await db
    .update(campaignMaps)
    .set({ revision, updatedAt: new Date() })
    .where(eq(campaignMaps.id, campaignMap.id));
  await db
    .update(campaigns)
    .set({ mapRevision: revision, updatedAt: new Date() })
    .where(eq(campaigns.id, campaign.id));
  console.log(`Global map ready: ${cellIds.length.toLocaleString()} cells, revision ${revision}.`);
}

generate().finally(() => sqlClient.end());
