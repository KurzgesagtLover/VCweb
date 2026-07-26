import { describe, expect, it } from "vitest";
import { DEFAULT_ECONOMY_RULES, type EconomyInput } from "../../src/domain/economy/calculator";
import {
  defaultEconomyProjectionSettings,
  runEconomyProjection,
} from "../../src/domain/economy/simulator";

const baseline: EconomyInput = {
  population: "30000000",
  fertilityRate: "1.7",
  populationGrowthRate: "0.004",
  medianAge: "40",
  lifeExpectancy: "81",
  migrationShock: "0",
  realGdp: "1500000",
  nominalGdp: "1560000",
  realGdpGrowth: "0.03",
  gdpDeflator: "1.04",
  realGni: "1515000",
  realGnp: "1510000",
  wealth: "6200000",
  foreignReserves: "250000",
  currencyValue: "1.02",
  creditScore: "74",
  incomeGini: "0.34",
  wealthGini: "0.58",
  inflationRate: "0.028",
  landPriceGrowth: "0.035",
  unemploymentRate: "0.052",
  governmentRevenue: "315000",
  governmentSpending: "340000",
  previousGovernmentSpending: "330000",
  nationalDebt: "720000",
  policyRate: "0.035",
  currentAccountToGdp: "0.018",
  productivityIndex: "104",
  educationIndex: "0.74",
  researchInvestmentRate: "0.031",
  stateCapacity: "68",
  structuralReform: "0",
  externalShock: "0",
  sectorShareWeightedGrowth: "0.034",
  sectorProductivity: "106",
  financialHealth: "72",
  corporateHealth: "69",
};

describe("admin economy simulator", () => {
  it("runs a detached multi-turn projection without mutating the ledger input", () => {
    const before = structuredClone(baseline);
    const settings = defaultEconomyProjectionSettings(baseline, 20);
    const projection = runEconomyProjection(baseline, settings, DEFAULT_ECONOMY_RULES);

    expect(projection.points).toHaveLength(21);
    expect(baseline).toEqual(before);
    expect(
      projection.points.every((point) =>
        Object.values(point).every((value) => Number.isFinite(value)),
      ),
    ).toBe(true);
  });

  it("keeps the current-state baseline separate from an edited scenario", () => {
    const defaults = defaultEconomyProjectionSettings(baseline, 12);
    const currentState = runEconomyProjection(baseline, defaults, DEFAULT_ECONOMY_RULES);
    const scenario = runEconomyProjection(
      baseline,
      {
        ...defaults,
        taxRate: "0.3",
        governmentSpendingGrowth: "0.04",
        policyRate: "0.08",
        researchInvestmentRate: "0.05",
        externalShock: "-0.08",
        shockDuration: 2,
      },
      DEFAULT_ECONOMY_RULES,
    );

    expect(scenario.points).toHaveLength(currentState.points.length);
    expect(scenario.points.at(-1)).not.toEqual(currentState.points.at(-1));
  });

  it("bounds hostile form values before running the model", () => {
    const defaults = defaultEconomyProjectionSettings(baseline);
    const projection = runEconomyProjection(
      baseline,
      {
        ...defaults,
        turns: 9999,
        taxRate: "8",
        governmentSpendingGrowth: "-4",
        policyRate: "9",
        externalShock: "-99",
        shockDuration: 9999,
        educationIndex: "30",
        stateCapacity: "-200",
      },
      DEFAULT_ECONOMY_RULES,
    );

    expect(projection.settings.turns).toBe(200);
    expect(projection.settings.shockDuration).toBe(200);
    expect(projection.settings.taxRate).toBe("1");
    expect(projection.settings.governmentSpendingGrowth).toBe("-0.5");
    expect(projection.settings.policyRate).toBe("0.35");
    expect(projection.settings.externalShock).toBe("-2");
    expect(projection.settings.educationIndex).toBe("1");
    expect(projection.settings.stateCapacity).toBe("0");
    expect(projection.points).toHaveLength(201);
  });
});
