import { describe, expect, it } from "vitest";
import {
  deriveCountrySetup,
  quickCountrySetupSchema,
  withinRelativeTolerance,
} from "../../src/domain/country/setup";

describe("country setup derivations", () => {
  it("derives per-capita GDP and density with decimal arithmetic", () => {
    expect(
      deriveCountrySetup({
        population: "25000000",
        totalAreaKm2: "125000",
        realGdp: "750000000000",
      }),
    ).toEqual({ gdpPerCapita: "30000", populationDensity: "200", landAreaKm2: "125000" });
  });

  it("rejects invalid quick setup fields", () => {
    const result = quickCountrySetupSchema.safeParse({
      countryName: "A",
      flag: "",
      capital: "",
      governmentForm: "",
      headOfState: "",
      population: "-1",
      totalAreaKm2: "0",
      realGdp: "NaN",
      currencyCode: "12",
      currencyValue: "0",
      majorIndustries: "",
    });
    expect(result.success).toBe(false);
  });

  it("checks relative tolerance without floating-point loss", () => {
    expect(withinRelativeTolerance("100.49", "100", "0.005")).toBe(true);
    expect(withinRelativeTolerance("100.51", "100", "0.005")).toBe(false);
  });
});
