import Decimal from "decimal.js";
import type { MonthlyDrift } from "@/src/domain/politics/drift";

/**
 * 행정·치안 예산.
 *
 * 인구 규모, 인구밀도, 1인당 소득, 정부 규모, 사회 불안으로 '필요 예산 비중'(정부 예산 중 %)을 계산하고,
 * 실제 배정 비중이 필요 비중의 몇 %인지(충족률)에 따라 구간별 상태가 붙는다.
 * 평범한 나라(인구 5천만, 밀도 100, 1인당 2만 달러, 정부지출 GDP 30%, 불안 25)는 15%가 적정이다.
 * 상태의 정치 효과는 모두 월간 증감이며, 세수 효율과 성장률은 그 상태가 유지되는 동안 걸리는 비율 보정이다.
 */

const BASE_BUDGET_SHARE = new Decimal("0.13");
const REFERENCE_POPULATION = new Decimal(50_000_000);
const REFERENCE_DENSITY = 100;
const REFERENCE_GDP_PER_CAPITA = new Decimal(20_000);
const REFERENCE_SPENDING_TO_GDP = new Decimal("0.3");
const SECURITY_SHARE_PER_UNREST = new Decimal("0.0008");

const clampDecimal = (value: Decimal, min: Decimal.Value, max: Decimal.Value) =>
  Decimal.max(min, Decimal.min(max, value));
const tidy = (value: Decimal) => value.toDecimalPlaces(6).toString();

export type AdministrationRequirementInput = {
  population: Decimal.Value;
  /** 명/km² */
  populationDensity: Decimal.Value | null;
  /** 통계 통화 기준 1인당 실질 GDP */
  gdpPerCapita: Decimal.Value | null;
  unrest: number;
  /** 정부지출 ÷ 명목 GDP */
  spendingToGdp: Decimal.Value;
};

export function administrationRequirement(input: AdministrationRequirementInput) {
  const population = Decimal.max(1, new Decimal(input.population || 0));
  const scale = clampDecimal(population.div(REFERENCE_POPULATION).pow("-0.03"), "0.9", "1.15");

  const density =
    input.populationDensity !== null && new Decimal(input.populationDensity).gt(0)
      ? new Decimal(input.populationDensity)
      : new Decimal(REFERENCE_DENSITY);
  const territory = clampDecimal(
    new Decimal(1).plus(
      new Decimal("0.12").mul(new Decimal(REFERENCE_DENSITY).div(Decimal.max(1, density)).log(10)),
    ),
    "0.9",
    "1.3",
  );

  const income =
    input.gdpPerCapita !== null && new Decimal(input.gdpPerCapita).gt(0)
      ? clampDecimal(
          new Decimal(input.gdpPerCapita).div(REFERENCE_GDP_PER_CAPITA).pow("-0.08"),
          "0.85",
          "1.25",
        )
      : new Decimal(1);

  // 정부 규모가 작으면 같은 비중이라도 금액이 적으므로 필요 비중이 조금 오른다.
  const spendingToGdp = new Decimal(input.spendingToGdp || 0);
  const governmentSize = spendingToGdp.gt(0)
    ? clampDecimal(REFERENCE_SPENDING_TO_GDP.div(spendingToGdp).pow("0.35"), "0.85", "1.25")
    : new Decimal(1);

  const unrest = Math.min(100, Math.max(0, Number.isFinite(input.unrest) ? input.unrest : 0));
  const security = SECURITY_SHARE_PER_UNREST.mul(unrest);

  const budgetShare = clampDecimal(
    BASE_BUDGET_SHARE.mul(scale).mul(territory).mul(income).mul(governmentSize).plus(security),
    "0.04",
    "0.6",
  );

  return {
    /** 정부 예산에서 차지해야 할 비중(0~1) */
    budgetShare: tidy(budgetShare),
    /** 같은 금액을 GDP 대비로 본 값 */
    gdpShare: tidy(budgetShare.mul(spendingToGdp)),
    factors: {
      scale: tidy(scale),
      territory: tidy(territory),
      income: tidy(income),
      governmentSize: tidy(governmentSize),
      security: tidy(security),
    },
  };
}

export type AdministrationTierKey = "PARALYSIS" | "GAP" | "NORMAL" | "EXPANSION" | "BLOAT";

