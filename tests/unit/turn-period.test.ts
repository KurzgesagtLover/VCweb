import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculateEconomy, type EconomyInput } from "../../src/domain/economy/calculator";
import { calculatePoliticalState } from "../../src/domain/policy/model";
import { monthsInTurn } from "../../src/domain/politics/drift";
import { monthsAfterTurnEnd, turnPeriod, yearsBetweenTurnEnds } from "../../src/domain/turn/period";

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

type EconomyResult = ReturnType<typeof calculateEconomy>;

/** 분기 계산 결과를 다음 분기 입력으로 넘긴다. 지출 기준은 1년 전 값을 유지한다. */
function nextQuarterInput(
  input: EconomyInput,
  result: EconomyResult,
  spendingYearAgo: string,
): EconomyInput {
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
    governmentSpending: result.governmentSpending,
    previousGovernmentSpending: spendingYearAgo,
    nationalDebt: result.nationalDebt,
    policyRate: result.policyRate,
    currentAccountToGdp: result.currentAccountToGdp,
    productivityIndex: result.productivityIndex,
    povertyRate: result.povertyRate,
    agriculturalProductivityIndex: result.agriculturalProductivityIndex,
    foodSelfSufficiency: result.foodSelfSufficiency,
    industrialCapitalStockIndex: result.industrialCapitalStockIndex,
    researchCapacityIndex: result.researchCapacityIndex,
  };
}

function relativeGap(a: string, b: string) {
  return new Decimal(a).div(b).minus(1).abs().toNumber();
}

describe("turn period", () => {
  it("measures calendar quarters and years exactly", () => {
    expect(turnPeriod("2087-01-01", "2087-03-31")).toEqual({ days: 90, months: 3, years: 0.25 });
    expect(turnPeriod("2087-04-01", "2087-06-30").months).toBe(3);
    expect(turnPeriod("2080-01-01", "2080-12-31").years).toBe(1);
    expect(monthsInTurn("2087-01-01", "2087-03-31")).toBe(3);
    // 월 경계가 아닌 구간은 일수로 계산한다.
    expect(turnPeriod("2087-01-01", "2087-01-10").days).toBe(10);
    expect(monthsAfterTurnEnd("2087-03-31", "2088-04-01")).toBe(12);
    expect(monthsAfterTurnEnd("2087-03-31", "2087-04-01")).toBe(0);
    expect(yearsBetweenTurnEnds("2086-12-31", "2087-12-31")).toBe(1);
    expect(yearsBetweenTurnEnds("2087-12-31", "2086-12-31")).toBe(0);
  });

  it("keeps the yearly economy identical when the period is one year", () => {
    const legacy = calculateEconomy(baseline);
    const explicit = calculateEconomy(baseline, undefined, {}, { periodYears: 1 });
    expect(explicit).toEqual(legacy);
    expect(legacy.periodYears).toBe("1");
  });

  it("grows a quarter by roughly a quarter of the annual rate", () => {
    const year = calculateEconomy(baseline);
    const quarter = calculateEconomy(baseline, undefined, {}, { periodYears: 0.25 });
    const annualGain = new Decimal(year.realGdp).div(baseline.realGdp).minus(1);
    const quarterGain = new Decimal(quarter.realGdp).div(baseline.realGdp).minus(1);
    expect(quarterGain.toNumber()).toBeGreaterThan(annualGain.mul(0.2).toNumber());
    expect(quarterGain.toNumber()).toBeLessThan(annualGain.mul(0.3).toNumber());
    // 성장률·물가는 연율로 저장한다.
    expect(Number(quarter.realGdpGrowth)).toBeCloseTo(Number(year.realGdpGrowth), 2);
    // 재정 흐름은 분기 몫만 부채에 쌓인다.
    const annualDebtChange = new Decimal(year.nationalDebt).minus(baseline.nationalDebt);
    const quarterDebtChange = new Decimal(quarter.nationalDebt).minus(baseline.nationalDebt);
    expect(quarterDebtChange.abs().toNumber()).toBeLessThan(
      annualDebtChange.abs().mul(0.35).toNumber(),
    );
  });

  it("lands four quarters close to one yearly step", () => {
    // 지출 관성을 빼고 비교한다(지출이 일정하면 1년 전 기준도 같은 값이다).
    const flat = { ...baseline, previousGovernmentSpending: baseline.governmentSpending };
    const year = calculateEconomy(flat);
    let input = flat;
    let result = calculateEconomy(input, undefined, {}, { periodYears: 0.25 });
    for (let quarter = 1; quarter < 4; quarter += 1) {
      input = nextQuarterInput(input, result, result.governmentSpending);
      result = calculateEconomy(input, undefined, {}, { periodYears: 0.25 });
    }
    expect(relativeGap(result.realGdp, year.realGdp)).toBeLessThan(0.01);
    expect(relativeGap(result.population, year.population)).toBeLessThan(0.001);
    expect(relativeGap(result.nationalDebt, year.nationalDebt)).toBeLessThan(0.02);
    expect(Math.abs(Number(result.inflationRate) - Number(year.inflationRate))).toBeLessThan(0.01);
    expect(Math.abs(Number(result.unemploymentRate) - Number(year.unemploymentRate))).toBeLessThan(
      0.01,
    );
    expect(Math.abs(result.creditScore - year.creditScore)).toBeLessThan(2);
  });

  it("splits multi-year turns into yearly steps", () => {
    const first = calculateEconomy(baseline);
    const twoYears = calculateEconomy(baseline, undefined, {}, { periodYears: 2 });
    expect(new Decimal(twoYears.realGdp).gt(first.realGdp)).toBe(true);
    expect(twoYears.periodYears).toBe("2");
  });

  it("annualizes spending growth from an older reference", () => {
    const twoYearGap = calculateEconomy(
      { ...baseline, previousGovernmentSpending: "308000" },
      undefined,
      {},
      { spendingGrowthPeriodYears: 2 },
    );
    // 308000 → 340000 over two years is about 5.07% a year.
    expect(Number(twoYearGap.governmentSpendingGrowth)).toBeCloseTo(0.0507, 3);
  });

  it("scales political adjustment speed with the period", () => {
    const base = {
      currentStability: 40,
      currentPolicySupport: 80,
      governmentApproval: 50,
      stateCapacity: 65,
      unrest: 20,
      realGdpGrowth: 0.04,
      inflationRate: 0.02,
      previousInflationRate: 0.02,
      unemploymentRate: 0.04,
      previousUnemploymentRate: 0.04,
      incomeGini: 0.31,
      activePolicyImpulse: 2,
    };
    const year = calculatePoliticalState(base);
    const quarter = calculatePoliticalState({ ...base, periodYears: 0.25 });
    const yearMove = year.stability - base.currentStability;
    const quarterMove = quarter.stability - base.currentStability;
    expect(quarterMove).toBeGreaterThan(0);
    expect(quarterMove).toBeLessThan(yearMove * 0.4);
    expect(Number.isInteger(quarter.stability)).toBe(false);
  });
});
