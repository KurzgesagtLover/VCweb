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
  povertyRate: "0.1",
  agriculturalProductivityIndex: "102",
  foodSelfSufficiency: "0.82",
  industrialCapitalStockIndex: "105",
  researchCapacityIndex: "106",
  educationIndex: "0.74",
  researchInvestmentRate: "0.031",
  publicInvestmentRate: "0.05",
  educationSpendingRate: "0.04",
  welfareSpendingRate: "0.05",
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
        Object.values(point)
          .filter((value): value is number => typeof value === "number")
          .every((value) => Number.isFinite(value)),
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
        incomeTaxRate: "0.3",
        corporateTaxRate: "0.25",
        otherTaxRate: "0.2",
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
        incomeTaxRate: "8",
        corporateTaxRate: "9",
        otherTaxRate: "10",
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
    expect(projection.settings.incomeTaxRate).toBe("0.75");
    expect(projection.settings.corporateTaxRate).toBe("0.75");
    expect(projection.settings.otherTaxRate).toBe("0.75");
    expect(projection.settings.governmentSpendingGrowth).toBe("-0.5");
    expect(projection.settings.policyRate).toBe("0.35");
    expect(projection.settings.externalShock).toBe("-2");
    expect(projection.settings.educationIndex).toBe("1");
    expect(projection.settings.stateCapacity).toBe("0");
    expect(projection.points).toHaveLength(201);
  });

  it("distinguishes advanced and developing economic structures", () => {
    const developing: EconomyInput = {
      ...baseline,
      population: "90000000",
      realGdp: "450000",
      nominalGdp: "480000",
      productivityIndex: "70",
      educationIndex: "0.48",
      stateCapacity: "38",
      creditScore: "42",
      financialHealth: "43",
      corporateHealth: "45",
    };
    const advanced = runEconomyProjection(
      baseline,
      defaultEconomyProjectionSettings(baseline, 20),
      DEFAULT_ECONOMY_RULES,
    );
    const emerging = runEconomyProjection(
      developing,
      defaultEconomyProjectionSettings(developing, 20),
      DEFAULT_ECONOMY_RULES,
    );

    expect(advanced.points[0]?.developmentStage).toBe("ADVANCED");
    expect(emerging.points[0]?.developmentStage).toBe("DEVELOPING");
    expect(advanced.points.at(-1)?.realGdpIndex).not.toBe(emerging.points.at(-1)?.realGdpIndex);
  });

  it("applies approved multi-turn effects and reports plan progress", () => {
    const settings = defaultEconomyProjectionSettings(baseline, 8);
    const projection = runEconomyProjection(baseline, settings, DEFAULT_ECONOMY_RULES, {
      modifiers: [
        {
          id: "growth-policy",
          metric: "realGdpGrowth",
          operation: "ADD",
          value: "0.015",
          startTurnOffset: 0,
          durationTurns: 6,
        },
      ],
      goals: [
        {
          id: "growth-goal",
          label: "성장률 목표",
          metric: "realGdpGrowth",
          baselineValue: "0.03",
          latestValue: "0.03",
          targetValue: "0.04",
          targetTurn: 8,
        },
      ],
    });
    const withoutPolicy = runEconomyProjection(baseline, settings, DEFAULT_ECONOMY_RULES);

    expect(projection.points[1]?.realGdpGrowth).toBeGreaterThan(
      withoutPolicy.points[1]?.realGdpGrowth ?? 0,
    );
    expect(projection.goalResults).toHaveLength(1);
    expect(Number.isFinite(projection.goalResults[0]?.progress)).toBe(true);
  });
});
