import { describe, expect, it } from "vitest";
import {
  citiesForZoom,
  cityPopulationThreshold,
  type GlobeCitySource,
} from "@/src/ui/globe-cities";

function city(id: string, longitude: number, latitude = 0, population = 1_000_000) {
  return {
    id,
    name: id,
    nameKo: null,
    countryM49: "000",
    longitude,
    latitude,
    population,
    populationYear: 2042,
    isCapital: false,
    sizeClass: 0,
  } satisfies GlobeCitySource;
}

describe("city level of detail", () => {
  it("uses a sparse global level of detail at world scale", () => {
    expect(cityPopulationThreshold(0.92)).toBe(5_000_000);
    expect(cityPopulationThreshold(4)).toBe(100_000);
  });

  it("loads fifty-thousand population cities only at deep zoom", () => {
    expect(cityPopulationThreshold(5)).toBe(100_000);
    expect(cityPopulationThreshold(6)).toBe(50_000);
  });

  it("keeps cities from every part of the globe in the active level", () => {
    const visible = citiesForZoom([city("east", 179), city("west", -179), city("far", 0)], 4);

    expect(visible.map((item) => item.id)).toEqual(["east", "west", "far"]);
  });

  it("filters only by the current zoom level", () => {
    const visible = citiesForZoom(
      [city("large", 126, 37, 2_000_000), city("small", 126, 37, 80_000), city("far", 0)],
      4,
    );

    expect(visible.map((item) => item.id)).toEqual(["large", "far"]);
  });
});
