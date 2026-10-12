import Decimal from "decimal.js";
import { ageGroups, stableAgeStructure } from "@/src/domain/demography/age-structure";
import { addDrifts, type MonthlyDrift } from "@/src/domain/politics/drift";
import {
  ADMINISTRATION_TIERS,
  administrationRequirement,
  type AdministrationTier,
} from "./administration";
import { BUDGET_SECTORS, type BudgetAllocation, type BudgetSectorKey } from "./budget";

/**
 * 예산 부문별 충족률 (Terra Invicta식 예산 배분 → 국가 거시 수치 변동).
 *
 * 부문마다 나라 상황(인구 구조, 소득, 위협, 법·제도)으로 '필요 비중'(정부 예산 중 %)을 계산하고,
 * 실제 배정 비중이 필요 비중의 몇 %인지(충족률)에 따라 다섯 구간 중 하나가 된다.
 * 구간의 정치 효과는 월간 증감이고, 경제 효과는 그 구간이 유지되는 동안 걸리는 구조 보정이다.
 * 투자율·교육비·복지비가 성장·연구역량·빈곤에 주는 직접 효과는 경제 계산이 따로 다루므로,
 * 여기서는 그 밖의 효과(치안·여론·부패·국방 태세 등)만 붙인다.
 *
 * 평범한 나라(인구 5천만, 밀도 100, 1인당 2만 달러, 정부지출 GDP 30%, 중위연령 40세, 위협 없음)는
 * 균형 운영 프리셋(18/15/22/17/20/8)에서 모든 부문이 정상 구간이다. 필요 비중의 합은 100%보다 작아서,
 * 남는 몫을 어느 부문에 더 줄지가 정책 선택이 된다.
 */

const clampDecimal = (value: Decimal, min: Decimal.Value, max: Decimal.Value) =>
  Decimal.max(min, Decimal.min(max, value));
const tidy = (value: Decimal) => value.toDecimalPlaces(6).toString();
const d = (value: Decimal.Value) => new Decimal(value);

const REFERENCE_POPULATION = d(50_000_000);
const REFERENCE_DENSITY = 100;
const REFERENCE_GDP_PER_CAPITA = d(20_000);
const REFERENCE_SPENDING_TO_GDP = d("0.3");
const REFERENCE_MEDIAN_AGE = 40;
const MAX_COUNTED_THREATS = 5;

/** 기준 국가(기대수명 80세, 중위연령 40세 안정 인구)의 연령 비율 */
const REFERENCE_AGE_GROUPS = (() => {
  const groups = ageGroups(
    stableAgeStructure({ population: 1, lifeExpectancy: 80, medianAge: 40 }),
  );
  return {
    youthShare: (groups.schoolAge + groups.universityAge) / groups.total,
    elderlyShare: groups.elderlyShare,
  };
})();

const positiveShare = (value: number | null | undefined) =>
  value !== null && value !== undefined && Number.isFinite(value) && value > 0 ? value : null;

export type BudgetContext = {
  population: Decimal.Value;
  /** 명/km² */
  populationDensity: Decimal.Value | null;
  /** 통계 통화 기준 1인당 실질 GDP */
  gdpPerCapita: Decimal.Value | null;
  /** 정부지출 ÷ 명목 GDP */
  spendingToGdp: Decimal.Value;
  unrest: number;
  medianAge: number | null;
  /** 6~24세 학령·대학 연령 비율. 연령 구조가 있으면 중위연령 대신 쓴다. */
  youthShare?: number | null;
  /** 65세 이상 비율. 연령 구조가 있으면 중위연령 대신 쓴다. */
  elderlyShare?: number | null;
  /** 0~1 */
  povertyRate: number | null;
  /** 0~1 */
  unemploymentRate: number | null;
  atWar: boolean;
  /** 전쟁·교착·게릴라 상태이거나 관계가 매우 나쁜 상대 국가 수 */
  threats: number;
  /** 징병법 단계(1~5). 모르면 null */
  conscriptionStage: number | null;
  /** 경제법 단계(1 자유방임 ~ 5 중앙계획). 모르면 null */
  economyLawStage: number | null;
  /** 국가정신 등이 거는 부문별 필요 비중 배율 보정(+0.3이면 1.3배) */
  needModifiers?: Partial<Record<BudgetSectorKey, number>>;
};

