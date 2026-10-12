import { describe, expect, it } from "vitest";
import {
  advanceDemography,
  ageGroups,
  COHORT_COUNT,
  fiveYearBands,
  manpowerPool,
  medianAgeOf,
  mortalitySchedule,
  normalizeAgeStructure,
  projectAgeStructure,
  reconcileAgeStructure,
  roundAgeStructure,
  stableAgeStructure,
  totalPopulation,
} from "../../src/domain/demography/age-structure";

const rich = { population: 28_000_000, lifeExpectancy: 81, medianAge: 41.6 };
const young = { population: 40_000_000, lifeExpectancy: 62, medianAge: 18 };

describe("age structure", () => {
  it("calibrates mortality to the target life expectancy", () => {
    for (const lifeExpectancy of [45, 62, 75, 84]) {
      expect(mortalitySchedule(lifeExpectancy).lifeExpectancy).toBeCloseTo(lifeExpectancy, 2);
    }
    const schedule = mortalitySchedule(80);
    expect(schedule.q[0]).toBeGreaterThan(schedule.q[10]);
    expect(schedule.q[90]).toBeGreaterThan(schedule.q[60]);
  });

  it("builds a stable pyramid with the requested size and median age", () => {
    const structure = stableAgeStructure(rich);
    expect(structure).toHaveLength(COHORT_COUNT);
    expect(totalPopulation(structure)).toBeCloseTo(rich.population, 0);
    expect(medianAgeOf(structure)).toBeCloseTo(rich.medianAge, 1);
    const old = ageGroups(structure);
    const youthful = ageGroups(stableAgeStructure(young));
    expect(youthful.childShare).toBeGreaterThan(0.35);
    expect(old.elderlyShare).toBeGreaterThan(youthful.elderlyShare * 5);
  });

  it("shrinks a low-fertility country and grows a high-fertility one", () => {
    const ageing = projectAgeStructure(stableAgeStructure(rich), {
      years: 1,
      fertilityRate: 1.3,
      lifeExpectancy: 81,
    });
    const growing = projectAgeStructure(stableAgeStructure(young), {
      years: 1,
      fertilityRate: 4.5,
      lifeExpectancy: 62,
    });
    expect(ageing.annualGrowthRate).toBeLessThan(0);
    expect(ageing.deaths).toBeGreaterThan(ageing.births);
    expect(growing.annualGrowthRate).toBeGreaterThan(0.015);
  });

  it("matches four quarters with one year", () => {
    const start = stableAgeStructure(rich);
    const year = projectAgeStructure(start, { years: 1, fertilityRate: 1.6, lifeExpectancy: 81 });
    let structure = start;
    for (let quarter = 0; quarter < 4; quarter += 1) {
      structure = projectAgeStructure(structure, {
        years: 0.25,
        fertilityRate: 1.6,
        lifeExpectancy: 81,
      }).structure;
    }
    expect(Math.abs(totalPopulation(structure) / year.population - 1)).toBeLessThan(0.001);
    expect(Math.abs(medianAgeOf(structure) - year.medianAge)).toBeLessThan(0.05);
  });

  it("adds migrants to young adult ages", () => {
    const start = stableAgeStructure(rich);
    const without = projectAgeStructure(start, {
      years: 1,
      fertilityRate: 1.6,
      lifeExpectancy: 81,
    });
    const withMigration = projectAgeStructure(start, {
      years: 1,
      fertilityRate: 1.6,
      lifeExpectancy: 81,
      netMigrationRate: 0.01,
    });
    expect(withMigration.migrants).toBeCloseTo(rich.population * 0.01, -2);
    expect(withMigration.structure[27]).toBeGreaterThan(without.structure[27]);
    expect(withMigration.structure[70]).toBeCloseTo(without.structure[70], 6);
  });

  it("infers net migration from the stored growth rate and keeps it", () => {
    const first = advanceDemography({
      ...rich,
      fertilityRate: 1.6,
      populationGrowthRate: 0.004,
      ageStructure: null,
      netMigrationRate: null,
      years: 1,
    });
    expect(first.source).toBe("SYNTHESIZED");
    expect(first.netMigrationRate).toBeGreaterThan(0);
    expect(first.annualGrowthRate).toBeCloseTo(0.004, 3);
    const second = advanceDemography({
      population: first.population,
      medianAge: first.medianAge,
      lifeExpectancy: 81,
      fertilityRate: 1.6,
      populationGrowthRate: first.annualGrowthRate,
      ageStructure: roundAgeStructure(first.structure),
      netMigrationRate: first.netMigrationRate,
      years: 0.25,
    });
    expect(second.source).toBe("STORED");
    expect(second.netMigrationRate).toBe(first.netMigrationRate);
  });

  it("reconciles stored structures with admin edits", () => {
    const structure = roundAgeStructure(stableAgeStructure(rich));
    expect(
      reconcileAgeStructure({
        structure,
        population: rich.population,
        medianAge: 41.6,
        lifeExpectancy: 81,
      }).source,
    ).toBe("STORED");
    const rescaled = reconcileAgeStructure({
      structure,
      population: rich.population * 1.1,
      medianAge: 41.6,
      lifeExpectancy: 81,
    });
    expect(rescaled.source).toBe("RESCALED");
    expect(totalPopulation(rescaled.structure)).toBeCloseTo(rich.population * 1.1, -1);
    expect(
      reconcileAgeStructure({
        structure,
        population: rich.population,
        medianAge: 30,
        lifeExpectancy: 81,
      }).source,
    ).toBe("REBUILT");
    expect(normalizeAgeStructure([1, 2, 3])).toBeNull();
    expect(normalizeAgeStructure(structure)).toEqual(structure);
  });

  it("caps manpower by fit military-age men and bands the pyramid", () => {
    const structure = stableAgeStructure(rich);
    const groups = ageGroups(structure);
    expect(manpowerPool(structure, 0.01)).toBeCloseTo(groups.total * 0.01, 0);
    expect(manpowerPool(structure, 0.9)).toBeLessThan(groups.militaryAge * 0.52);
    const bands = fiveYearBands(structure);
    expect(bands).toHaveLength(21);
    expect(bands.reduce((sum, band) => sum + band.value, 0)).toBeCloseTo(groups.total, 0);
  });
});
