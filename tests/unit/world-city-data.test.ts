import { describe, expect, it } from "vitest";
import {
  parseWorldCityTsv,
  WORLD_CITY_POPULATION_YEAR,
  WORLD_CITY_SOURCE,
  WORLD_CITY_TSV_HEADERS,
} from "@/src/domain/map/world-city-data";

const header = WORLD_CITY_TSV_HEADERS.join("\t");

describe("world city TSV", () => {
  it("parses an imported GHSL city", () => {
    const [city] = parseWorldCityTsv(
      `${header}\n1\tHonolulu\t호놀룰루\t840\tUnited States of America\t21.3329677\t-157.8741396\t627618\t2042\t203.000\t44.940\t0\t3\t0\t3\n`,
    );

    expect(city).toEqual({
      id: "ghsl-wup-r2025a-v1-1:1",
      source: WORLD_CITY_SOURCE,
      sourceId: "1",
      name: "Honolulu",
      nameKo: "호놀룰루",
      countryM49: "840",
      countryName: "United States of America",
      latitude: 21.3329677,
      longitude: -157.8741396,
      population: 627618,
      populationYear: WORLD_CITY_POPULATION_YEAR,
      urbanAreaKm2: "203.000",
      builtUpAreaKm2: "44.940",
      isCapital: false,
      sizeClass: 3,
      populationPlausibility: 3,
      wupCalibrated: false,
    });
  });

  it("rejects coordinates outside WGS84 bounds", () => {
    expect(() =>
      parseWorldCityTsv(
        `${header}\n1\tInvalid\t\t840\tUnited States of America\t91\t0\t50000\t2042\t1\t1\t0\t1\t0\t3\n`,
      ),
    ).toThrow("Invalid world city coordinate");
  });

  it("rejects a snapshot from the wrong population year", () => {
    expect(() =>
      parseWorldCityTsv(
        `${header}\n1\tInvalid\t\t840\tUnited States of America\t0\t0\t50000\t2040\t1\t1\t0\t1\t0\t3\n`,
      ),
    ).toThrow("Invalid world city population");
  });
});