export type BudgetRequirement = {
  /** 정부 예산에서 차지해야 할 비중(0~1) */
  budgetShare: string;
  /** 같은 금액을 GDP 대비로 본 값 */
  gdpShare: string;
  factors: Record<string, string>;
};

function finiteOr(value: number | null | undefined, fallback: number) {
  return value !== null && value !== undefined && Number.isFinite(value) ? value : fallback;
}

function densityFactor(density: Decimal.Value | null, strength: Decimal.Value, max: Decimal.Value) {
  const value = density !== null && d(density).gt(0) ? d(density) : d(REFERENCE_DENSITY);
  return clampDecimal(
    d(1).plus(d(strength).mul(d(REFERENCE_DENSITY).div(Decimal.max(1, value)).log(10))),
    "0.9",
    max,
  );
}

function incomeFactor(
  gdpPerCapitaValue: Decimal.Value | null,
  exponent: Decimal.Value,
  min: Decimal.Value,
  max: Decimal.Value,
) {
  if (gdpPerCapitaValue === null || !d(gdpPerCapitaValue).gt(0)) return d(1);
  return clampDecimal(d(gdpPerCapitaValue).div(REFERENCE_GDP_PER_CAPITA).pow(exponent), min, max);
}

/** 정부 규모가 작으면 같은 비중이라도 금액이 적으므로 필요 비중이 조금 오른다. */
function governmentSizeFactor(spendingToGdp: Decimal.Value) {
  const value = d(spendingToGdp || 0);
  if (!value.gt(0)) return d(1);
  return clampDecimal(REFERENCE_SPENDING_TO_GDP.div(value).pow("0.2"), "0.9", "1.15");
}

function threatCount(context: BudgetContext) {
  return Math.min(MAX_COUNTED_THREATS, Math.max(0, Math.floor(finiteOr(context.threats, 0))));
}

const CONSCRIPTION_DEFENSE_SHARE: Record<number, string> = {
  1: "0",
  2: "0.01",
  3: "0.02",
  4: "0.05",
  5: "0.1",
};

const ECONOMY_LAW_INDUSTRY_FACTOR: Record<number, string> = {
  1: "0.85",
  2: "0.95",
  3: "1",
  4: "1.2",
  5: "1.4",
};

function requirement(
  share: Decimal,
  spendingToGdp: Decimal.Value,
  min: Decimal.Value,
  max: Decimal.Value,
  factors: Record<string, Decimal>,
): BudgetRequirement {
  const budgetShare = clampDecimal(share, min, max);
  return {
    budgetShare: tidy(budgetShare),
    gdpShare: tidy(budgetShare.mul(d(spendingToGdp || 0))),
    factors: Object.fromEntries(Object.entries(factors).map(([key, value]) => [key, tidy(value)])),
  };
}

export function defenseRequirement(context: BudgetContext) {
  const threats = threatCount(context);
  const threat = d("0.012").mul(threats);
  const war = d(context.atWar ? "0.1" : 0);
  const conscription = d(CONSCRIPTION_DEFENSE_SHARE[finiteOr(context.conscriptionStage, 1)] ?? 0);
  const size = governmentSizeFactor(context.spendingToGdp);
  return requirement(
    d("0.16").plus(threat).plus(war).plus(conscription).mul(size),
    context.spendingToGdp,
    "0.03",
    "0.55",
    { threat, war, conscription, governmentSize: size },
  );
}

export function industryRequirement(context: BudgetContext) {
  const income = incomeFactor(context.gdpPerCapita, "-0.1", "0.85", "1.2");
  const territory = densityFactor(context.populationDensity, "0.08", "1.2");
  const economyLaw = d(ECONOMY_LAW_INDUSTRY_FACTOR[finiteOr(context.economyLawStage, 3)] ?? 1);
  const size = governmentSizeFactor(context.spendingToGdp);
  return requirement(
    d("0.2").mul(income).mul(territory).mul(economyLaw).mul(size),
    context.spendingToGdp,
    "0.05",
    "0.6",
    { income, territory, economyLaw, governmentSize: size },
  );
}

