import Decimal from "decimal.js";
import { z } from "zod";

const decimalString = z
  .string()
  .trim()
  .min(1)
  .refine((value) => {
    try {
      return new Decimal(value).isFinite();
    } catch {
      return false;
    }
  }, "유효한 숫자를 입력하세요.");

export const quickCountrySetupSchema = z.object({
  countryName: z.string().trim().min(2).max(80),
  flag: z.string().trim().min(1).max(32),
  capital: z.string().trim().min(1).max(80),
  governmentForm: z.string().trim().min(2).max(100),
  headOfState: z.string().trim().min(1).max(80),
  population: decimalString.refine(
    (value) => new Decimal(value).gt(0),
    "인구는 0보다 커야 합니다.",
  ),
  totalAreaKm2: decimalString.refine(
    (value) => new Decimal(value).gt(0),
    "면적은 0보다 커야 합니다.",
  ),
  realGdp: decimalString.refine((value) => new Decimal(value).gt(0), "GDP는 0보다 커야 합니다."),
  currencyCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3,5}$/),
  currencyValue: decimalString.refine(
    (value) => new Decimal(value).gt(0),
    "화폐가치는 0보다 커야 합니다.",
  ),
  majorIndustries: z.string().trim().min(2).max(300),
});

export type QuickCountrySetup = z.infer<typeof quickCountrySetupSchema>;

export function deriveCountrySetup(
  input: Pick<QuickCountrySetup, "population" | "totalAreaKm2" | "realGdp">,
) {
  const population = new Decimal(input.population);
  const area = new Decimal(input.totalAreaKm2);
  const gdp = new Decimal(input.realGdp);

  return {
    gdpPerCapita: gdp.div(population).toDecimalPlaces(2).toString(),
    populationDensity: population.div(area).toDecimalPlaces(4).toString(),
    landAreaKm2: area.toDecimalPlaces(3).toString(),
  };
}

export function withinRelativeTolerance(actual: string, expected: string, tolerance = "0.005") {
  const a = new Decimal(actual);
  const e = new Decimal(expected);
  if (e.isZero()) return a.isZero();
  return a.minus(e).abs().div(e.abs()).lte(tolerance);
}
