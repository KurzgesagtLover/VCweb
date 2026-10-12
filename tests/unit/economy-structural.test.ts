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
  structuralReform: "0.005",
  externalShock: "-0.002",
  sectorShareWeightedGrowth: "0.034",
  sectorProductivity: "106",
  financialHealth: "72",
  corporateHealth: "69",
};

function unemploymentAfter(turns: number, naturalUnemployment: string) {
  let unemployment = new Decimal(baseline.unemploymentRate);
  for (let index = 0; index < turns; index += 1) {
    const result = calculateEconomy(
      { ...baseline, unemploymentRate: unemployment.toString() },
      undefined,
      { naturalUnemployment },
    );
    unemployment = new Decimal(result.unemploymentRate);
  }
  return unemployment;
}

describe("structural adjustments from laws and budgets", () => {
  it("keeps the default calculation unchanged", () => {
    expect(calculateEconomy(baseline, undefined, {})).toEqual(calculateEconomy(baseline));
  });

  it("shifts potential growth without compounding it", () => {
    const base = calculateEconomy(baseline);
    const boosted = calculateEconomy(baseline, undefined, { potentialGrowth: "0.003" });
    expect(
      new Decimal(boosted.realGdpGrowth).minus(base.realGdpGrowth).toDecimalPlaces(6).toString(),
    ).toBe("0.003");
    expect(boosted.contributions.growth.some((item) => item.source === "policyStructure")).toBe(
      true,
    );
  });

  it("moves the unemployment equilibrium instead of adding to it every year", () => {
    // 기준 입력은 경기 과열 상태라 균형 실업률이 하한 근처에 있으므로 양쪽 모두 하한보다 높게 둔다.
    const higher = unemploymentAfter(40, "0.05");
    const lower = unemploymentAfter(40, "0.04");
    expect(lower.gt("0.015")).toBe(true);
    // 40년 동안 매년 1%p씩 쌓였다면 40%p 차이가 났을 것이다. 균형점만 약 1%p 옮겨져야 한다.
    const gap = higher.minus(lower).toNumber();
    expect(gap).toBeGreaterThan(0.008);
    expect(gap).toBeLessThan(0.013);
  });

  it("adds inflation pressure and revenue efficiency", () => {
    const base = calculateEconomy(baseline);
    const pressured = calculateEconomy(baseline, undefined, { inflationPressure: "0.004" });
    expect(new Decimal(pressured.inflationRate).gt(base.inflationRate)).toBe(true);
    const efficient = calculateEconomy(baseline, undefined, { revenueEfficiency: "0.02" });
    expect(
      new Decimal(efficient.governmentRevenue)
        .div(base.governmentRevenue)
        .toDecimalPlaces(6)
        .toString(),
    ).toBe("1.02");
  });
});