export function educationRequirement(context: BudgetContext) {
  const youthShare = positiveShare(context.youthShare);
  const medianAge = finiteOr(context.medianAge, REFERENCE_MEDIAN_AGE);
  const youth = youthShare
    ? clampDecimal(d(youthShare).div(REFERENCE_AGE_GROUPS.youthShare).pow("0.8"), "0.75", "1.35")
    : clampDecimal(d(38).div(Math.max(15, medianAge)).pow("0.6"), "0.75", "1.35");
  const income = incomeFactor(context.gdpPerCapita, "0.04", "0.92", "1.1");
  const size = governmentSizeFactor(context.spendingToGdp);
  return requirement(
    d("0.16").mul(youth).mul(income).mul(size),
    context.spendingToGdp,
    "0.04",
    "0.4",
    { youth, income, governmentSize: size },
  );
}

export function welfareRequirement(context: BudgetContext) {
  const elderlyShare = positiveShare(context.elderlyShare);
  const medianAge = finiteOr(context.medianAge, REFERENCE_MEDIAN_AGE);
  const ageing = elderlyShare
    ? clampDecimal(
        d(elderlyShare).div(REFERENCE_AGE_GROUPS.elderlyShare).pow("0.6"),
        "0.65",
        "1.45",
      )
    : clampDecimal(d(Math.max(15, medianAge)).div(REFERENCE_MEDIAN_AGE).pow("0.9"), "0.65", "1.45");
  const poverty = clampDecimal(
    d(Math.max(0, finiteOr(context.povertyRate, 0.12) - 0.12)).mul("0.25"),
    0,
    "0.08",
  );
  const unemployment = clampDecimal(
    d(Math.max(0, finiteOr(context.unemploymentRate, 0.05) - 0.05)).mul("0.4"),
    0,
    "0.06",
  );
  const size = governmentSizeFactor(context.spendingToGdp);
  return requirement(
    d("0.18").mul(ageing).plus(poverty).plus(unemployment).mul(size),
    context.spendingToGdp,
    "0.04",
    "0.6",
    { ageing, poverty, unemployment, governmentSize: size },
  );
}

export function diplomacyRequirement(context: BudgetContext) {
  const population = Decimal.max(1, d(context.population || 0));
  const scale = clampDecimal(population.div(REFERENCE_POPULATION).pow("0.04"), "0.9", "1.12");
  const threat = d("0.004").mul(threatCount(context));
  const war = d(context.atWar ? "0.01" : 0);
  return requirement(
    d("0.07").mul(scale).plus(threat).plus(war),
    context.spendingToGdp,
    "0.02",
    "0.2",
    { scale, threat, war },
  );
}

export function administrationBudgetRequirement(context: BudgetContext): BudgetRequirement {
  return administrationRequirement({
    population: context.population,
    populationDensity: context.populationDensity,
    gdpPerCapita: context.gdpPerCapita,
    unrest: context.unrest,
    spendingToGdp: context.spendingToGdp,
  });
}

export type BudgetTierKey = AdministrationTier["key"];

export type BudgetTier = {
  key: BudgetTierKey;
  label: string;
  description: string;
  /** 이 충족률 미만이면 해당 구간 */
  below: number;
  drift: MonthlyDrift;
  /** 세수 효율 보정(비율) */
  revenueEfficiency: string;
  /** 잠재성장률 보정(비율) */
  potentialGrowth: string;
  /** 균형 실업률 이동(비율) */
  naturalUnemployment?: string;
  /** 물가 압력(비율) */
  inflationPressure?: string;
  /** 연간 정치력 수입 보정 */
  politicalPowerIncome: number;
};

const COVERAGE_LIMITS = [0.6, 0.85, 1.15, 1.4, Number.POSITIVE_INFINITY] as const;
const TIER_KEYS: BudgetTierKey[] = ["PARALYSIS", "GAP", "NORMAL", "EXPANSION", "BLOAT"];

type TierSpec = Omit<BudgetTier, "key" | "below" | "revenueEfficiency" | "potentialGrowth"> & {
  revenueEfficiency?: string;
  potentialGrowth?: string;
};

