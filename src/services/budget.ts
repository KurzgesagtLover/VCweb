import Decimal from "decimal.js";
import { desc, eq } from "drizzle-orm";
import {
  countryFiscalPolicies,
  demographicSnapshots,
  economicSnapshots,
  turns,
} from "@/src/db/schema";
import { gdpPerCapita } from "@/src/domain/economy/administration";
import { BUDGET_PRESETS, BUDGET_SECTORS, type BudgetAllocation } from "@/src/domain/economy/budget";
import {
  evaluateBudget,
  type BudgetContext,
  type BudgetEvaluation,
} from "@/src/domain/economy/budget-coverage";
import type { LawStages } from "@/src/domain/politics/laws";
import {
  getCountryLawStages,
  getCountryThreats,
  latestPoliticalSnapshot,
  type Reader,
} from "./country-state";

export type BudgetEconomicInput = {
  realGdp: string;
  nominalGdp: string;
  governmentSpending: string;
  scale: string;
  povertyRate: string | null;
  unemploymentRate: string | null;
};

export type BudgetDemographicInput = {
  population: string;
  populationDensity: string | null;
  medianAge: string | null;
};

/** 저장된 재정 정책의 예산 배분. 없으면 균형 운영 프리셋을 쓴다. */
export function fiscalAllocation(
  fiscal: Partial<Record<keyof BudgetAllocation, number | null>> | null | undefined,
): BudgetAllocation {
  const fallback = BUDGET_PRESETS.BALANCED.allocation;
  return Object.fromEntries(
    BUDGET_SECTORS.map((sector) => {
      const value = fiscal?.[sector.key];
      return [
        sector.key,
        typeof value === "number" && Number.isFinite(value) ? value : fallback[sector.key],
      ];
    }),
  ) as BudgetAllocation;
}

export function budgetFromSnapshots(input: {
  economic: BudgetEconomicInput | null;
  demographic: BudgetDemographicInput | null;
  unrest: number;
  allocation: BudgetAllocation;
  lawStages: LawStages;
  threats: { atWar: boolean; threats: number };
}) {
  if (!input.economic || !input.demographic) return null;
  const nominalGdp = new Decimal(input.economic.nominalGdp);
  const spendingToGdp = nominalGdp.gt(0)
    ? new Decimal(input.economic.governmentSpending).div(nominalGdp)
    : new Decimal(0);
  const toNumber = (value: string | null | undefined) => {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };
  const context: BudgetContext = {
    population: input.demographic.population,
    populationDensity: input.demographic.populationDensity,
    gdpPerCapita: gdpPerCapita({
      realGdp: input.economic.realGdp,
      population: input.demographic.population,
      scale: input.economic.scale,
    }),
    spendingToGdp,
    unrest: input.unrest,
    medianAge: toNumber(input.demographic.medianAge),
    povertyRate: toNumber(input.economic.povertyRate),
    unemploymentRate: toNumber(input.economic.unemploymentRate),
    atWar: input.threats.atWar,
    threats: input.threats.threats,
    conscriptionStage: input.lawStages.conscriptionLaw ?? null,
    economyLawStage: input.lawStages.economyLaw ?? null,
  };
  const evaluation = evaluateBudget(context, input.allocation);
  return {
    context,
    evaluation,
    allocation: input.allocation,
    spendingToGdp: spendingToGdp.toString(),
  };
}

export type CountryBudgetState = NonNullable<ReturnType<typeof budgetFromSnapshots>>;

/** 최근 공개 스냅샷과 현재 예산으로 부문별 예산 충족률을 계산한다. */
export async function evaluateCountryBudget(
  reader: Reader,
  country: { id: string; campaignId: string; economicSystem: string | null },
) {
  const [economic, demographic, political, fiscal, lawStages, threats] = await Promise.all([
    reader
      .select({ snapshot: economicSnapshots })
      .from(economicSnapshots)
      .innerJoin(turns, eq(economicSnapshots.turnId, turns.id))
      .where(eq(economicSnapshots.countryId, country.id))
      .orderBy(desc(turns.sequence))
      .limit(1),
    reader
      .select({ snapshot: demographicSnapshots })
      .from(demographicSnapshots)
      .innerJoin(turns, eq(demographicSnapshots.turnId, turns.id))
      .where(eq(demographicSnapshots.countryId, country.id))
      .orderBy(desc(turns.sequence))
      .limit(1),
    latestPoliticalSnapshot(reader, country.id),
    reader
      .select()
      .from(countryFiscalPolicies)
      .where(eq(countryFiscalPolicies.countryId, country.id))
      .limit(1),
    getCountryLawStages(reader, country),
    getCountryThreats(reader, country.campaignId, country.id),
  ]);
  return budgetFromSnapshots({
    economic: economic[0]?.snapshot ?? null,
    demographic: demographic[0]?.snapshot ?? null,
    unrest: political?.unrest ?? 0,
    allocation: fiscalAllocation(fiscal[0] ?? null),
    lawStages,
    threats,
  });
}

/** 계산 근거(evidence)에 남길 예산 요약. 정치력 정산과 화면이 이 값을 읽는다. */
export function budgetEvidence(evaluation: BudgetEvaluation | null) {
  if (!evaluation) return null;
  return {
    politicalPowerIncome: evaluation.politicalPowerIncome,
    totalRequiredShare: evaluation.totalRequiredShare,
    structural: evaluation.structural,
    drift: evaluation.drift,
    lines: evaluation.lines.map((line) => ({
      key: line.key,
      label: line.label,
      coverage: line.coverage,
      requiredBudgetShare: line.requirement.budgetShare,
      requiredGdpShare: line.requirement.gdpShare,
      allocatedShare: line.allocatedShare,
      allocatedGdpShare: line.allocatedGdpShare,
      tier: line.tier.key,
      tierLabel: line.tier.label,
      politicalPowerIncome: line.tier.politicalPowerIncome,
    })),
  };
}

export type BudgetEvidence = NonNullable<ReturnType<typeof budgetEvidence>>;

/** 계산 근거에서 예산 구간의 정치력 수입 보정을 읽는다. 이전 형식(행정만 기록)도 읽는다. */
export function budgetIncomeFromEvidence(evidence: unknown) {
  const systems = (evidence as { politicalSystems?: Record<string, unknown> } | null)
    ?.politicalSystems;
  const budget = systems?.budget as BudgetEvidence | null | undefined;
  if (budget && Array.isArray(budget.lines)) {
    const items = budget.lines
      .filter((line) => line.politicalPowerIncome)
      .map((line) => ({
        key: line.key,
        label: `${line.label} (${line.tierLabel})`,
        income: line.politicalPowerIncome,
      }));
    return {
      income: Number(budget.politicalPowerIncome ?? 0) || 0,
      items,
    };
  }
  const administration = systems?.administration as
    | { politicalPowerIncome?: number; tierLabel?: string }
    | null
    | undefined;
  const income = Number(administration?.politicalPowerIncome ?? 0) || 0;
  return {
    income,
    items: income
      ? [
          {
            key: "budgetAdministration",
            label: `행정·치안 (${administration?.tierLabel ?? ""})`,
            income,
          },
        ]
      : [],
  };
}
