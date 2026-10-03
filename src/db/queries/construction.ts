import { and, count, desc, eq, gte, inArray, isNull, or } from "drizzle-orm";
import sharp from "sharp";
import { db } from "@/src/db";
import {
  campaignCities,
  cityBuildings,
  cityConstructionProjects,
  mapRasterColorAssignments,
  mapRasters,
  worldCities,
} from "@/src/db/schema";
import {
  DEFAULT_CITY_SLOT_CAPACITY,
  MIN_CONSTRUCTION_CITY_POPULATION,
} from "@/src/domain/construction/catalog";
import {
  boundsFit,
  parseMapProjection,
  projectionFit,
  projectToUv,
} from "@/src/domain/map/projection";
import { detectMapBounds, quantizedHex } from "@/src/ui/globe-core";

export type ConstructionCity = {
  id: string;
  cityId: string;
  name: string;
  population: number;
  populationYear: number;
  isCapital: boolean;
  latitude: number;
  longitude: number;
  slotCapacity: number;
};

export type ConstructionBuilding = {
  id: string;
  campaignCityId: string;
  buildingType: string;
  level: number;
  damagedLevels: number;
};

export type ConstructionProject = {
  id: string;
  campaignCityId: string;
  buildingType: string;
  targetLevel: number;
  queuePosition: number;
  progress: string;
  requiredWork: string;
  status: string;
};

function assignmentKey(color: string) {
  const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color.trim());
  if (!match) return color.toUpperCase();
  return quantizedHex(
    Number.parseInt(match[1], 16),
    Number.parseInt(match[2], 16),
    Number.parseInt(match[3], 16),
  );
}

function sampleCountryAround(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  assignments: Map<string, string>,
  u: number,
  v: number,
) {
  if (u < 0 || u > 1 || v < 0 || v > 1) return null;
  const centerX = Math.round(u * (width - 1));
  const centerY = Math.round(v * (height - 1));
  const counts = new Map<string, number>();
  const offsets = [
    [0, 0],
    [-2, 0],
    [2, 0],
    [0, -2],
    [0, 2],
    [-3, -3],
    [3, -3],
    [-3, 3],
    [3, 3],
  ] as const;
  for (const [offsetX, offsetY] of offsets) {
    const x = Math.max(0, Math.min(width - 1, centerX + offsetX));
    const y = Math.max(0, Math.min(height - 1, centerY + offsetY));
    const index = (y * width + x) * 4;
    if (data[index + 3] < 128) continue;
    const countryId = assignments.get(quantizedHex(data[index], data[index + 1], data[index + 2]));
    if (countryId) counts.set(countryId, (counts.get(countryId) ?? 0) + 1);
  }
  return [...counts].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
}

/** 최초 1회 도시 좌표를 현재 캠페인 지도 색상에 대조해 도시 소유권을 구성한다. */
export async function ensureCampaignCities(campaignId: string, mapId: string) {
  const [existing] = await db
    .select({ value: count() })
    .from(campaignCities)
    .where(eq(campaignCities.campaignId, campaignId));
  if (Number(existing?.value ?? 0) > 0) return;

  const [raster, colorRows, cities] = await Promise.all([
    db.query.mapRasters.findFirst({
      where: and(eq(mapRasters.mapId, mapId), eq(mapRasters.campaignId, campaignId)),
    }),
    db
      .select({ colorHex: mapRasterColorAssignments.colorHex, countryId: mapRasterColorAssignments.countryId })
      .from(mapRasterColorAssignments)
      .where(
        and(
          eq(mapRasterColorAssignments.mapId, mapId),
          eq(mapRasterColorAssignments.campaignId, campaignId),
        ),
      ),
    db
      .select({
        id: worldCities.id,
        longitude: worldCities.longitude,
        latitude: worldCities.latitude,
      })
      .from(worldCities),
  ]);
  if (!raster || !colorRows.length || !cities.length) return;

  const source = raster.borderlessImageData ?? raster.imageData;
  const decoded = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const samplerData = new Uint8ClampedArray(
    decoded.data.buffer,
    decoded.data.byteOffset,
    decoded.data.byteLength,
  );
  const sampler = { data: samplerData, width: decoded.info.width, height: decoded.info.height };
  const projection = parseMapProjection(raster.projection);
  const bounds = detectMapBounds(sampler);
  const fit = bounds
    ? boundsFit(bounds, sampler.width, sampler.height)
    : projectionFit(projection, sampler.width, sampler.height);
  const assignments = new Map(colorRows.map((row) => [assignmentKey(row.colorHex), row.countryId]));
  const values = cities.flatMap((city) => {
    const uv = projectToUv(projection, city.longitude, city.latitude, fit);
    const countryId = sampleCountryAround(
      sampler.data,
      sampler.width,
      sampler.height,
      assignments,
      uv.u,
      uv.v,
    );
    return countryId
      ? [
          {
            campaignId,
            cityId: city.id,
            ownerCountryId: countryId,
            controllerCountryId: countryId,
            slotCapacity: DEFAULT_CITY_SLOT_CAPACITY,
          },
        ]
      : [];
  });

  for (let offset = 0; offset < values.length; offset += 1_000) {
    await db
      .insert(campaignCities)
      .values(values.slice(offset, offset + 1_000))
      .onConflictDoNothing();
  }
}