function tiers(specs: [TierSpec, TierSpec, TierSpec, TierSpec, TierSpec]): readonly BudgetTier[] {
  return specs.map((spec, index) => ({
    revenueEfficiency: "0",
    potentialGrowth: "0",
    ...spec,
    key: TIER_KEYS[index],
    below: COVERAGE_LIMITS[index],
  }));
}

export const BUDGET_TIERS: Record<BudgetSectorKey, readonly BudgetTier[]> = {
  budgetDefense: tiers([
    {
      label: "국방 공백",
      description: "필요 국방비의 60%도 배정되지 않아 군 기강과 국경 경비가 무너지고 있습니다.",
      drift: { stability: -0.2, legitimacy: -0.1, unrest: 0.15 },
      politicalPowerIncome: -3,
    },
    {
      label: "국방 부족",
      description: "국방비가 모자라 장비 유지와 훈련이 밀리고 있습니다.",
      drift: { stability: -0.08 },
      politicalPowerIncome: 0,
    },
    {
      label: "정상 운영",
      description: "위협 수준에 맞는 국방 태세가 유지되고 있습니다.",
      drift: {},
      politicalPowerIncome: 0,
    },
    {
      label: "국방 강화",
      description: "넉넉한 국방비로 전력과 대비 태세를 키우고 있습니다.",
      drift: { stability: 0.05, corruption: 0.03 },
      politicalPowerIncome: 0,
    },
    {
      label: "군비 과잉",
      description:
        "위협에 비해 과도한 군비가 경제를 압박하고 군의 정치적 영향력을 키우고 있습니다.",
      drift: { stability: 0.08, corruption: 0.12, democracy: -0.05 },
      potentialGrowth: "-0.0015",
      politicalPowerIncome: 2,
    },
  ]),
  budgetAdministration: ADMINISTRATION_TIERS,
  budgetIndustry: tiers([
    {
      label: "인프라 붕괴",
      description: "전력·교통·용수 같은 기반 시설이 유지조차 되지 않아 생활과 생산이 흔들립니다.",
      drift: { unrest: 0.2, stateCapacity: -0.1 },
      potentialGrowth: "-0.003",
      politicalPowerIncome: 0,
    },
    {
      label: "인프라 노후",
      description: "보수와 교체가 밀려 기반 시설이 낡아 가고 있습니다.",
      drift: { unrest: 0.05 },
      potentialGrowth: "-0.001",
      politicalPowerIncome: 0,
    },
    {
      label: "정상 운영",
      description: "기반 시설과 산업 지원이 필요한 만큼 유지되고 있습니다.",
      drift: {},
      politicalPowerIncome: 0,
    },
    {
      label: "인프라 확충",
      description: "눈에 보이는 공공사업이 늘어 정권 지지에 도움이 됩니다.",
      drift: { governmentApproval: 0.05 },
      politicalPowerIncome: 0,
    },
    {
      label: "토건 과잉",
      description: "수요를 넘어선 공사와 보조금이 이권과 물가 압력을 만들고 있습니다.",
      drift: { corruption: 0.1 },
      inflationPressure: "0.0015",
      politicalPowerIncome: 0,
    },
  ]),
  budgetEducation: tiers([
    {
      label: "교육 붕괴",
      description: "학교와 대학이 제대로 운영되지 못해 학생과 교사의 반발이 커지고 있습니다.",
      drift: { unrest: 0.2, legitimacy: -0.08 },
      potentialGrowth: "-0.002",
      politicalPowerIncome: 0,
    },
    {
      label: "교육 부족",
      description: "교육 예산이 모자라 학급 과밀과 시설 노후가 쌓이고 있습니다.",
      drift: { unrest: 0.06 },
      politicalPowerIncome: 0,
    },
    {
      label: "정상 운영",
      description: "학령 인구에 맞는 교육 체계가 유지되고 있습니다.",
      drift: {},
      politicalPowerIncome: 0,
    },
    {
      label: "교육 확충",
      description: "교육 투자를 늘려 사회적 신뢰를 쌓고 있습니다.",
      drift: { legitimacy: 0.04, stability: 0.02 },
      politicalPowerIncome: 0,
    },
    {
      label: "학력 인플레",
      description: "일자리보다 빠르게 늘어난 고학력자가 취업난을 겪고 있습니다.",
      drift: { corruption: 0.04 },
      naturalUnemployment: "0.002",
      politicalPowerIncome: 0,
    },
  ]),
  budgetWelfare: tiers([
    {
      label: "복지 붕괴",
      description: "의료와 사회안전망이 무너져 민심이 빠르게 돌아서고 있습니다.",
      drift: { unrest: 0.4, governmentApproval: -0.3, stability: -0.15 },
      politicalPowerIncome: 0,
    },
    {
      label: "복지 부족",
      description: "고령화와 빈곤에 비해 복지 지출이 모자랍니다.",
      drift: { unrest: 0.15, governmentApproval: -0.1 },
      politicalPowerIncome: 0,
    },
    {
      label: "정상 운영",
      description: "인구 구조와 빈곤 수준에 맞는 복지가 유지되고 있습니다.",
      drift: {},
      politicalPowerIncome: 0,
    },
    {
      label: "복지 확충",
      description: "두터운 복지로 정권 지지가 오르고 불만이 줄고 있습니다.",
      drift: { governmentApproval: 0.1, unrest: -0.08 },
      politicalPowerIncome: 0,
    },
    {
      label: "복지 과잉",
      description: "복지가 근로 유인을 떨어뜨리기 시작했습니다.",
      drift: { governmentApproval: 0.12, unrest: -0.1 },
      potentialGrowth: "-0.001",
      naturalUnemployment: "0.004",
      politicalPowerIncome: 0,
    },
  ]),
  budgetDiplomacy: tiers([
    {
      label: "외교 고립",
      description: "공관과 대외 사업을 유지하지 못해 국제적 존재감이 사라지고 있습니다.",
      drift: { legitimacy: -0.12 },
      politicalPowerIncome: 0,
    },
    {
      label: "외교 축소",
      description: "외교·문화 예산이 모자라 대외 활동이 줄고 있습니다.",
      drift: { legitimacy: -0.04 },
      politicalPowerIncome: 0,
    },
    {
      label: "정상 운영",
      description: "국가 규모와 대외 환경에 맞는 외교 활동이 유지되고 있습니다.",
      drift: {},
      politicalPowerIncome: 0,
    },
    {
      label: "외교 확대",
      description: "활발한 외교와 문화 사업이 국가 위상을 높이고 있습니다.",
      drift: { legitimacy: 0.05 },
      politicalPowerIncome: 0,
    },
    {
      label: "외교 과잉",
      description: "성과에 비해 과도한 대외 사업이 낭비와 이권을 낳고 있습니다.",
      drift: { legitimacy: 0.06, corruption: 0.05 },
      politicalPowerIncome: 0,
    },
  ]),
};

