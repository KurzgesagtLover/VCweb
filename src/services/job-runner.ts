import { createHash } from "node:crypto";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import Decimal from "decimal.js";
import { generateDiplomacyResponse, generateJudgment, generateTurnEvent } from "@/src/ai/router";
import type { AiTaskType } from "@/src/ai/catalog";
import { AIProviderError, type AIResult } from "@/src/ai/types";
import { db } from "@/src/db";
import {
  adminChangeProposals,
  campaigns,
  countries,
  countryFiscalPolicies,
  diplomaticMessages,
  diplomaticProposals,
  demographicSnapshots,
  economicSnapshotInputs,
  economicSectors,
  economicSnapshots,
  effectProposals,
  events,
  eventOptions,
  financialInstitutions,
  jobs,
  judgmentProposals,
  judgmentRuns,
  majorCompanies,
  modifiers,
  oppositionActions,
  policyGoals,
  politicalSnapshots,
  simulationRules,
  submissions,
  turnCountryWorkspaces,
  turns,
  type DomainEffect,
} from "@/src/db/schema";
import {
  calculateEconomy,
  creditRatingFromScore,
  DEFAULT_ECONOMY_RULES,
  type EconomyInput,
  type EconomyRules,
} from "@/src/domain/economy/calculator";
import { validateEffects } from "@/src/domain/effects/registry";
import { isPolicyMetric, metricValue } from "@/src/domain/policy/metrics";
import {
  calculatePolicyEffectiveness,
  calculatePoliticalState,
  initialPolicyReception,
  type EconomicSystem,
} from "@/src/domain/policy/model";

type JobRow = {
  id: string;
  campaignId: string;
  turnId: string | null;
  type:
    | "CALCULATE_COUNTRY_ECONOMY"
    | "CALCULATE_COUNTRY_RESEARCH"
    | "JUDGE_SUBMISSION"
    | "GENERATE_OPPOSITION_ACTION"
    | "GENERATE_AI_DIPLOMACY_RESPONSE"
    | "GENERATE_TURN_EVENT"
    | "FINALIZE_TURN_REVIEW_DATA";
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  idempotencyKey: string;
};

export async function enqueueJob(input: {
  campaignId: string;
  turnId?: string | null;
  type: JobRow["type"];
  payload: Record<string, unknown>;
  idempotencyKey: string;
}) {
  await db.insert(jobs).values(input).onConflictDoNothing({ target: jobs.idempotencyKey });
}

async function claimJob(): Promise<JobRow | null> {
  const result = await db.execute<JobRow>(sql`
    UPDATE jobs
    SET status = 'RUNNING',
        attempts = attempts + 1,
        locked_at = NOW(),
        heartbeat_at = NOW(),
        updated_at = NOW()
    WHERE id = (
      SELECT id
      FROM jobs
      WHERE (
        status = 'QUEUED'
        OR (status = 'RUNNING' AND heartbeat_at < NOW() - INTERVAL '2 minutes')
      )
      AND available_at <= NOW()
      AND attempts < max_attempts
      ORDER BY created_at, id
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id,
      campaign_id AS "campaignId",
      turn_id AS "turnId",
      type,
      payload,
      attempts,
      max_attempts AS "maxAttempts",
      idempotency_key AS "idempotencyKey"
  `);
  return result.at(0) ?? null;
}

async function latestCountrySimulationState(countryId: string, campaignId: string) {
  const [economic, demographic, political, institutions, companies, ruleRow, fiscalPolicy] =
    await Promise.all([
      db
        .select({ snapshot: economicSnapshots })
        .from(economicSnapshots)
        .innerJoin(turns, eq(economicSnapshots.turnId, turns.id))
        .where(eq(economicSnapshots.countryId, countryId))
        .orderBy(desc(turns.sequence))
        .limit(2),
      db
        .select({ snapshot: demographicSnapshots })
        .from(demographicSnapshots)
        .innerJoin(turns, eq(demographicSnapshots.turnId, turns.id))
        .where(eq(demographicSnapshots.countryId, countryId))
        .orderBy(desc(turns.sequence))
        .limit(1),
      db
        .select({ snapshot: politicalSnapshots })
        .from(politicalSnapshots)
        .innerJoin(turns, eq(politicalSnapshots.turnId, turns.id))
        .where(eq(politicalSnapshots.countryId, countryId))
        .orderBy(desc(turns.sequence))
        .limit(1),
      db.query.financialInstitutions.findMany({
        where: eq(financialInstitutions.countryId, countryId),
      }),
      db.query.majorCompanies.findMany({ where: eq(majorCompanies.countryId, countryId) }),
      db.query.simulationRules.findFirst({
        where: and(eq(simulationRules.campaignId, campaignId), eq(simulationRules.isActive, true)),
        orderBy: [desc(simulationRules.createdAt)],
      }),
      db.query.countryFiscalPolicies.findFirst({
        where: eq(countryFiscalPolicies.countryId, countryId),
      }),
    ]);
  const currentEconomic = economic[0]?.snapshot;
  const [sectors, snapshotInputs, approvedEconomicChanges] = currentEconomic
    ? await Promise.all([
        db.query.economicSectors.findMany({
          where: and(
            eq(economicSectors.countryId, countryId),
            eq(economicSectors.turnId, currentEconomic.turnId),
          ),
        }),
        db.query.economicSnapshotInputs.findMany({
          where: eq(economicSnapshotInputs.snapshotId, currentEconomic.id),
        }),
        db.query.adminChangeProposals.findMany({
          where: and(
            eq(adminChangeProposals.countryId, countryId),
            eq(adminChangeProposals.turnId, currentEconomic.turnId),
            eq(adminChangeProposals.domain, "ECONOMY"),
            eq(adminChangeProposals.status, "APPROVED"),
          ),
        }),
      ])
    : [[], [], []];
  const effectiveEconomic = currentEconomic ? { ...currentEconomic } : undefined;
  for (const change of approvedEconomicChanges) {
    if (effectiveEconomic && change.metric in effectiveEconomic) {
      (effectiveEconomic as Record<string, unknown>)[change.metric] = change.afterValue;
    }
  }
  return {
    economic: effectiveEconomic,
    previousEconomic: economic[1]?.snapshot,
    demographic: demographic[0]?.snapshot,
    political: political[0]?.snapshot,
    institutions,
    companies,
    sectors,
    snapshotInputs,
    ruleRow,
    fiscalPolicy,
  };
}

