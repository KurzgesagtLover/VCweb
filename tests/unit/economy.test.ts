import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import {
  calculateEconomy,
  ECONOMIC_INPUT_PATHS,
  type EconomyInput,
} from "../../src/domain/economy/calculator";

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

describe("deterministic economy calculator", () => {
  it("produces deterministic, accounting-consistent values", () => {
    const a = calculateEconomy(baseline);
    const b = calculateEconomy(baseline);
    expect(a).toEqual(b);
    expect(
      new Decimal(a.fiscalBalance).eq(new Decimal(a.governmentRevenue).minus(a.governmentSpending)),
    ).toBe(true);
    expect(new Decimal(a.debtToGdp).eq(new Decimal(a.nationalDebt).div(a.nominalGdp))).toBe(true);
    expect(new Decimal(a.realGdpGrowth).gte("-0.25")).toBe(true);
    expect(new Decimal(a.realGdpGrowth).lte("0.30")).toBe(true);
  });

  it("clamps severe recession and overheating growth", () => {
    expect(calculateEconomy({ ...baseline, externalShock: "-2" }).realGdpGrowth).toBe("-0.25");
    expect(calculateEconomy({ ...baseline, externalShock: "2" }).realGdpGrowth).toBe("0.3");
  });

  it("has a tested output path for every declared input", () => {
    const baseResult = JSON.stringify(calculateEconomy(baseline));
    for (const key of ECONOMIC_INPUT_PATHS) {
      const original = new Decimal(baseline[key]);
      const delta = original.isZero()
        ? new Decimal("0.01")
        : original.abs().mul("0.013").plus("0.000001");
      const changed = { ...baseline, [key]: original.plus(delta).toString() };
      expect(JSON.stringify(calculateEconomy(changed)), `${key} has no influence path`).not.toBe(
        baseResult,
      );
    }
  });

  it("never emits negative money, population, or debt in a downturn", () => {
    const result = calculateEconomy({
      ...baseline,
      realGdp: "10",
      nominalGdp: "11",
      wealth: "1",
      foreignReserves: "1",
      governmentRevenue: "0",
      governmentSpending: "100",
      nationalDebt: "0",
      externalShock: "-0.8",
    });
    for (const key of [
      "population",
      "realGdp",
      "nominalGdp",
      "wealth",
      "foreignReserves",
      "nationalDebt",
    ] as const)
      expect(new Decimal(result[key]).gte(0)).toBe(true);
  });

  it("transmits monetary tightening into lower growth and inflation", () => {
    const loose = calculateEconomy({ ...baseline, policyRate: "0.01" });
    const tight = calculateEconomy({ ...baseline, policyRate: "0.12" });
    expect(new Decimal(tight.realGdpGrowth).lt(loose.realGdpGrowth)).toBe(true);
    expect(new Decimal(tight.landPriceGrowth).lt(loose.landPriceGrowth)).toBe(true);
  });

  it("transmits fiscal expansion into demand and debt", () => {
    const neutral = calculateEconomy({
      ...baseline,
      governmentSpending: "330000",
      previousGovernmentSpending: "330000",
    });
    const expansion = calculateEconomy({
      ...baseline,
      governmentSpending: "380000",
      previousGovernmentSpending: "330000",
    });
    expect(new Decimal(expansion.realGdpGrowth).gt(neutral.realGdpGrowth)).toBe(true);
    expect(new Decimal(expansion.nationalDebt).gt(neutral.nationalDebt)).toBe(true);
  });

  it("propagates weak financial and corporate balance sheets", () => {
    const healthy = calculateEconomy({ ...baseline, financialHealth: "85", corporateHealth: "82" });
    const stressed = calculateEconomy({
      ...baseline,
      financialHealth: "25",
      corporateHealth: "30",
    });
    expect(new Decimal(stressed.realGdpGrowth).lt(healthy.realGdpGrowth)).toBe(true);
    expect(stressed.creditScore).toBeLessThan(healthy.creditScore);
  });

  it("applies diminishing returns to productivity gains", () => {
    const low = new Decimal(
      calculateEconomy({ ...baseline, productivityIndex: "100" }).realGdpGrowth,
    );
    const middle = new Decimal(
      calculateEconomy({ ...baseline, productivityIndex: "120" }).realGdpGrowth,
    );
    const high = new Decimal(
      calculateEconomy({ ...baseline, productivityIndex: "140" }).realGdpGrowth,
    );

    expect(middle.minus(low).gt(high.minus(middle))).toBe(true);
  });

  it("makes negative external shocks stronger than equal positive shocks", () => {
    const neutral = new Decimal(
      calculateEconomy({ ...baseline, externalShock: "0" }).realGdpGrowth,
    );
    const boom = new Decimal(
      calculateEconomy({ ...baseline, externalShock: "0.04" }).realGdpGrowth,
    );
    const slump = new Decimal(
      calculateEconomy({ ...baseline, externalShock: "-0.04" }).realGdpGrowth,
    );

    expect(neutral.minus(slump).gt(boom.minus(neutral))).toBe(true);
  });

  it("reduces the fiscal multiplier under high debt and tight real rates", () => {
    const fiscalEffect = (input: EconomyInput) => {
      const neutral = calculateEconomy({
        ...input,
        governmentSpending: "330000",
        previousGovernmentSpending: "330000",
      });
      const expansion = calculateEconomy({
        ...input,
        governmentSpending: "380000",
        previousGovernmentSpending: "330000",
      });
      return new Decimal(expansion.realGdpGrowth).minus(neutral.realGdpGrowth);
    };

    const healthy = fiscalEffect({ ...baseline, nationalDebt: "400000", policyRate: "0.015" });
    const constrained = fiscalEffect({ ...baseline, nationalDebt: "2000000", policyRate: "0.18" });
    expect(healthy.gt(constrained)).toBe(true);
  });

  it("rewards productivity and education as complementary inputs", () => {
    const productivityEffect = (educationIndex: string) => {
      const base = calculateEconomy({ ...baseline, productivityIndex: "100", educationIndex });
      const improved = calculateEconomy({ ...baseline, productivityIndex: "110", educationIndex });
      return new Decimal(improved.realGdpGrowth).minus(base.realGdpGrowth);
    };

    expect(productivityEffect("0.9").gt(productivityEffect("0.5"))).toBe(true);
  });
});