export function budgetTier(line: BudgetSectorKey, coverage: Decimal.Value | null) {
  const table = BUDGET_TIERS[line];
  if (coverage === null) return table[2];
  const value = d(coverage).toNumber();
  return table.find((tier) => value < tier.below) ?? table[table.length - 1];
}

export function budgetRequirement(line: BudgetSectorKey, context: BudgetContext) {
  switch (line) {
    case "budgetDefense":
      return defenseRequirement(context);
    case "budgetAdministration":
      return administrationBudgetRequirement(context);
    case "budgetIndustry":
      return industryRequirement(context);
    case "budgetEducation":
      return educationRequirement(context);
    case "budgetWelfare":
      return welfareRequirement(context);
    case "budgetDiplomacy":
      return diplomacyRequirement(context);
  }
}

export type BudgetLineEvaluation = {
  key: BudgetSectorKey;
  label: string;
  requirement: BudgetRequirement;
  /** 배정 비중(0~1) */
  allocatedShare: string;
  allocatedGdpShare: string;
  /** 배정 ÷ 필요. 필요 비중이 0이면 null */
  coverage: string | null;
  tier: BudgetTier;
};

/** 필요 비중에 배율 보정을 건다. 결과는 1%~80% 사이로 묶는다. */
function adjustRequirement(
  requirementValue: BudgetRequirement,
  modifier: number,
  spendingToGdp: Decimal.Value,
): BudgetRequirement {
  if (!Number.isFinite(modifier) || modifier === 0) return requirementValue;
  const factor = d(1).plus(Math.max(-0.9, modifier));
  const share = clampDecimal(d(requirementValue.budgetShare).mul(factor), "0.01", "0.8");
  return {
    budgetShare: tidy(share),
    gdpShare: tidy(share.mul(d(spendingToGdp || 0))),
    factors: { ...requirementValue.factors, modifiers: tidy(factor) },
  };
}

