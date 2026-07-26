import Decimal from "decimal.js";
import { calculateEconomy, type EconomyInput, type EconomyRules } from "./calculator";

export type EconomyProjectionSettings = {
  turns: number;
  taxRate: string;
  governmentSpendingGrowth: string;
  policyRate: string;
  researchInvestmentRate: string;
  structuralReform: string;
  externalShock: string;
  shockDuration: number;
  sectorShareWeightedGrowth: string;
  educationIndex: string;
  stateCapacity: string;
  financialHealth: string;
  corporateHealth: string;
};

export type EconomyProjectionPoint = {
  turn: number;
  realGdp: number;
  realGdpIndex: number;
  realGdpGrowth: number;
  inflationRate: number;
  unemploymentRate: number;
  debtToGdp: number;
  governmentSpendingToGdp: number;
  population: number;
};

const d = (value: Decimal.Value) => new Decimal(value);
const clamp = (value: Decimal, min: Decimal.Value, max: Decimal.Value) =>
  Decimal.max(min, Decimal.min(max, value));

function safeDecimal(value: Decimal.Value, fallback: Decimal.Value) {
  try {
    const parsed = d(value);
    return parsed.isFinite() ? parsed : d(fallback);
  } catch {
    return d(fallback);
  }
}

function bounded(
  value: Decimal.Value,
  fallback: Decimal.Value,
  min: Decimal.Value,
  max: Decimal.Value,
) {
  return clamp(safeDecimal(value, fallback), min, max).toString();
}

function boundedInteger(value: number, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

export function defaultEconomyProjectionSettings(
  input: EconomyInput,
  turns = 20,
): EconomyProjectionSettings {
  const nominalGdp = safeDecimal(input.nominalGdp, 0);
  const taxRate = nominalGdp.isZero()
    ? d(0)
    : safeDecimal(input.governmentRevenue, 0).div(nominalGdp);
  return {
    turns: boundedInteger(turns, 20, 1, 200),
    taxRate: bounded(taxRate, 0, 0, 1),
    governmentSpendingGrowth: "0",
    policyRate: bounded(input.policyRate, 0, "-0.02", "0.35"),
    researchInvestmentRate: bounded(input.researchInvestmentRate, 0, 0, "0.2"),
    structuralReform: bounded(input.structuralReform, 0, "-0.1", "0.2"),
    externalShock: "0",
    shockDuration: 1,
    sectorShareWeightedGrowth: bounded(input.sectorShareWeightedGrowth, 0, "-0.5", "0.5"),
    educationIndex: bounded(input.educationIndex, "0.7", 0, 1),
    stateCapacity: bounded(input.stateCapacity, 50, 0, 100),
    financialHealth: bounded(input.financialHealth, 50, 0, 100),
    corporateHealth: bounded(input.corporateHealth, 50, 0, 100),
  };
}

function normalizeSettings(
  input: EconomyInput,
  settings: EconomyProjectionSettings,
): EconomyProjectionSettings {
  const defaults = defaultEconomyProjectionSettings(input, settings.turns);
  const turns = boundedInteger(settings.turns, defaults.turns, 1, 200);
  return {
    turns,
    taxRate: bounded(settings.taxRate, defaults.taxRate, 0, 1),
    governmentSpendingGrowth: bounded(settings.governmentSpendingGrowth, 0, "-0.5", "0.5"),
    policyRate: bounded(settings.policyRate, defaults.policyRate, "-0.02", "0.35"),
    researchInvestmentRate: bounded(
      settings.researchInvestmentRate,
      defaults.researchInvestmentRate,
      0,
      "0.2",
    ),
    structuralReform: bounded(settings.structuralReform, defaults.structuralReform, "-0.1", "0.2"),
    externalShock: bounded(settings.externalShock, 0, "-2", "2"),
    shockDuration: boundedInteger(settings.shockDuration, 1, 0, turns),
    sectorShareWeightedGrowth: bounded(
      settings.sectorShareWeightedGrowth,
      defaults.sectorShareWeightedGrowth,
      "-0.5",
      "0.5",
    ),
    educationIndex: bounded(settings.educationIndex, defaults.educationIndex, 0, 1),
    stateCapacity: bounded(settings.stateCapacity, defaults.stateCapacity, 0, 100),
    financialHealth: bounded(settings.financialHealth, defaults.financialHealth, 0, 100),
    corporateHealth: bounded(settings.corporateHealth, defaults.corporateHealth, 0, 100),
  };
}

function pointFromInput(
  turn: number,
  input: EconomyInput,
  initialRealGdp: Decimal,
): EconomyProjectionPoint {
  const realGdp = safeDecimal(input.realGdp, 0);
  const nominalGdp = safeDecimal(input.nominalGdp, 0);
  return {
    turn,
    realGdp: realGdp.toNumber(),
    realGdpIndex: initialRealGdp.isZero() ? 100 : realGdp.div(initialRealGdp).mul(100).toNumber(),
    realGdpGrowth: safeDecimal(input.realGdpGrowth, 0).mul(100).toNumber(),
    inflationRate: safeDecimal(input.inflationRate, 0).mul(100).toNumber(),
    unemploymentRate: safeDecimal(input.unemploymentRate, 0).mul(100).toNumber(),
    debtToGdp: nominalGdp.isZero()
      ? 0
      : safeDecimal(input.nationalDebt, 0).div(nominalGdp).mul(100).toNumber(),
    governmentSpendingToGdp: nominalGdp.isZero()
      ? 0
      : safeDecimal(input.governmentSpending, 0).div(nominalGdp).mul(100).toNumber(),
    population: safeDecimal(input.population, 0).toNumber(),
  };
}

function advanceInput(
  input: EconomyInput,
  result: ReturnType<typeof calculateEconomy>,
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
    previousGovernmentSpending: input.governmentSpending,
    governmentSpending: result.governmentSpending,
    nationalDebt: result.nationalDebt,
    policyRate: result.policyRate,
    currentAccountToGdp: result.currentAccountToGdp,
    productivityIndex: result.productivityIndex,
  };
}

