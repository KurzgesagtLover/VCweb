import { describe, expect, it } from "vitest";
import { CHINA_2042_SCENARIO } from "../../src/domain/development/china-2042";
import { COUNTRY_TRACKS, DEVELOPMENT_PROGRESS_BOUNDARY } from "../../src/domain/development/tracks";

describe("China 2042 scenario", () => {
  it("provides one valid value for every country track", () => {
    expect(Object.keys(CHINA_2042_SCENARIO.tracks).sort()).toEqual(
      COUNTRY_TRACKS.map(({ key }) => key).sort(),
    );

    for (const definition of COUNTRY_TRACKS) {
      const state = CHINA_2042_SCENARIO.tracks[definition.key];
      expect(state.stage).toBeGreaterThanOrEqual(1);
      expect(state.stage).toBeLessThanOrEqual(definition.stages.length);
      expect(Number(state.progress)).toBeGreaterThanOrEqual(-DEVELOPMENT_PROGRESS_BOUNDARY);
      expect(Number(state.progress)).toBeLessThanOrEqual(DEVELOPMENT_PROGRESS_BOUNDARY);
    }
  });

  it("includes the Chinese flag and the forecast reference year", () => {
    expect(CHINA_2042_SCENARIO.referenceYear).toBe(2042);
    expect(CHINA_2042_SCENARIO.country.flag).toBe("/flags/china.svg");
    expect(CHINA_2042_SCENARIO.demographic.population).toBe("1300000000");
    expect(CHINA_2042_SCENARIO.economic.referenceYear).toBe(2042);
    expect(CHINA_2042_SCENARIO.sectors).toHaveLength(8);
    expect(CHINA_2042_SCENARIO.sectors.some((sector) => sector.code === "GMF")).toBe(true);
    expect(
      CHINA_2042_SCENARIO.sectors.reduce((sum, sector) => sum + Number(sector.share), 0),
    ).toBeCloseTo(1, 8);
    expect(Number(CHINA_2042_SCENARIO.companyScale.largeEnterpriseCount)).toBeGreaterThan(0);
    expect(Number(CHINA_2042_SCENARIO.companyScale.mediumEnterpriseCount)).toBeGreaterThan(0);
    expect(Number(CHINA_2042_SCENARIO.companyScale.smallEnterpriseCount)).toBeGreaterThan(0);
    expect(CHINA_2042_SCENARIO.companyFinancials).toHaveLength(3);
    expect(
      CHINA_2042_SCENARIO.companyFinancials.every(
        (row) =>
          Number(row.totalRevenue) > 0 &&
          Number(row.totalNetIncome) > 0 &&
          Number(row.automationProductivityGrowthRate) > 0,
      ),
    ).toBe(true);
    expect(CHINA_2042_SCENARIO.parties).toHaveLength(6);
  });
});