function weightedAverage(
  rows: Array<{ value: Decimal.Value; weight: Decimal.Value }>,
  fallback: Decimal.Value,
) {
  const totalWeight = rows.reduce((sum, row) => sum.plus(row.weight), new Decimal(0));
  if (totalWeight.isZero()) return new Decimal(fallback);
  return rows
    .reduce((sum, row) => sum.plus(new Decimal(row.value).mul(row.weight)), new Decimal(0))
    .div(totalWeight);
}

const scheduledEconomicMetrics = new Set([
  "realGdpGrowth",
  "inflationRate",
  "unemploymentRate",
  "productivityIndex",
  "incomeGini",
  "wealthGini",
  "debtToGdp",
  "currentAccountToGdp",
]);

const scheduledPoliticalMetrics = new Set([
  "stability",
  "legitimacy",
  "governmentApproval",
  "policySupport",
  "unrest",
  "stateCapacity",
  "corruption",
  "democracy",
]);

function clampNumber(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function applyScheduledModifier(
  economic: Record<string, unknown>,
  political: Record<string, unknown>,
  modifier: {
    metric: string;
    operation: string;
    value: string;
  },
) {
  const target = scheduledEconomicMetrics.has(modifier.metric)
    ? economic
    : scheduledPoliticalMetrics.has(modifier.metric)
      ? political
      : null;
  if (!target) return;
  const current = new Decimal(String(target[modifier.metric] ?? 0));
  const value = new Decimal(modifier.value);
  const next = modifier.operation === "MULTIPLY" ? current.mul(value.plus(1)) : current.plus(value);
  if (scheduledPoliticalMetrics.has(modifier.metric)) {
    target[modifier.metric] = Math.round(clampNumber(next.toNumber()));
    return;
  }
  if (["incomeGini", "wealthGini"].includes(modifier.metric)) {
    target[modifier.metric] = Decimal.max(0, Decimal.min(1, next)).toString();
    return;
  }
  if (modifier.metric === "unemploymentRate") {
    target[modifier.metric] = Decimal.max(0, Decimal.min(1, next)).toString();
    return;
  }
  target[modifier.metric] = next.toString();
}

async function handleCalculation(job: JobRow) {
  const countryId = String(job.payload.countryId ?? "");
  if (!job.turnId || !countryId) throw new Error("계산 작업 식별자가 없습니다.");
  const snapshots = await latestCountrySimulationState(countryId, job.campaignId);
  if (!snapshots.economic || !snapshots.demographic || !snapshots.political)
    throw new Error("계산 기준 스냅샷이 없습니다.");
  const beforeEconomic = { ...snapshots.economic } as Record<string, unknown>;
  const beforeDemographic = { ...snapshots.demographic } as Record<string, unknown>;
  const beforePolitical = { ...snapshots.political } as Record<string, unknown>;
  const overrides = new Map(snapshots.snapshotInputs.map((input) => [input.metric, input.value]));
  const sectorGrowth = weightedAverage(
    snapshots.sectors.map((sector) => ({ value: sector.growthRate, weight: sector.share })),
    snapshots.economic.realGdpGrowth,
  );
  const sectorProductivity = weightedAverage(
    snapshots.sectors.map((sector) => ({ value: sector.productivity, weight: sector.share })),
    snapshots.economic.productivityIndex,
  );
  const financialHealth = weightedAverage(
    snapshots.institutions.map((institution) => ({
      value: institution.health,
      weight: Math.max(institution.systemicImportance, 1),
    })),
    snapshots.economic.creditScore,
  );
  const corporateHealth = weightedAverage(
    snapshots.companies.map((company) => ({
      value: company.health,
      weight: Math.max(company.systemicImportance, 1),
    })),
    snapshots.economic.creditScore,
  );
  const policyRevenue = snapshots.fiscalPolicy
    ? new Decimal(snapshots.economic.nominalGdp).mul(snapshots.fiscalPolicy.taxRate).toString()
    : snapshots.economic.governmentRevenue;
  const input: EconomyInput = {
    population: snapshots.demographic.population,
    fertilityRate: snapshots.demographic.fertilityRate,
    populationGrowthRate: snapshots.demographic.populationGrowthRate,
    medianAge: snapshots.demographic.medianAge,
    lifeExpectancy: snapshots.demographic.lifeExpectancy,
    migrationShock: overrides.get("migrationShock") ?? "0",
    realGdp: snapshots.economic.realGdp,
    nominalGdp: snapshots.economic.nominalGdp,
    realGdpGrowth: snapshots.economic.realGdpGrowth,
    gdpDeflator: snapshots.economic.gdpDeflator,
    realGni: snapshots.economic.realGni,
    realGnp: snapshots.economic.realGnp,
    wealth: snapshots.economic.wealth,
    foreignReserves: snapshots.economic.foreignReserves,
    currencyValue: snapshots.economic.currencyValue,
    creditScore: String(snapshots.economic.creditScore),
    incomeGini: snapshots.economic.incomeGini,
    wealthGini: snapshots.economic.wealthGini,
    inflationRate: snapshots.economic.inflationRate,
    landPriceGrowth: snapshots.economic.landPriceGrowth,
    unemploymentRate: snapshots.economic.unemploymentRate,
    governmentRevenue: policyRevenue,
    governmentSpending: snapshots.economic.governmentSpending,
    previousGovernmentSpending:
      snapshots.previousEconomic?.governmentSpending ?? snapshots.economic.governmentSpending,
    nationalDebt: snapshots.economic.nationalDebt,
    policyRate: snapshots.economic.policyRate,
    currentAccountToGdp: snapshots.economic.currentAccountToGdp,
    productivityIndex: snapshots.economic.productivityIndex,
    educationIndex: overrides.get("educationIndex") ?? "0.7",
    researchInvestmentRate: overrides.get("researchInvestmentRate") ?? "0.025",
    stateCapacity: String(snapshots.political.stateCapacity),
    structuralReform: overrides.get("structuralReform") ?? "0",
    externalShock: overrides.get("externalShock") ?? "0",
    sectorShareWeightedGrowth: sectorGrowth.toString(),
    sectorProductivity: sectorProductivity.toString(),
    financialHealth: financialHealth.toString(),
    corporateHealth: corporateHealth.toString(),
  };
  const rules: EconomyRules = snapshots.ruleRow
    ? {
        version: snapshots.ruleRow.version,
        coefficients: { ...DEFAULT_ECONOMY_RULES.coefficients, ...snapshots.ruleRow.coefficients },
        growthMin: snapshots.ruleRow.ranges.growth?.min ?? DEFAULT_ECONOMY_RULES.growthMin,
        growthMax: snapshots.ruleRow.ranges.growth?.max ?? DEFAULT_ECONOMY_RULES.growthMax,
      }
    : DEFAULT_ECONOMY_RULES;
  const result = calculateEconomy(input, rules);
  const { population, populationGrowthRate, ...economicResult } = result;
  const afterEconomic = {
    ...beforeEconomic,
    ...economicResult,
    creditRating: creditRatingFromScore(economicResult.creditScore),
    calculationState: "MACRO_SIMULATED",
  };
  const afterDemographic = {
    ...beforeDemographic,
    population,
    populationGrowthRate,
    populationDensity: new Decimal(snapshots.demographic.population).isZero()
      ? snapshots.demographic.populationDensity
      : new Decimal(snapshots.demographic.populationDensity)
          .mul(population)
          .div(snapshots.demographic.population)
          .toString(),
  };
  const afterPolitical = {
    ...beforePolitical,
    calculationState: "BASE_READY",
  } as Record<string, unknown>;

  const [currentTurn, scheduledModifierRows, activePolicyRows, activeGoalRows] = await Promise.all([
    db.query.turns.findFirst({ where: eq(turns.id, job.turnId) }),
    db
      .select({ modifier: modifiers, startSequence: turns.sequence })
      .from(modifiers)
      .innerJoin(turns, eq(modifiers.startTurnId, turns.id))
      .where(eq(modifiers.countryId, countryId)),
    db
      .select({ submission: submissions, startSequence: turns.sequence })
      .from(submissions)
      .innerJoin(turns, eq(submissions.turnId, turns.id))
      .where(and(eq(submissions.countryId, countryId), eq(submissions.status, "PUBLISHED"))),
    db.query.policyGoals.findMany({
      where: and(eq(policyGoals.countryId, countryId), eq(policyGoals.status, "ACTIVE")),
    }),
  ]);
  if (!currentTurn) throw new Error("계산 턴을 찾을 수 없습니다.");

  const continuingModifiers = scheduledModifierRows.filter(({ modifier, startSequence }) => {
    const elapsed = currentTurn.sequence - startSequence;
    return elapsed >= 1 && modifier.durationTurns !== null && elapsed < modifier.durationTurns;
  });
  for (const { modifier } of continuingModifiers) {
    applyScheduledModifier(afterEconomic, afterPolitical, modifier);
  }

  const activePolicies = activePolicyRows.filter(({ submission, startSequence }) => {
    const elapsed = currentTurn.sequence - startSequence;
    return elapsed >= 1 && elapsed < submission.expectedDurationTurns;
  });
  const activePolicyImpulse = clampNumber(
    activePolicies.reduce(
      (sum, { submission }) =>
        sum +
        ((Number(submission.policySupport) - 50) / 25) * (Number(submission.publicAwareness) / 100),
      0,
    ),
    -4,
    4,
  );
  const politicalState = calculatePoliticalState({
    currentStability: Number(afterPolitical.stability ?? beforePolitical.stability),
    currentPolicySupport: Number(afterPolitical.policySupport ?? 50),
    governmentApproval: Number(afterPolitical.governmentApproval ?? 50),
    stateCapacity: Number(afterPolitical.stateCapacity ?? 50),
    unrest: Number(afterPolitical.unrest ?? 0),
    realGdpGrowth: Number(afterEconomic.realGdpGrowth),
    inflationRate: Number(afterEconomic.inflationRate),
    previousInflationRate: Number(snapshots.economic.inflationRate),
    unemploymentRate: Number(afterEconomic.unemploymentRate),
    previousUnemploymentRate: Number(snapshots.economic.unemploymentRate),
    incomeGini: Number(afterEconomic.incomeGini),
    activePolicyImpulse,
  });
  afterPolitical.stability = politicalState.stability;
  afterPolitical.policySupport = politicalState.policySupport;
  afterPolitical.governmentApproval = politicalState.governmentApproval;

  const goalUpdates: Array<{
    id: string;
    latestValue: string;
    status: "ACTIVE" | "ACHIEVED" | "FAILED";
  }> = [];
  for (const goal of activeGoalRows) {
    if (!isPolicyMetric(goal.metric)) continue;
    const currentValue = metricValue(goal.metric, afterEconomic, afterPolitical);
    if (currentValue === null) continue;
    const baseline = Number(goal.baselineValue);
    const target = Number(goal.targetValue);
    const achieved = target >= baseline ? currentValue >= target : currentValue <= target;
    const expired = currentTurn.gameDateEnd >= goal.targetGameDate;
    const status = achieved ? "ACHIEVED" : expired ? "FAILED" : "ACTIVE";
    goalUpdates.push({ id: goal.id, latestValue: String(currentValue), status });
    if (status === "ACHIEVED") {
      afterPolitical.policySupport = Math.round(
        clampNumber(Number(afterPolitical.policySupport) + 4),
      );
      afterPolitical.governmentApproval = Math.round(
        clampNumber(Number(afterPolitical.governmentApproval) + 3),
      );
    } else if (status === "FAILED") {
      const planned = goal.goalType === "PLANNED";
      afterPolitical.policySupport = Math.round(
        clampNumber(Number(afterPolitical.policySupport) - (planned ? 8 : 5)),
      );
      afterPolitical.governmentApproval = Math.round(
        clampNumber(Number(afterPolitical.governmentApproval) - (planned ? 7 : 4)),
      );
      afterPolitical.stability = Math.round(
        clampNumber(Number(afterPolitical.stability) - (planned ? 9 : 3)),
      );
    }
  }

  await db
    .insert(turnCountryWorkspaces)
    .values({
      turnId: job.turnId,
      countryId,
      beforeEconomic,
      afterEconomic,
      beforeDemographic,
      afterDemographic,
      beforePolitical,
      afterPolitical,
      evidence: {
        rulesVersion: rules.version,
        sourceEconomicSnapshotId: snapshots.economic.id,
        sourceDemographicSnapshotId: snapshots.demographic.id,
        sourcePoliticalSnapshotId: snapshots.political.id,
        deterministic: true,
        macroInput: input,
      },
    })
    .onConflictDoUpdate({
      target: [turnCountryWorkspaces.countryId, turnCountryWorkspaces.turnId],
      set: {
        beforeEconomic,
        afterEconomic,
        beforeDemographic,
        afterDemographic,
        beforePolitical,
        afterPolitical,
        evidence: {
          rulesVersion: rules.version,
          sourceEconomicSnapshotId: snapshots.economic.id,
          sourceDemographicSnapshotId: snapshots.demographic.id,
          sourcePoliticalSnapshotId: snapshots.political.id,
          deterministic: true,
          macroInput: input,
        },
        updatedAt: new Date(),
      },
    });
  for (const update of goalUpdates) {
    await db
      .update(policyGoals)
      .set({
        latestValue: update.latestValue,
        status: update.status,
        completedTurnId: update.status === "ACTIVE" ? null : job.turnId,
        updatedAt: new Date(),
      })
      .where(eq(policyGoals.id, update.id));
  }
}

async function persistJudgment(input: {
  job: JobRow;
  taskType: Extract<AiTaskType, "JUDGE_SUBMISSION" | "GENERATE_OPPOSITION_ACTION">;
  subjectType: string;
  subjectId: string;
  countryId: string;
  submissionId?: string;
  payload: Record<string, unknown>;
}) {
  if (!input.job.turnId) throw new Error("판정 턴이 없습니다.");
  const inputHash = createHash("sha256").update(JSON.stringify(input.payload)).digest("hex");
  const existing = await db.query.judgmentRuns.findFirst({
    where: and(
      eq(judgmentRuns.idempotencyKey, input.job.idempotencyKey),
      eq(judgmentRuns.status, "SUCCEEDED"),
    ),
  });
  if (existing) return existing;

  const [run] = await db
    .insert(judgmentRuns)
    .values({
      campaignId: input.job.campaignId,
      turnId: input.job.turnId,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      provider: "routing",
      model: "routing",
      promptVersion: "pending",
      inputHash,
      idempotencyKey: input.job.idempotencyKey,
      attempt: input.job.attempts,
    })
    .returning();
  try {
    const result = await generateJudgment({
      campaignId: input.job.campaignId,
      taskType: input.taskType,
      payload: input.payload,
      idempotencyKey: input.job.idempotencyKey,
    });
    const validations = validateEffects(result.data.effects);
    const [campaign, country, latestPolitical] = await Promise.all([
      db.query.campaigns.findFirst({
        where: eq(campaigns.id, input.job.campaignId),
      }),
      db.query.countries.findFirst({ where: eq(countries.id, input.countryId) }),
      db
        .select({ snapshot: politicalSnapshots })
        .from(politicalSnapshots)
        .innerJoin(turns, eq(politicalSnapshots.turnId, turns.id))
        .where(eq(politicalSnapshots.countryId, input.countryId))
        .orderBy(desc(turns.sequence))
        .limit(1),
    ]);
    const submissionForReception = input.submissionId
      ? await db.query.submissions.findFirst({ where: eq(submissions.id, input.submissionId) })
      : null;
    const reception = submissionForReception
      ? initialPolicyReception({
          verdict: result.data.verdict,
          confidence: result.data.confidence,
          bodyLength: submissionForReception.body.length,
        })
      : null;
    const politics = latestPolitical[0]?.snapshot;
    const effectiveness =
      reception && country
        ? calculatePolicyEffectiveness({
            stability: politics?.stability ?? 50,
            governmentApproval: politics?.governmentApproval ?? 50,
            policySupport: reception.policySupport,
            stateCapacity: politics?.stateCapacity ?? 50,
            awareness: reception.awareness,
            economicSystem: country.economicSystem as EconomicSystem,
            verdict: result.data.verdict,
          })
        : 1;

    const economicMultiplierMetrics = new Set([
      "realGdpGrowth",
      "inflationRate",
      "unemploymentRate",
      "productivityIndex",
    ]);
    const autoApprove = Boolean(
      input.taskType === "JUDGE_SUBMISSION" &&
      input.submissionId &&
      campaign?.autoApproveEconomicMultipliers &&
      result.data.verdict !== "NEEDS_ADMIN" &&
      result.data.warnings.length === 0 &&
      validations.length > 0 &&
      validations.every(
        (item) =>
          item.valid &&
          item.effect?.targetType === "COUNTRY" &&
          item.effect.targetId === input.countryId &&
          item.effect.operation === "MULTIPLY" &&
          economicMultiplierMetrics.has(item.effect.metric),
      ),
    );
    await db.transaction(async (tx) => {
      await tx
        .update(judgmentRuns)
        .set({
          provider: result.provider,
          model: result.model,
          promptVersion: result.promptVersion,
          status: "SUCCEEDED",
          latencyMs: result.latencyMs,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          rawOutput: result.raw,
          validatedOutput: result.data,
          completedAt: new Date(),
        })
        .where(eq(judgmentRuns.id, run.id));
      const [proposal] = await tx
        .insert(judgmentProposals)
        .values({
          judgmentRunId: run.id,
          submissionId: input.submissionId,
          countryId: input.countryId,
          turnId: input.job.turnId!,
          verdict: result.data.verdict,
          publicSummary: result.data.publicSummary,
          publicNarrative: result.data.publicNarrative,
          adminRationale: result.data.adminRationale,
          assumptions: result.data.assumptions,
          confidence: String(result.data.confidence),
          projectedChanges: result.data.projectedChanges,
          followUpEvents: result.data.followUpEvents,
          warnings: [
            ...result.data.warnings,
            ...validations.filter((item) => !item.valid).map((item) => item.warning),
          ],
          requiresAdmin: !autoApprove,
          status: autoApprove ? "APPROVED" : "PENDING",
          reviewedAt: autoApprove ? new Date() : null,
        })
        .returning();
      if (validations.length) {
        await tx.insert(effectProposals).values(
          validations
            .filter((item) => item.effect)
            .map((item) => {
              const effect = item.effect!;
              return {
                judgmentProposalId: proposal.id,
                targetType: effect.targetType,
                targetId: effect.targetId,
                metric: effect.metric,
                operation: effect.operation,
                value: effect.value,
                durationTurns: effect.durationTurns,
                reason: effect.reason,
                status: autoApprove
                  ? ("APPROVED" as const)
                  : item.valid
                    ? ("VALID" as const)
                    : ("WARNING" as const),
                validationWarning: item.valid ? null : item.warning,
                originalEffect: effect as DomainEffect,
              };
            }),
        );
      }
      if (input.submissionId) {
        await tx
          .update(submissions)
          .set({
            status: autoApprove ? "APPROVED" : "JUDGING",
            publicAwareness: reception ? String(reception.awareness) : undefined,
            policySupport: reception ? String(reception.policySupport) : undefined,
            effectivenessMultiplier: String(effectiveness),
            updatedAt: new Date(),
          })
          .where(eq(submissions.id, input.submissionId));
      }
    });
    return run;
  } catch (error) {
    await db
      .update(judgmentRuns)
      .set({
        status: "FAILED",
        errorCode: error instanceof AIProviderError ? error.code : "UNEXPECTED",
        errorMessage: error instanceof Error ? error.message : String(error),
        completedAt: new Date(),
      })
      .where(eq(judgmentRuns.id, run.id));
    throw error;
  }
}

async function handleSubmissionJudgment(job: JobRow) {
  const submissionId = String(job.payload.submissionId ?? "");
  const submission = await db.query.submissions.findFirst({
    where: eq(submissions.id, submissionId),
  });
  if (!submission) throw new Error("판정할 연재가 없습니다.");
  const [country, policyGoal, state] = await Promise.all([
    db.query.countries.findFirst({ where: eq(countries.id, submission.countryId) }),
    submission.policyGoalId
      ? db.query.policyGoals.findFirst({ where: eq(policyGoals.id, submission.policyGoalId) })
      : null,
    latestCountrySimulationState(submission.countryId, submission.campaignId),
  ]);
  await persistJudgment({
    job,
    taskType: "JUDGE_SUBMISSION",
    subjectType: "SUBMISSION",
    subjectId: submission.id,
    countryId: submission.countryId,
    submissionId: submission.id,
    payload: {
      subjectType: "SUBMISSION",
      countryId: submission.countryId,
      targetId: submission.countryId,
      title: submission.title,
      category: submission.category,
      body: submission.body,
      goal: submission.goal,
      policyGoal,
      targetMetrics: submission.targetMetrics,
      expectedDurationTurns: submission.expectedDurationTurns,
      budget: submission.budget,
      economicSystem: country?.economicSystem ?? "FREE_MARKET",
      currentEconomic: state.economic,
      currentPolitical: state.political,
      currentVersion: submission.currentVersion,
    },
  });
}

async function handleOpposition(job: JobRow) {
  const countryId = String(job.payload.countryId ?? "");
  if (!job.turnId) throw new Error("야당 행동 턴이 없습니다.");
  const existing = await db.query.oppositionActions.findFirst({
    where: and(
      eq(oppositionActions.countryId, countryId),
      eq(oppositionActions.turnId, job.turnId),
    ),
  });
  if (existing) return;
  const activeGoals = await db.query.policyGoals.findMany({
    where: and(eq(policyGoals.countryId, countryId), eq(policyGoals.status, "ACTIVE")),
  });
  const run = await persistJudgment({
    job,
    taskType: "GENERATE_OPPOSITION_ACTION",
    subjectType: "OPPOSITION",
    subjectId: `${countryId}:${job.turnId}`,
    countryId,
    payload: {
      subjectType: "OPPOSITION",
      countryId,
      targetId: countryId,
      triggers: job.payload.triggers ?? ["정부 지지도", "사회 불안", "조직력"],
      policyGoals: activeGoals.map((goal) => ({
        name: goal.name,
        metric: goal.metric,
        baselineValue: goal.baselineValue,
        latestValue: goal.latestValue,
        targetValue: goal.targetValue,
        targetGameDate: goal.targetGameDate,
      })),
    },
  });
  const proposal = await db.query.judgmentProposals.findFirst({
    where: eq(judgmentProposals.judgmentRunId, run.id),
  });
  if (!proposal) throw new Error("야당 행동 판정안이 없습니다.");
  const effects = await db.query.effectProposals.findMany({
    where: eq(effectProposals.judgmentProposalId, proposal.id),
  });
  await db.insert(oppositionActions).values({
    countryId,
    turnId: job.turnId,
    title: proposal.publicSummary,
    narrative: proposal.publicNarrative,
    rationale: proposal.adminRationale,
    effects: effects.map((effect) => ({
      targetType: effect.targetType as DomainEffect["targetType"],
      targetId: effect.targetId,
      metric: effect.metric,
      operation: effect.operation as DomainEffect["operation"],
      value: effect.value,
      durationTurns: effect.durationTurns,
      reason: effect.reason,
    })),
    requiresAdmin: true,
  });
}

async function startTaskRun(
  job: JobRow,
  subjectType: string,
  subjectId: string,
  payload: Record<string, unknown>,
) {
  if (!job.turnId) throw new Error("AI 작업 턴이 없습니다.");
  const [run] = await db
    .insert(judgmentRuns)
    .values({
      campaignId: job.campaignId,
      turnId: job.turnId,
      subjectType,
      subjectId,
      provider: "routing",
      model: "routing",
      promptVersion: "pending",
      inputHash: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
      idempotencyKey: job.idempotencyKey,
      attempt: job.attempts,
    })
    .returning();
  return run;
}

async function completeTaskRun<T>(runId: string, result: AIResult<T> & { promptVersion: string }) {
  await db
    .update(judgmentRuns)
    .set({
      provider: result.provider,
      model: result.model,
      promptVersion: result.promptVersion,
      status: "SUCCEEDED",
      latencyMs: result.latencyMs,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      rawOutput: result.raw,
      validatedOutput: result.data,
      completedAt: new Date(),
    })
    .where(eq(judgmentRuns.id, runId));
}

async function failTaskRun(runId: string, error: unknown) {
  await db
    .update(judgmentRuns)
    .set({
      status: "FAILED",
      errorCode: error instanceof AIProviderError ? error.code : "UNEXPECTED",
      errorMessage: error instanceof Error ? error.message : String(error),
      completedAt: new Date(),
    })
    .where(eq(judgmentRuns.id, runId));
}

async function handleTurnEvent(job: JobRow) {
  if (!job.turnId) throw new Error("사건 생성 턴이 없습니다.");
  const countryId = String(job.payload.countryId ?? "");
  const sourceId = `${job.turnId}:${countryId}:supply-signal`;
  const existing = await db.query.events.findFirst({
    where: and(eq(events.sourceType, "AUTO_TURN"), eq(events.sourceId, sourceId)),
  });
  if (existing) return;
  const workspace = await db.query.turnCountryWorkspaces.findFirst({
    where: and(
      eq(turnCountryWorkspaces.turnId, job.turnId),
      eq(turnCountryWorkspaces.countryId, countryId),
    ),
  });
  const payload = {
    subjectType: "TURN_EVENT",
    countryId,
    targetId: countryId,
    economicState: workspace?.afterEconomic ?? {},
    politicalState: workspace?.afterPolitical ?? {},
  };
  const run = await startTaskRun(job, "TURN_EVENT", `${countryId}:${job.turnId}`, payload);
  try {
    const result = await generateTurnEvent({
      campaignId: job.campaignId,
      payload,
      idempotencyKey: job.idempotencyKey,
    });
    const options = result.data.options.map((option) => ({
      ...option,
      effects: validateEffects(option.effects)
        .filter((item) => item.valid && item.effect)
        .map((item) => item.effect!),
    }));
    await db.transaction(async (tx) => {
      const [event] = await tx
        .insert(events)
        .values({
          campaignId: job.campaignId,
          countryId,
          title: result.data.title,
          subtitle: result.data.subtitle,
          body: result.data.body,
          visibility: "COUNTRY",
          status: "REVIEW",
          startTurnId: job.turnId!,
          sourceType: "AUTO_TURN",
          sourceId,
          trigger: { provider: result.provider, model: result.model },
          required: true,
          choiceMutable: true,
          requiresAdmin: true,
        })
        .returning();
      await tx.insert(eventOptions).values(
        options.map((option, index) => ({
          eventId: event.id,
          order: index + 1,
          label: option.label,
          description: option.description,
          expectedEffect: option.expectedEffect,
          effects: option.effects,
        })),
      );
    });
    await completeTaskRun(run.id, result);
  } catch (error) {
    await failTaskRun(run.id, error);
    throw error;
  }
}

async function handleAiDiplomacy(job: JobRow) {
  const proposalId = String(job.payload.proposalId ?? "");
  const proposal = await db.query.diplomaticProposals.findFirst({
    where: eq(diplomaticProposals.id, proposalId),
  });
  if (!proposal || !job.turnId) throw new Error("AI 외교 제안을 찾을 수 없습니다.");
  const existing = await db.query.diplomaticMessages.findFirst({
    where: and(eq(diplomaticMessages.proposalId, proposal.id), eq(diplomaticMessages.isAi, true)),
  });
  if (existing) return;
  const payload = {
    subjectType: "DIPLOMACY",
    countryId: proposal.toCountryId,
    targetId: proposal.toCountryId,
    fromCountryId: proposal.fromCountryId,
    proposalType: proposal.type,
    title: proposal.title,
    body: proposal.body,
    permittedResponses: ["ACCEPT", "REJECT", "COUNTER", "DELAY", "NEEDS_ADMIN"],
  };
  const run = await startTaskRun(job, "DIPLOMACY", proposal.id, payload);
  try {
    const result = await generateDiplomacyResponse({
      campaignId: job.campaignId,
      idempotencyKey: job.idempotencyKey,
      payload,
    });
    await db.transaction(async (tx) => {
      await tx.insert(diplomaticMessages).values({
        proposalId: proposal.id,
        senderCountryId: proposal.toCountryId,
        responseType: result.data.responseType,
        body: result.data.body,
        isAi: true,
        status: "DRAFT",
        relationDelta: result.data.relationDelta,
      });
      await tx
        .update(diplomaticProposals)
        .set({ status: "PENDING_REVIEW", updatedAt: new Date() })
        .where(eq(diplomaticProposals.id, proposal.id));
    });
    await completeTaskRun(run.id, result);
  } catch (error) {
    await failTaskRun(run.id, error);
    throw error;
  }
}

async function runHandler(job: JobRow) {
  if (job.type === "CALCULATE_COUNTRY_ECONOMY") return handleCalculation(job);
  if (job.type === "CALCULATE_COUNTRY_RESEARCH") return;
  if (job.type === "JUDGE_SUBMISSION") return handleSubmissionJudgment(job);
  if (job.type === "GENERATE_OPPOSITION_ACTION") return handleOpposition(job);
  if (job.type === "GENERATE_TURN_EVENT") return handleTurnEvent(job);
  if (job.type === "GENERATE_AI_DIPLOMACY_RESPONSE") return handleAiDiplomacy(job);
}

export async function processNextJob() {
  const job = await claimJob();
  if (!job) return false;
  try {
    await runHandler(job);
    await db
      .update(jobs)
      .set({ status: "SUCCEEDED", completedAt: new Date(), updatedAt: new Date() })
      .where(eq(jobs.id, job.id));
  } catch (error) {
    const finalAttempt = job.attempts >= job.maxAttempts;
    await db
      .update(jobs)
      .set({
        status: finalAttempt ? "FAILED" : "QUEUED",
        availableAt: finalAttempt ? new Date() : new Date(Date.now() + 500 * 2 ** job.attempts),
        errorCode: error instanceof AIProviderError ? error.code : "UNEXPECTED",
        errorMessage: error instanceof Error ? error.message : String(error),
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, job.id));
  }
  return true;
}

export async function drainJobs(limit = 100) {
  let processed = 0;
  while (processed < limit && (await processNextJob())) processed += 1;
  return processed;
}

export async function enqueueAiStage(campaignId: string, turnId: string) {
  const [countryRows, submissionRows, aiProposalRows] = await Promise.all([
    db.query.countries.findMany({
      where: and(eq(countries.campaignId, campaignId), eq(countries.setupStatus, "APPROVED")),
    }),
    db.query.submissions.findMany({
      where: and(eq(submissions.turnId, turnId), eq(submissions.status, "LOCKED")),
    }),
    db
      .select({ proposal: diplomaticProposals })
      .from(diplomaticProposals)
      .innerJoin(countries, eq(diplomaticProposals.toCountryId, countries.id))
      .where(
        and(
          eq(diplomaticProposals.turnId, turnId),
          eq(diplomaticProposals.status, "PENDING_AI"),
          eq(countries.isAi, true),
        ),
      ),
  ]);
  for (const submission of submissionRows) {
    await enqueueJob({
      campaignId,
      turnId,
      type: "JUDGE_SUBMISSION",
      payload: { submissionId: submission.id },
      idempotencyKey: `${campaignId}:${turnId}:JUDGE_SUBMISSION:${submission.id}:v${submission.currentVersion}`,
    });
  }
  for (const country of countryRows) {
    await enqueueJob({
      campaignId,
      turnId,
      type: "GENERATE_OPPOSITION_ACTION",
      payload: { countryId: country.id },
      idempotencyKey: `${campaignId}:${turnId}:OPPOSITION:${country.id}`,
    });
    await enqueueJob({
      campaignId,
      turnId,
      type: "GENERATE_TURN_EVENT",
      payload: { countryId: country.id },
      idempotencyKey: `${campaignId}:${turnId}:EVENT:${country.id}`,
    });
  }
  for (const { proposal } of aiProposalRows) {
    await enqueueJob({
      campaignId,
      turnId,
      type: "GENERATE_AI_DIPLOMACY_RESPONSE",
      payload: { proposalId: proposal.id },
      idempotencyKey: `${campaignId}:${turnId}:AI_DIPLOMACY:${proposal.id}`,
    });
  }
}

export async function turnJobsAreSettled(turnId: string, types?: JobRow["type"][]) {
  const rows = await db.query.jobs.findMany({
    where: and(
      eq(jobs.turnId, turnId),
      types ? inArray(jobs.type, types) : ne(jobs.status, "SUCCEEDED"),
    ),
  });
  return types
    ? rows.length > 0 && rows.every((job) => job.status === "SUCCEEDED")
    : rows.length === 0;
}
