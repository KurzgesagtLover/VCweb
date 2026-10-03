import Decimal from "decimal.js";
import { calculateEconomy, type EconomyInput, type EconomyRules } from "./calculator";
import { calculateTaxRevenue, splitEffectiveTaxRate, TAX_RATE_MAX } from "./tax";

export type EconomyProjectionSettings = {
  turns: number;
  incomeTaxRate: string;
  corporateTaxRate: string;
  otherTaxRate: string;
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
  povertyRate: number;
  foodSelfSufficiency: number;
  agriculturalProductivityIndex: number;
  industrialCapitalStockIndex: number;
  researchCapacityIndex: number;
  debtToGdp: number;
  governmentSpendingToGdp: number;
  population: number;
  gdpPerCapita: number;
  developmentScore: number;
  developmentStage: DevelopmentStage;
};

export type DevelopmentStage = "DEVELOPING" | "EMERGING" | "ADVANCED";

export type EconomyProjectionModifier = {
  id: string;
  metric: string;
  operation: "ADD" | "MULTIPLY";
  value: string;
  startTurnOffset: number;
  durationTurns: number;
};

export type EconomyProjectionGoal = {
  id: string;
  label: string;
  metric: string;
  baselineValue: string;
  targetValue: string;
  latestValue: string;
  targetTurn: number;
};

export type EconomyProjectionContext = {
  modifiers?: EconomyProjectionModifier[];
  goals?: EconomyProjectionGoal[];
};

