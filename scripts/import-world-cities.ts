import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { db, sqlClient } from "@/src/db";
import { worldCities } from "@/src/db/schema";
import { parseWorldCityTsv, WORLD_CITY_SOURCE } from "@/src/domain/map/world-city-data";

const DEFAULT_INPUT = resolve("data/cities/ghsl-wup-r2025a-v1-1-2042.tsv");
const BATCH_SIZE = 500;

async function importWorldCities() {
  const inputPath = resolve(process.argv[2] ?? DEFAULT_INPUT);
  const cities = parseWorldCityTsv(await readFile(inputPath, "utf8"));
  if (cities.length < 2_000)
    throw new Error(`Expected at least 2,000 cities, received ${cities.length}`);

  for (let start = 0; start < cities.length; start += BATCH_SIZE) {
    await db
      .insert(worldCities)
      .values(cities.slice(start, start + BATCH_SIZE))
      .onConflictDoUpdate({
        target: worldCities.id,
        set: {
          source: sql`excluded.source`,
          sourceId: sql`excluded.source_id`,
          name: sql`excluded.name`,
          nameKo: sql`excluded.name_ko`,
          countryM49: sql`excluded.country_m49`,
          countryName: sql`excluded.country_name`,
          latitude: sql`excluded.latitude`,
          longitude: sql`excluded.longitude`,
          population: sql`excluded.population`,
          populationYear: sql`excluded.population_year`,
          urbanAreaKm2: sql`excluded.urban_area_km2`,
          builtUpAreaKm2: sql`excluded.built_up_area_km2`,
          isCapital: sql`excluded.is_capital`,
          sizeClass: sql`excluded.size_class`,
          populationPlausibility: sql`excluded.population_plausibility`,
          wupCalibrated: sql`excluded.wup_calibrated`,
          updatedAt: new Date(),
        },
      });
  }

  console.log(
    `Imported ${cities.length.toLocaleString("en-US")} cities from ${WORLD_CITY_SOURCE}.`,
  );
}

importWorldCities().finally(() => sqlClient.end());