export function evaluateBudgetLine(
  line: BudgetSectorKey,
  context: BudgetContext,
  allocatedPercent: number,
): BudgetLineEvaluation {
  const requirementValue = adjustRequirement(
    budgetRequirement(line, context),
    context.needModifiers?.[line] ?? 0,
    context.spendingToGdp,
  );
  const allocatedShare = d(Number.isFinite(allocatedPercent) ? allocatedPercent : 0).div(100);
  const required = d(requirementValue.budgetShare);
  const coverage = required.gt(0) ? allocatedShare.div(required) : null;
  return {
    key: line,
    label: BUDGET_SECTORS.find((sector) => sector.key === line)?.label ?? line,
    requirement: requirementValue,
    allocatedShare: tidy(allocatedShare),
    allocatedGdpShare: tidy(allocatedShare.mul(d(context.spendingToGdp || 0))),
    coverage: coverage ? tidy(coverage) : null,
    tier: budgetTier(line, coverage),
  };
}

const sumStrings = (values: Array<string | undefined>) =>
  tidy(values.reduce((sum, value) => sum.plus(value ?? 0), d(0)));

/** 모든 예산 부문의 충족률과 합산 효과. */
export function evaluateBudget(context: BudgetContext, allocation: BudgetAllocation) {
  const lines = BUDGET_SECTORS.map((sector) =>
    evaluateBudgetLine(sector.key, context, allocation[sector.key]),
  );
  const tiersInEffect = lines.map((line) => line.tier);
  return {
    lines,
    drift: addDrifts(...tiersInEffect.map((tier) => tier.drift)),
    structural: {
      potentialGrowth: sumStrings(tiersInEffect.map((tier) => tier.potentialGrowth)),
      naturalUnemployment: sumStrings(tiersInEffect.map((tier) => tier.naturalUnemployment)),
      inflationPressure: sumStrings(tiersInEffect.map((tier) => tier.inflationPressure)),
      revenueEfficiency: sumStrings(tiersInEffect.map((tier) => tier.revenueEfficiency)),
    },
    politicalPowerIncome: tiersInEffect.reduce((sum, tier) => sum + tier.politicalPowerIncome, 0),
    /** 필요 비중의 합(0~1). 1보다 작으면 남는 몫을 자유롭게 줄 수 있다. */
    totalRequiredShare: sumStrings(lines.map((line) => line.requirement.budgetShare)),
  };
}

export type BudgetEvaluation = ReturnType<typeof evaluateBudget>;

/** 화면에 보여 줄 구간 효과 문구. */
export function describeBudgetTier(tier: BudgetTier) {
  const percent = (value: string | undefined, label: string) => {
    const number = Number(value ?? 0);
    if (!number) return [];
    return [`${label} ${number > 0 ? "+" : ""}${(number * 100).toFixed(2)}%p`];
  };
  return [
    ...percent(tier.potentialGrowth, "잠재성장률"),
    ...percent(tier.naturalUnemployment, "균형 실업률"),
    ...percent(tier.inflationPressure, "물가 압력"),
    ...(Number(tier.revenueEfficiency)
      ? [
          `세수 효율 ${Number(tier.revenueEfficiency) > 0 ? "+" : ""}${(
            Number(tier.revenueEfficiency) * 100
          ).toFixed(1)}%`,
        ]
      : []),
    ...(tier.politicalPowerIncome
      ? [`정치력 수입 연 ${tier.politicalPowerIncome > 0 ? "+" : ""}${tier.politicalPowerIncome}`]
      : []),
  ];
}