export type EconomyProjectionGoalResult = EconomyProjectionGoal & {
  projectedValue: number;
  progress: number;
  expectedProgress: number;
  status: "ACHIEVED" | "ON_TRACK" | "OFF_TRACK";
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
  const taxRates = splitEffectiveTaxRate(taxRate);
  return {
    turns: boundedInteger(turns, 20, 1, 200),
    incomeTaxRate: bounded(taxRates.incomeTaxRate, 0, 0, TAX_RATE_MAX),
    corporateTaxRate: bounded(taxRates.corporateTaxRate, 0, 0, TAX_RATE_MAX),
    otherTaxRate: bounded(taxRates.otherTaxRate, 0, 0, TAX_RATE_MAX),
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
    incomeTaxRate: bounded(settings.incomeTaxRate, defaults.incomeTaxRate, 0, TAX_RATE_MAX),
    corporateTaxRate: bounded(
      settings.corporateTaxRate,
      defaults.corporateTaxRate,
      0,
      TAX_RATE_MAX,
    ),
    otherTaxRate: bounded(settings.otherTaxRate, defaults.otherTaxRate, 0, TAX_RATE_MAX),
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
  const development = classifyDevelopment(input);
  const population = safeDecimal(input.population, 0);
  return {
    turn,
    realGdp: realGdp.toNumber(),
    realGdpIndex: initialRealGdp.isZero() ? 100 : realGdp.div(initialRealGdp).mul(100).toNumber(),
    realGdpGrowth: safeDecimal(input.realGdpGrowth, 0).mul(100).toNumber(),
    inflationRate: safeDecimal(input.inflationRate, 0).mul(100).toNumber(),
    unemploymentRate: safeDecimal(input.unemploymentRate, 0).mul(100).toNumber(),
    povertyRate: safeDecimal(input.povertyRate, 0).mul(100).toNumber(),
    foodSelfSufficiency: safeDecimal(input.foodSelfSufficiency, 0).mul(100).toNumber(),
    agriculturalProductivityIndex: safeDecimal(input.agriculturalProductivityIndex, 100).toNumber(),
    industrialCapitalStockIndex: safeDecimal(input.industrialCapitalStockIndex, 100).toNumber(),
    researchCapacityIndex: safeDecimal(input.researchCapacityIndex, 100).toNumber(),
    debtToGdp: nominalGdp.isZero()
      ? 0
      : safeDecimal(input.nationalDebt, 0).div(nominalGdp).mul(100).toNumber(),
    governmentSpendingToGdp: nominalGdp.isZero()
      ? 0
      : safeDecimal(input.governmentSpending, 0).div(nominalGdp).mul(100).toNumber(),
    population: population.toNumber(),
    gdpPerCapita: population.isZero() ? 0 : realGdp.mul(1_000_000).div(population).toNumber(),
    developmentScore: development.score,
    developmentStage: development.stage,
  };
}

export function classifyDevelopment(input: EconomyInput): {
  score: number;
  stage: DevelopmentStage;
} {
  const population = safeDecimal(input.population, 0);
  const gdpPerCapita = population.isZero()
    ? d(0)
    : safeDecimal(input.realGdp, 0).mul(1_000_000).div(population);
  const incomeScore = clamp(
    d(Math.log10(Math.max(1, gdpPerCapita.toNumber())))
      .minus(3)
      .div(2)
      .mul(100),
    0,
    100,
  );
  const productivityScore = clamp(
    safeDecimal(input.productivityIndex, 60).minus(60).div(0.8),
    0,
    100,
  );
  const educationScore = clamp(safeDecimal(input.educationIndex, 0).mul(100), 0, 100);
  const stateScore = clamp(safeDecimal(input.stateCapacity, 0), 0, 100);
  const creditScore = clamp(safeDecimal(input.creditScore, 0), 0, 100);
  const score = incomeScore
    .mul(0.32)
    .plus(productivityScore.mul(0.2))
    .plus(educationScore.mul(0.18))
    .plus(stateScore.mul(0.18))
    .plus(creditScore.mul(0.12))
    .toDecimalPlaces(1)
    .toNumber();
  return {
    score,
    stage: score >= 70 ? "ADVANCED" : score >= 45 ? "EMERGING" : "DEVELOPING",
  };
}

function metricValue(input: EconomyInput, metric: string) {
  if (metric === "debtToGdp") {
    const nominalGdp = safeDecimal(input.nominalGdp, 0);
    return nominalGdp.isZero() ? d(0) : safeDecimal(input.nationalDebt, 0).div(nominalGdp);
  }
  const values: Partial<Record<string, Decimal.Value>> = {
    realGdpGrowth: input.realGdpGrowth,
    inflationRate: input.inflationRate,
    unemploymentRate: input.unemploymentRate,
    productivityIndex: input.productivityIndex,
    povertyRate: input.povertyRate,
    agriculturalProductivityIndex: input.agriculturalProductivityIndex,
    foodSelfSufficiency: input.foodSelfSufficiency,
    industrialCapitalStockIndex: input.industrialCapitalStockIndex,
    researchCapacityIndex: input.researchCapacityIndex,
    incomeGini: input.incomeGini,
    wealthGini: input.wealthGini,
    currentAccountToGdp: input.currentAccountToGdp,
  };
  return safeDecimal(values[metric] ?? 0, 0);
}

function applyModifier(input: EconomyInput, modifier: EconomyProjectionModifier): EconomyInput {
  const current = metricValue(input, modifier.metric);
  const value = safeDecimal(modifier.value, 0);
  const next = modifier.operation === "ADD" ? current.plus(value) : current.mul(value.plus(1));
  if (modifier.metric === "debtToGdp") {
    return {
      ...input,
      nationalDebt: safeDecimal(input.nominalGdp, 0).mul(Decimal.max(0, next)).toString(),
    };
  }
  if (!(modifier.metric in input)) return input;
  const constrained = ["incomeGini", "wealthGini", "povertyRate"].includes(modifier.metric)
    ? clamp(next, 0, 1)
    : modifier.metric === "foodSelfSufficiency"
      ? clamp(next, 0, 2)
      : next;
  return { ...input, [modifier.metric]: constrained.toString() };
}

function evaluateGoals(
  state: EconomyInput,
  goals: EconomyProjectionGoal[],
  completedTurns: number,
): EconomyProjectionGoalResult[] {
  return goals.map((goal) => {
    const baseline = safeDecimal(goal.baselineValue, 0);
    const target = safeDecimal(goal.targetValue, 0);
    const projected = metricValue(state, goal.metric);
    const span = target.minus(baseline);
    const rawProgress = span.isZero() ? d(100) : projected.minus(baseline).div(span).mul(100);
    const progress = clamp(rawProgress, 0, 200).toDecimalPlaces(1).toNumber();
    const expectedProgress = Math.min(100, (completedTurns / Math.max(1, goal.targetTurn)) * 100);
    return {
      ...goal,
      projectedValue: projected.toNumber(),
      progress,
      expectedProgress,
      status:
        progress >= 100 ? "ACHIEVED" : progress + 10 >= expectedProgress ? "ON_TRACK" : "OFF_TRACK",
    };
  });
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
    povertyRate: result.povertyRate,
    agriculturalProductivityIndex: result.agriculturalProductivityIndex,
    foodSelfSufficiency: result.foodSelfSufficiency,
    industrialCapitalStockIndex: result.industrialCapitalStockIndex,
    researchCapacityIndex: result.researchCapacityIndex,
  };
}

export function runEconomyProjection(
  initialInput: EconomyInput,
  requestedSettings: EconomyProjectionSettings,
  rules: EconomyRules,
  context: EconomyProjectionContext = {},
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
      governmentRevenue: calculateTaxRevenue(state.nominalGdp, {
        incomeTaxRate: settings.incomeTaxRate,
        corporateTaxRate: settings.corporateTaxRate,
        otherTaxRate: settings.otherTaxRate,
      }).toString(),
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
    for (const modifier of context.modifiers ?? []) {
      const elapsed = turn - modifier.startTurnOffset;
      if (elapsed >= 1 && elapsed < modifier.durationTurns) {
        state = applyModifier(state, modifier);
      }
    }
    state.policyRate = settings.policyRate;
    points.push(pointFromInput(turn, state, initialRealGdp));
  }

  return {
    settings,
    points,
    goalResults: evaluateGoals(state, context.goals ?? [], settings.turns),
  };
}
