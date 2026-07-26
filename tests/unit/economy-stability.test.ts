import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculateEconomy, type EconomyInput } from "../../src/domain/economy/calculator";

const baseline: EconomyInput = {
  population: "30000000",
  fertilityRate: "1.7",
  populationGrowthRate: "0.004",
  medianAge: "40",
  lifeExpectancy: "81",
  migrationShock: "0.001",
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
  structuralReform: "0.005",
  externalShock: "-0.002",
  sectorShareWeightedGrowth: "0.034",
  sectorProductivity: "106",
  financialHealth: "72",
  corporateHealth: "69",
};

type EconomyResult = ReturnType<typeof calculateEconomy>;

function nextInput(input: EconomyInput, result: EconomyResult, externalShock = "0"): EconomyInput {
  return {
    ...input,
    population: result.population,
    populationGrowthRate: result.populationGrowthRate,
    realGdp: result.realGdp,
    nominalGdp: result.nominalGdp,
    realGdpGrowth: result.realGdpGrowth,
    gdpDeflator: result.gdpDeflator,
    realGni: result.realGni,
    realGnp: result.realGnp,
    wealth: result.wealth,
    foreignReserves: result.foreignReserves,
    currencyValue: result.currencyValue,
    creditScore: String(result.creditScore),
    incomeGini: result.incomeGini,
    wealthGini: result.wealthGini,
    inflationRate: result.inflationRate,
    landPriceGrowth: result.landPriceGrowth,
    unemploymentRate: result.unemploymentRate,
    governmentRevenue: result.governmentRevenue,
    previousGovernmentSpending: input.governmentSpending,
    governmentSpending: result.governmentSpending,
    nationalDebt: result.nationalDebt,
    policyRate: result.policyRate,
    currentAccountToGdp: result.currentAccountToGdp,
    productivityIndex: result.productivityIndex,
    externalShock,
  };
}

function simulate(initial: EconomyInput, turns: number, persistentShock = false) {
  const results: EconomyResult[] = [];
  let state = initial;
  for (let turn = 0; turn < turns; turn += 1) {
    const result = calculateEconomy(state);
    results.push(result);
    state = nextInput(state, result, persistentShock ? state.externalShock : "0");
  }
  return { results, state };
}

function expectFiniteState(result: EconomyResult, context: string) {
  for (const [key, value] of Object.entries(result)) {
    if (key !== "rulesVersion" && (typeof value === "string" || typeof value === "number")) {
      if (!new Decimal(value).isFinite()) throw new Error(context + ": non-finite " + key);
    }
  }
  for (const key of [
    "population",
    "realGdp",
    "nominalGdp",
    "wealth",
    "foreignReserves",
    "nationalDebt",
  ] as const) {
    if (new Decimal(result[key]).isNegative()) throw new Error(context + ": negative " + key);
  }
}