export type AdministrationTier = {
  key: AdministrationTierKey;
  label: string;
  description: string;
  /** 이 충족률 미만이면 해당 구간 */
  below: number;
  drift: MonthlyDrift;
  /** 세수 효율 보정(비율). 구간이 유지되는 동안 걸린다. */
  revenueEfficiency: string;
  /** 잠재성장률 보정(비율) */
  potentialGrowth: string;
  /** 연간 정치력 수입 보정 */
  politicalPowerIncome: number;
};

export const ADMINISTRATION_TIERS: readonly AdministrationTier[] = [
  {
    key: "PARALYSIS",
    label: "행정 마비",
    description: "필요한 행정비의 60%도 배정되지 않아 공공 서비스와 치안이 무너지고 있습니다.",
    below: 0.6,
    drift: { stateCapacity: -0.6, corruption: 0.3, unrest: 0.5 },
    revenueEfficiency: "-0.05",
    potentialGrowth: "0",
    politicalPowerIncome: -10,
  },
  {
    key: "GAP",
    label: "행정 공백",
    description: "행정비가 모자라 지방 행정과 치안에 빈틈이 생기고 있습니다.",
    below: 0.85,
    drift: { stateCapacity: -0.3, corruption: 0.15, unrest: 0.25 },
    revenueEfficiency: "-0.02",
    potentialGrowth: "0",
    politicalPowerIncome: -5,
  },
  {
    key: "NORMAL",
    label: "정상 운영",
    description: "행정과 치안이 필요한 만큼 유지되고 있습니다.",
    below: 1.15,
    drift: {},
    revenueEfficiency: "0",
    potentialGrowth: "0",
    politicalPowerIncome: 0,
  },
  {
    key: "EXPANSION",
    label: "행정 확충",
    description: "넉넉한 행정비로 관료 조직과 치안 역량을 키우고 있습니다.",
    below: 1.4,
    drift: { stateCapacity: 0.25, corruption: -0.15 },
    revenueEfficiency: "0.015",
    potentialGrowth: "0",
    politicalPowerIncome: 5,
  },
  {
    key: "BLOAT",
    label: "관료제 비대",
    description: "필요 이상으로 불어난 관료 조직이 효율을 떨어뜨리고 이권을 만들고 있습니다.",
    below: Number.POSITIVE_INFINITY,
    drift: { stateCapacity: 0.3, corruption: 0.1 },
    revenueEfficiency: "0.02",
    potentialGrowth: "-0.001",
    politicalPowerIncome: 3,
  },
];

export function administrationTier(coverage: Decimal.Value | null) {
  if (coverage === null) return ADMINISTRATION_TIERS[2];
  const value = new Decimal(coverage).toNumber();
  return (
    ADMINISTRATION_TIERS.find((tier) => value < tier.below) ??
    ADMINISTRATION_TIERS[ADMINISTRATION_TIERS.length - 1]
  );
}

export type AdministrationBudgetInput = AdministrationRequirementInput & {
  /** 행정·치안 예산 비중(%) */
  budgetAdministrationPercent: number;
};

export function evaluateAdministrationBudget(input: AdministrationBudgetInput) {
  const requirement = administrationRequirement(input);
  const allocatedShare = new Decimal(
    Number.isFinite(input.budgetAdministrationPercent) ? input.budgetAdministrationPercent : 0,
  ).div(100);
  const required = new Decimal(requirement.budgetShare);
  const coverage = required.gt(0) ? allocatedShare.div(required) : null;
  const tier = administrationTier(coverage);
  return {
    requirement,
    allocatedShare: tidy(allocatedShare),
    allocatedGdpShare: tidy(allocatedShare.mul(new Decimal(input.spendingToGdp || 0))),
    coverage: coverage ? tidy(coverage) : null,
    tier,
  };
}

/** 경제 스냅샷 금액 단위를 실제 통화 단위 배율로 바꾼다. */
export function economicScaleMultiplier(scale: string | null | undefined) {
  if (scale === "thousand") return new Decimal(1_000);
  if (scale === "million") return new Decimal(1_000_000);
  if (scale === "billion") return new Decimal(1_000_000_000);
  return new Decimal(1);
}

export function gdpPerCapita(input: {
  realGdp: Decimal.Value;
  population: Decimal.Value;
  scale?: string | null;
}) {
  const population = new Decimal(input.population || 0);
  if (population.lte(0)) return null;
  return new Decimal(input.realGdp || 0).mul(economicScaleMultiplier(input.scale)).div(population);
}