export function runEconomyProjection(
  initialInput: EconomyInput,
  requestedSettings: EconomyProjectionSettings,
  rules: EconomyRules,
) {
  const settings = normalizeSettings(initialInput, requestedSettings);
  const initialRealGdp = safeDecimal(initialInput.realGdp, 0);
  const spendingGrowth = safeDecimal(settings.governmentSpendingGrowth, 0);
  const spendingDenominator = d(1).plus(spendingGrowth);
  let state: EconomyInput = {
    ...initialInput,
    previousGovernmentSpending: spendingDenominator.lte(0)
      ? initialInput.governmentSpending
      : safeDecimal(initialInput.governmentSpending, 0).div(spendingDenominator).toString(),
  };
  const points = [pointFromInput(0, state, initialRealGdp)];

  for (let turn = 1; turn <= settings.turns; turn += 1) {
    state = {
      ...state,
      governmentRevenue: safeDecimal(state.nominalGdp, 0).mul(settings.taxRate).toString(),
      policyRate: settings.policyRate,
      researchInvestmentRate: settings.researchInvestmentRate,
      structuralReform: settings.structuralReform,
      externalShock: turn <= settings.shockDuration ? settings.externalShock : "0",
      sectorShareWeightedGrowth: settings.sectorShareWeightedGrowth,
      educationIndex: settings.educationIndex,
      stateCapacity: settings.stateCapacity,
      financialHealth: settings.financialHealth,
      corporateHealth: settings.corporateHealth,
    };
    const result = calculateEconomy(state, rules);
    state = advanceInput(state, result);
    state.policyRate = settings.policyRate;
    points.push(pointFromInput(turn, state, initialRealGdp));
  }

  return { settings, points };
}
