export const WORLD_CITY_SOURCE = "GHS_WUP_MTUC_R2025A_V1_1";
export const WORLD_CITY_POPULATION_YEAR = 2042;

export const WORLD_CITY_TSV_HEADERS = [
  "source_id",
  "name",
  "name_ko",
  "country_m49",
  "country_name",
  "latitude",
  "longitude",
  "population",
  "population_year",
  "urban_area_km2",
  "built_up_area_km2",
  "is_capital",
  "size_class",
  "wup_calibrated",
  "plausibility",
] as const;

export type WorldCityImportRow = {
  id: string;
  source: string;
  sourceId: string;
  name: string;
  nameKo: string | null;
  countryM49: string;
  countryName: string;
  latitude: number;
  longitude: number;
  population: number;
  populationYear: number;
  urbanAreaKm2: string;
  builtUpAreaKm2: string;
  isCapital: boolean;
  sizeClass: number;
  populationPlausibility: number;
  wupCalibrated: boolean;
};

function parseNumber(value: string, field: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid ${field}: ${value}`);
  return parsed;
}

function parseInteger(value: string, field: string) {
  const parsed = parseNumber(value, field);
  if (!Number.isInteger(parsed)) throw new Error(`Invalid ${field}: ${value}`);
  return parsed;
}

function parseFlag(value: string, field: string) {
  if (value === "0") return false;
  if (value === "1") return true;
  throw new Error(`Invalid ${field}: ${value}`);
}

export function parseWorldCityTsv(input: string): WorldCityImportRow[] {
  const lines = input.split(/\r?\n/).filter((line) => line.length > 0);
  const header = lines.shift()?.split("\t") ?? [];
  if (header.join("\t") !== WORLD_CITY_TSV_HEADERS.join("\t")) {
    throw new Error("Unexpected world city TSV header");
  }

  return lines.map((line, index) => {
    const values = line.split("\t");
    if (values.length !== WORLD_CITY_TSV_HEADERS.length) {
      throw new Error(`Invalid world city row ${index + 2}`);
    }
    const [
      sourceId,
      name,
      nameKo,
      countryM49,
      countryName,
      latitudeValue,
      longitudeValue,
      populationValue,
      populationYearValue,
      urbanAreaKm2,
      builtUpAreaKm2,
      isCapitalValue,
      sizeClassValue,
      wupCalibratedValue,
      plausibilityValue,
    ] = values;
    const latitude = parseNumber(latitudeValue, "latitude");
    const longitude = parseNumber(longitudeValue, "longitude");
    const population = parseInteger(populationValue, "population");
    const populationYear = parseInteger(populationYearValue, "population year");
    const sizeClass = parseInteger(sizeClassValue, "size class");
    const populationPlausibility = parseInteger(plausibilityValue, "plausibility");

    if (!sourceId || !name || !countryName || !/^\d{3}$/.test(countryM49)) {
      throw new Error(`Invalid world city identity at row ${index + 2}`);
    }
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      throw new Error(`Invalid world city coordinate at row ${index + 2}`);
    }
    if (population < 0 || populationYear !== WORLD_CITY_POPULATION_YEAR) {
      throw new Error(`Invalid world city population at row ${index + 2}`);
    }
    if (
      parseNumber(urbanAreaKm2, "urban area") < 0 ||
      parseNumber(builtUpAreaKm2, "built-up area") < 0
    ) {
      throw new Error(`Invalid world city area at row ${index + 2}`);
    }
    if (
      sizeClass < 1 ||
      sizeClass > 7 ||
      populationPlausibility < 0 ||
      populationPlausibility > 3
    ) {
      throw new Error(`Invalid world city classification at row ${index + 2}`);
    }

    return {
      id: `ghsl-wup-r2025a-v1-1:${sourceId}`,
      source: WORLD_CITY_SOURCE,
      sourceId,
      name,
      nameKo: nameKo || null,
      countryM49,
      countryName,
      latitude,
      longitude,
      population,
      populationYear,
      urbanAreaKm2,
      builtUpAreaKm2,
      isCapital: parseFlag(isCapitalValue, "capital flag"),
      sizeClass,
      populationPlausibility,
      wupCalibrated: parseFlag(wupCalibratedValue, "WUP flag"),
    };
  });
}