describe("long-run economy stability", () => {
  it("keeps ordinary and advanced economies away from hard growth bounds", () => {
    const scenarios: Record<string, EconomyInput> = {
      ordinary: baseline,
      advanced: {
        ...baseline,
        productivityIndex: "135",
        educationIndex: "0.92",
        stateCapacity: "88",
        researchInvestmentRate: "0.05",
        structuralReform: "0.015",
        creditScore: "92",
        financialHealth: "90",
        corporateHealth: "88",
      },
    };

    for (const [name, scenario] of Object.entries(scenarios)) {
      const { results } = simulate(scenario, 200);
      for (const [turn, result] of results.entries()) {
        const growth = new Decimal(result.realGdpGrowth);
        expectFiniteState(result, name + " turn " + (turn + 1));
        expect(growth.abs().lt("0.15"), name + " turn " + (turn + 1) + ": " + growth).toBe(true);
        expect(growth.eq("-0.25") || growth.eq("0.3")).toBe(false);
        if (turn >= 20) {
          const inflation = new Decimal(result.inflationRate);
          const unemployment = new Decimal(result.unemploymentRate);
          expect(inflation.gt("-0.1") && inflation.lt("0.5"), name + " inflation lock").toBe(true);
          expect(
            unemployment.gte("0.015") && unemployment.lt("0.6"),
            name + " unemployment lock",
          ).toBe(true);
        }
      }

      const tail = results.slice(-20).map((result) => new Decimal(result.realGdpGrowth));
      const tailRange = Decimal.max(...tail).minus(Decimal.min(...tail));
      expect(tailRange.lt("0.02"), name + " tail range: " + tailRange).toBe(true);
    }
  });

  it("does not accumulate demographic adjustments into runaway population growth", () => {
    const { results } = simulate(baseline, 200);
    const rates = results.map((result) => new Decimal(result.populationGrowthRate));
    expect(Decimal.max(...rates.map((rate) => rate.abs())).lt("0.03")).toBe(true);
    expect(rates.at(-1)?.abs().lt("0.01")).toBe(true);
  });

  it("recovers from a one-off severe external shock without boundary lock", () => {
    const { results } = simulate({ ...baseline, externalShock: "-0.8" }, 80);
    const hardFloorHits = results.filter((result) => result.realGdpGrowth === "-0.25").length;
    const laterGrowth = results.slice(12).map((result) => new Decimal(result.realGdpGrowth));

    expect(hardFloorHits).toBeLessThanOrEqual(1);
    expect(laterGrowth.every((growth) => growth.gt("-0.15") && growth.lt("0.15"))).toBe(true);
    expect(laterGrowth.at(-1)?.abs().lt("0.1")).toBe(true);
  });

  it("keeps stressed macro states finite and releases growth from hard bounds", () => {
    const scenarios: Record<string, EconomyInput> = {
      fragile: {
        ...baseline,
        productivityIndex: "78",
        educationIndex: "0.38",
        stateCapacity: "28",
        researchInvestmentRate: "0.005",
        creditScore: "25",
        financialHealth: "22",
        corporateHealth: "20",
        unemploymentRate: "0.16",
        nationalDebt: "2200000",
        externalShock: "-0.15",
      },
      inflation: {
        ...baseline,
        inflationRate: "0.35",
        policyRate: "0.3",
        landPriceGrowth: "0.25",
        nationalDebt: "3000000",
      },
      recession: {
        ...baseline,
        realGdpGrowth: "-0.18",
        inflationRate: "-0.06",
        unemploymentRate: "0.25",
        externalShock: "-0.2",
        financialHealth: "25",
        corporateHealth: "28",
      },
    };

    for (const [name, scenario] of Object.entries(scenarios)) {
      const { results } = simulate(scenario, 160);
      for (const [turn, result] of results.entries()) {
        expectFiniteState(result, name + " turn " + (turn + 1));
        if (turn >= 12) {
          expect(
            result.realGdpGrowth === "-0.25" || result.realGdpGrowth === "0.3",
            name + " turn " + (turn + 1) + ": " + result.realGdpGrowth,
          ).toBe(false);
          const inflation = new Decimal(result.inflationRate);
          const unemployment = new Decimal(result.unemploymentRate);
          expect(inflation.gt("-0.1") && inflation.lt("0.5"), name + " inflation lock").toBe(true);
          expect(
            unemployment.gte("0.015") && unemployment.lt("0.6"),
            name + " unemployment lock",
          ).toBe(true);
        }
      }
    }
  });

  it("survives a deterministic grid of extreme starting conditions", () => {
    let scenarioId = 0;
    for (const productivityIndex of ["60", "100", "160"]) {
      for (const educationIndex of ["0.25", "0.7", "0.98"]) {
        for (const debtRatio of ["0.1", "1.2", "3"]) {
          for (const inflationRate of ["-0.08", "0.02", "0.35"]) {
            const scenario = {
              ...baseline,
              productivityIndex,
              educationIndex,
              nationalDebt: new Decimal(baseline.nominalGdp).mul(debtRatio).toString(),
              inflationRate,
              policyRate: inflationRate === "0.35" ? "0.35" : "0.02",
              financialHealth: scenarioId % 2 === 0 ? "15" : "95",
              corporateHealth: scenarioId % 2 === 0 ? "18" : "92",
              externalShock: scenarioId % 2 === 0 ? "-0.2" : "0.2",
            };
            const { results } = simulate(scenario, 80);
            for (const [turn, result] of results.entries()) {
              expectFiniteState(result, "grid " + scenarioId + " turn " + (turn + 1));
              if (turn >= 12) {
                expect(
                  result.realGdpGrowth === "-0.25" || result.realGdpGrowth === "0.3",
                  "grid " + scenarioId + " turn " + (turn + 1) + ": " + result.realGdpGrowth,
                ).toBe(false);
              }
            }
            scenarioId += 1;
          }
        }
      }
    }
    expect(scenarioId).toBe(81);
  }, 15_000);
});