export async function getCountryConstruction(campaignId: string, mapId: string, countryId: string) {
  await ensureCampaignCities(campaignId, mapId);
  const controlledByCountry = and(
    eq(campaignCities.campaignId, campaignId),
    or(
      eq(campaignCities.controllerCountryId, countryId),
      and(
        eq(campaignCities.ownerCountryId, countryId),
        isNull(campaignCities.controllerCountryId),
      ),
    ),
  );
  const cities = await db
    .select({
      id: campaignCities.id,
      cityId: campaignCities.cityId,
      name: worldCities.nameKo,
      fallbackName: worldCities.name,
      population: worldCities.population,
      populationYear: worldCities.populationYear,
      isCapital: worldCities.isCapital,
      latitude: worldCities.latitude,
      longitude: worldCities.longitude,
      slotCapacity: campaignCities.slotCapacity,
    })
    .from(campaignCities)
    .innerJoin(worldCities, eq(campaignCities.cityId, worldCities.id))
    .where(
      and(
        controlledByCountry,
        gte(worldCities.population, MIN_CONSTRUCTION_CITY_POPULATION),
      ),
    )
    .orderBy(desc(worldCities.isCapital), desc(worldCities.population));
  const cityIds = cities.map((city) => city.id);
  if (!cityIds.length) return { cities: [], buildings: [], projects: [] };

  const [buildings, projects] = await Promise.all([
    db
      .select({
        id: cityBuildings.id,
        campaignCityId: cityBuildings.campaignCityId,
        buildingType: cityBuildings.buildingType,
        level: cityBuildings.level,
        damagedLevels: cityBuildings.damagedLevels,
      })
      .from(cityBuildings)
      .where(inArray(cityBuildings.campaignCityId, cityIds)),
    db
      .select({
        id: cityConstructionProjects.id,
        campaignCityId: cityConstructionProjects.campaignCityId,
        buildingType: cityConstructionProjects.buildingType,
        targetLevel: cityConstructionProjects.targetLevel,
        queuePosition: cityConstructionProjects.queuePosition,
        progress: cityConstructionProjects.progress,
        requiredWork: cityConstructionProjects.requiredWork,
        status: cityConstructionProjects.status,
      })
      .from(cityConstructionProjects)
      .where(
        and(
          inArray(cityConstructionProjects.campaignCityId, cityIds),
          inArray(cityConstructionProjects.status, ["QUEUED", "ACTIVE", "PAUSED"]),
        ),
      ),
  ]);

  return {
    cities: cities.map(({ name, fallbackName, ...city }) => ({
      ...city,
      name: name?.trim() || fallbackName,
    })) as ConstructionCity[],
    buildings: buildings as ConstructionBuilding[],
    projects: projects as ConstructionProject[],
  };
}
