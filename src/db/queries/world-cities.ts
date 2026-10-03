import { and, desc, gte, lte, or } from "drizzle-orm";
import { db } from "@/src/db";
import { worldCities } from "@/src/db/schema";

export type WorldCityViewport = {
  north: number;
  south: number;
  west: number;
  east: number;
  minPopulation: number;
  limit: number;
};

export async function getWorldCitiesInViewport(viewport: WorldCityViewport) {
  const longitudeFilter =
    viewport.west <= viewport.east
      ? and(gte(worldCities.longitude, viewport.west), lte(worldCities.longitude, viewport.east))
      : or(gte(worldCities.longitude, viewport.west), lte(worldCities.longitude, viewport.east));

  return db
    .select({
      id: worldCities.id,
      name: worldCities.name,
      nameKo: worldCities.nameKo,
      countryM49: worldCities.countryM49,
      latitude: worldCities.latitude,
      longitude: worldCities.longitude,
      population: worldCities.population,
      populationYear: worldCities.populationYear,
      isCapital: worldCities.isCapital,
      sizeClass: worldCities.sizeClass,
    })
    .from(worldCities)
    .where(
      and(
        gte(worldCities.latitude, viewport.south),
        lte(worldCities.latitude, viewport.north),
        longitudeFilter,
        gte(worldCities.population, viewport.minPopulation),
      ),
    )
    .orderBy(desc(worldCities.population))
    .limit(viewport.limit);
}
