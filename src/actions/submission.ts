"use server";

import Decimal from "decimal.js";
import { and, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/src/auth/session";
import { db } from "@/src/db";
import {
  auditLogs,
  economicSnapshots,
  effectProposals,
  judgmentProposals,
  modifiers,
  policyGoals,
  politicalSnapshots,
  reviewComments,
  submissions,
  submissionVersions,
  turns,
} from "@/src/db/schema";
import { getViewerContext } from "@/src/db/queries/viewer";
import {
  CATEGORY_TARGET_METRICS,
  isPolicyMetric,
  POLICY_METRICS,
  SERIAL_CATEGORIES,
  type PolicyMetric,
  type SerialCategory,
} from "@/src/domain/policy/metrics";
import {
  calculatePolicyEffectiveness,
  calculatePromotedPolicySupport,
  calculatePromotionState,
  type EconomicSystem,
} from "@/src/domain/policy/model";
import { enforceActionRateLimit } from "@/src/services/rate-limit";

const submissionSchema = z.object({
  submissionId: z.string().uuid().optional().or(z.literal("")),
  policyGoalId: z.string().uuid().optional().or(z.literal("")),
  title: z.string().trim().min(4).max(160),
  category: z.enum(SERIAL_CATEGORIES),
  body: z.string().trim().min(200).max(12000),
  goal: z.string().trim().min(10).max(1000),
  expectedDurationTurns: z.coerce.number().int().min(1).max(12),
  budget: z.string().trim().max(50).optional(),
  relatedCountryIds: z.string().optional(),
  relatedTechIds: z.string().optional(),
  targetMetrics: z.array(z.string()).min(2).max(6),
});

const percentageMetrics = new Set<PolicyMetric>([
  "realGdpGrowth",
  "inflationRate",
  "unemploymentRate",
  "debtToGdp",
  "currentAccountToGdp",
]);

function assertSafeMarkdown(value: string) {
  if (/<\/?[a-z][^>]*>/i.test(value)) {
    throw new Error("연재 본문에는 HTML을 사용할 수 없습니다. 마크다운 문법만 사용해 주세요.");
  }
  if (/\u0000/.test(value)) throw new Error("본문에 허용되지 않는 문자가 있습니다.");
  return value;
}

function parseUuidList(value?: string) {
  if (!value?.trim()) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => z.string().uuid().safeParse(item).success);
}

function validateTargetMetrics(category: SerialCategory, values: string[]) {
  const unique = [...new Set(values)];
  const allowed = new Set(CATEGORY_TARGET_METRICS[category]);
  if (
    unique.length < 2 ||
    unique.length > 6 ||
    unique.some((metric) => !allowed.has(metric as never))
  ) {
    throw new Error("선택한 분야에서 목표 지표를 2~6개 선택해 주세요.");
  }
  return unique;
}

async function latestPolicySnapshots(countryId: string) {
  const [economic, political] = await Promise.all([
    db
      .select({ snapshot: economicSnapshots })
      .from(economicSnapshots)
      .innerJoin(turns, eq(economicSnapshots.turnId, turns.id))
      .where(eq(economicSnapshots.countryId, countryId))
      .orderBy(desc(turns.sequence))
      .limit(1),
    db
      .select({ snapshot: politicalSnapshots })
      .from(politicalSnapshots)
      .innerJoin(turns, eq(politicalSnapshots.turnId, turns.id))
      .where(eq(politicalSnapshots.countryId, countryId))
      .orderBy(desc(turns.sequence))
      .limit(1),
  ]);
  return { economic: economic[0]?.snapshot, political: political[0]?.snapshot };
}

export async function saveSubmissionAction(formData: FormData) {
  const session = await requireSession();
  enforceActionRateLimit(`submission:${session.user.id}`, 12, 60_000);
  const context = await getViewerContext(session.user.id);
  if (!context.campaign || !context.country || !context.turn)
    throw new Error("운영 중인 국가가 없습니다.");
  if (context.turn.status !== "DRAFT") throw new Error("현재 연재 접수 기간이 종료되었습니다.");

  const input = submissionSchema.parse({
    ...Object.fromEntries(formData.entries()),
    targetMetrics: formData.getAll("targetMetrics").map(String),
  });
  const body = assertSafeMarkdown(input.body);
  const targetMetrics = validateTargetMetrics(input.category, input.targetMetrics);

  let budget: string | null = null;
  if (input.budget) {
    const value = new Decimal(input.budget);
    if (!value.isFinite() || value.isNegative())
      throw new Error("예산은 0 이상의 숫자여야 합니다.");
    budget = value.toString();
  }

  if (input.policyGoalId) {
    const linkedGoal = await db.query.policyGoals.findFirst({
      where: and(
        eq(policyGoals.id, input.policyGoalId),
        eq(policyGoals.countryId, context.country.id),
        eq(policyGoals.status, "ACTIVE"),
      ),
    });
    if (!linkedGoal) throw new Error("연결할 수 없는 정책 목표입니다.");
  }

  const metadata = {
    category: input.category,
    goal: input.goal,
    policyGoalId: input.policyGoalId || null,
    targetMetrics,
    expectedDurationTurns: input.expectedDurationTurns,
    budget,
    relatedCountryIds: parseUuidList(input.relatedCountryIds),
    relatedTechIds: parseUuidList(input.relatedTechIds),
  };
  const characterCount = body.length;
  const estimatedTokens = Math.ceil(characterCount / 3);

  await db.transaction(async (tx) => {
    if (input.submissionId) {
      const existing = await tx.query.submissions.findFirst({
        where: and(
          eq(submissions.id, input.submissionId),
          eq(submissions.userId, session.user.id),
          eq(submissions.countryId, context.country!.id),
          inArray(submissions.status, ["DRAFT", "SUBMITTED"]),
        ),
      });
      if (!existing || existing.turnId !== context.turn!.id) {
        throw new Error("수정 가능한 연재가 아닙니다.");
      }
      const nextVersion = existing.currentVersion + 1;
      await tx
        .update(submissions)
        .set({
          policyGoalId: input.policyGoalId || null,
          title: input.title,
          category: input.category,
          body,
          goal: input.goal,
          targetMetrics,
          expectedDurationTurns: input.expectedDurationTurns,
          budget,
          relatedCountryIds: metadata.relatedCountryIds,
          relatedTechIds: metadata.relatedTechIds,
          currentVersion: nextVersion,
          characterCount,
          estimatedTokens,
          updatedAt: new Date(),
        })
        .where(eq(submissions.id, existing.id));
      await tx.insert(submissionVersions).values({
        submissionId: existing.id,
        version: nextVersion,
        title: input.title,
        body,
        metadata,
        createdBy: session.user.id,
      });
      return;
    }

    const [created] = await tx
      .insert(submissions)
      .values({
        campaignId: context.campaign.id,
        countryId: context.country!.id,
        userId: session.user.id,
        turnId: context.turn!.id,
        policyGoalId: input.policyGoalId || null,
        title: input.title,
        category: input.category,
        body,
        goal: input.goal,
        targetMetrics,
        expectedDurationTurns: input.expectedDurationTurns,
        budget,
        relatedCountryIds: metadata.relatedCountryIds,
        relatedTechIds: metadata.relatedTechIds,
        characterCount,
        estimatedTokens,
      })
      .returning();
    await tx.insert(submissionVersions).values({
      submissionId: created.id,
      version: 1,
      title: input.title,
      body,
      metadata,
      createdBy: session.user.id,
    });
    await tx.insert(auditLogs).values({
      campaignId: context.campaign.id,
      actorId: session.user.id,
      action: "CREATE_SUBMISSION",
      targetType: "SUBMISSION",
      targetId: created.id,
      beforeSummary: {},
      afterSummary: { title: created.title, version: 1, targetMetrics },
      reason: "플레이어 연재 초안 작성",
    });
  });
  revalidatePath("/submissions");
}

export async function submitSubmissionAction(formData: FormData) {
  const session = await requireSession();
  const context = await getViewerContext(session.user.id);
  const submissionId = z.string().uuid().parse(formData.get("submissionId"));
  if (!context.turn || context.turn.status !== "DRAFT") throw new Error("제출 기간이 아닙니다.");
  const submission = await db.query.submissions.findFirst({
    where: and(
      eq(submissions.id, submissionId),
      eq(submissions.userId, session.user.id),
      eq(submissions.turnId, context.turn.id),
      eq(submissions.status, "DRAFT"),
    ),
  });
  if (!submission) throw new Error("제출할 수 없는 연재입니다.");
  if (submission.characterCount < 200 || submission.targetMetrics.length < 2) {
    throw new Error("본문 200자 이상과 목표 지표 2개 이상이 필요합니다.");
  }
  await db
    .update(submissions)
    .set({ status: "SUBMITTED", submittedAt: new Date(), updatedAt: new Date() })
    .where(eq(submissions.id, submission.id));
  revalidatePath("/submissions");
  revalidatePath("/admin/submissions");
}

export async function createPolicyGoalAction(formData: FormData) {
  const session = await requireSession();
  const context = await getViewerContext(session.user.id);
  if (!context.campaign || !context.country || !context.turn)
    throw new Error("운영 중인 국가가 없습니다.");
  if (context.turn.status !== "DRAFT") throw new Error("현재 목표를 설정할 수 없습니다.");

  const metrics = formData
    .getAll("metrics")
    .map((value) => z.string().refine(isPolicyMetric).parse(value));
  const targetInputs = formData
    .getAll("targetValues")
    .map((value) => z.coerce.number().finite().parse(value));
  if (metrics.length === 0 || metrics.length > 5 || metrics.length !== targetInputs.length) {
    throw new Error("정책 목표를 1개 이상 5개 이하로 설정해야 합니다.");
  }
  if (new Set(metrics).size !== metrics.length) {
    throw new Error("같은 목표 지표를 중복해서 설정할 수 없습니다.");
  }
  const durationYears = z.coerce.number().int().min(1).max(20).parse(formData.get("durationYears"));
  const customName = z
    .string()
    .trim()
    .max(120)
    .optional()
    .parse(formData.get("name") || undefined);

  const activeGoals = await db.query.policyGoals.findMany({
    where: and(eq(policyGoals.countryId, context.country.id), eq(policyGoals.status, "ACTIVE")),
  });
  if (activeGoals.length + metrics.length > 5) {
    throw new Error("동시에 진행할 수 있는 정책 목표는 5개까지입니다.");
  }

  const snapshots = await latestPolicySnapshots(context.country.id);
  const startDate = new Date(`${context.turn.gameDateStart}T00:00:00.000Z`);
  startDate.setUTCFullYear(startDate.getUTCFullYear() + durationYears);
  const goalType = context.country.economicSystem as EconomicSystem;
  const targets = metrics.map((metric, index) => {
    const source =
      POLICY_METRICS[metric].source === "economic" ? snapshots.economic : snapshots.political;
    const baseline = Number((source as Record<string, unknown> | undefined)?.[metric]);
    if (!Number.isFinite(baseline)) throw new Error("해당 지표의 기준값이 없습니다.");
    const targetValue = percentageMetrics.has(metric)
      ? targetInputs[index] / 100
      : targetInputs[index];
    const generatedName =
      goalType === "PLANNED"
        ? `${durationYears}개년 ${POLICY_METRICS[metric].label} 계획`
        : `${POLICY_METRICS[metric].label} 목표`;
    const name =
      customName && metrics.length > 1
        ? `${customName} · ${POLICY_METRICS[metric].label}`
        : customName || generatedName;
    return { metric, baseline, targetValue, name };
  });

  await db.transaction(async (tx) => {
    const createdGoals = await tx
      .insert(policyGoals)
      .values(
        targets.map(({ metric, baseline, targetValue, name }) => ({
          campaignId: context.campaign!.id,
          countryId: context.country!.id,
          createdBy: session.user.id,
          name,
          goalType,
          metric,
          baselineValue: String(baseline),
          targetValue: String(targetValue),
          latestValue: String(baseline),
          startTurnId: context.turn!.id,
          targetGameDate: startDate.toISOString().slice(0, 10),
        })),
      )
      .returning();
    await tx.insert(auditLogs).values(
      createdGoals.map((goal, index) => ({
        campaignId: context.campaign!.id,
        actorId: session.user.id,
        action: "CREATE_POLICY_GOAL",
        targetType: "POLICY_GOAL",
        targetId: goal.id,
        beforeSummary: {},
        afterSummary: {
          name: targets[index].name,
          goalType,
          metric: targets[index].metric,
          baselineValue: targets[index].baseline,
          targetValue: targets[index].targetValue,
          targetGameDate: startDate.toISOString().slice(0, 10),
        },
        reason: `${goalType === "PLANNED" ? "국가계획" : "정책"} 목표 설정`,
      })),
    );
  });
  revalidatePath("/submissions");
}

export async function addPolicyPromotionAction(formData: FormData) {
  const session = await requireSession();
  const submissionId = z.string().uuid().parse(formData.get("submissionId"));
  const amount = new Decimal(z.string().trim().min(1).max(50).parse(formData.get("amount")));
  if (!amount.isFinite() || amount.lte(0)) throw new Error("홍보 예산은 0보다 커야 합니다.");

  const submission = await db.query.submissions.findFirst({
    where: and(
      eq(submissions.id, submissionId),
      eq(submissions.userId, session.user.id),
      eq(submissions.status, "PUBLISHED"),
    ),
  });
  if (!submission) throw new Error("홍보할 수 있는 연재가 아닙니다.");

  const context = await getViewerContext(session.user.id);
  if (
    !context.campaign ||
    !context.country ||
    !context.turn ||
    context.country.id !== submission.countryId
  )
    throw new Error("현재 운영 국가의 연재가 아닙니다.");
  const startTurn = await db.query.turns.findFirst({
    where: eq(turns.id, submission.turnId),
  });
  if (!startTurn) throw new Error("연재 시작 턴을 찾을 수 없습니다.");
  const elapsedTurns = context.turn.sequence - startTurn.sequence;
  if (elapsedTurns < 0 || elapsedTurns >= submission.expectedDurationTurns) {
    throw new Error("연재 실행 기간이 끝나 더 이상 홍보할 수 없습니다.");
  }
  const snapshots = await latestPolicySnapshots(submission.countryId);
  if (!snapshots.political) throw new Error("정치 지표가 없습니다.");

  const cumulativeSpend = new Decimal(submission.promotionSpend).plus(amount);
  const promotion = calculatePromotionState({
    currentAwareness: Number(submission.publicAwareness),
    cumulativeSpend: cumulativeSpend.toNumber(),
    policyBudget: Number(submission.budget ?? 1),
  });

  const linkedEffects = await db
    .select({ effect: effectProposals, verdict: judgmentProposals.verdict })
    .from(effectProposals)
    .innerJoin(judgmentProposals, eq(effectProposals.judgmentProposalId, judgmentProposals.id))
    .where(
      and(
        eq(judgmentProposals.submissionId, submission.id),
        inArray(effectProposals.status, ["APPROVED", "APPLIED"]),
      ),
    );
  const verdict = linkedEffects[0]?.verdict ?? "NEEDS_ADMIN";
  const policySupport = calculatePromotedPolicySupport({
    currentSupport: Number(submission.policySupport),
    awareness: promotion.awareness,
    verdict,
  });
  const effectiveness = calculatePolicyEffectiveness({
    stability: snapshots.political.stability,
    governmentApproval: snapshots.political.governmentApproval,
    policySupport,
    stateCapacity: snapshots.political.stateCapacity,
    awareness: promotion.awareness,
    overpromotionPenalty: promotion.overpromotionPenalty,
    economicSystem: context.country.economicSystem as EconomicSystem,
    verdict,
  });

  await db.transaction(async (tx) => {
    await tx
      .update(submissions)
      .set({
        promotionSpend: cumulativeSpend.toString(),
        publicAwareness: String(promotion.awareness),
        policySupport: String(policySupport),
        effectivenessMultiplier: String(effectiveness),
        overpromotionPenalty: String(promotion.overpromotionPenalty),
        updatedAt: new Date(),
      })
      .where(eq(submissions.id, submission.id));
    for (const { effect } of linkedEffects) {
      await tx
        .update(modifiers)
        .set({
          value: new Decimal(effect.value).mul(effectiveness).toString(),
          updatedAt: new Date(),
        })
        .where(eq(modifiers.sourceId, `judgment-effect:${effect.id}`));
    }
    await tx.insert(auditLogs).values({
      campaignId: context.campaign!.id,
      actorId: session.user.id,
      action: "ADD_POLICY_PROMOTION",
      targetType: "SUBMISSION",
      targetId: submission.id,
      beforeSummary: {
        promotionSpend: submission.promotionSpend,
        publicAwareness: submission.publicAwareness,
        policySupport: submission.policySupport,
        effectivenessMultiplier: submission.effectivenessMultiplier,
      },
      afterSummary: {
        promotionSpend: cumulativeSpend.toString(),
        publicAwareness: promotion.awareness,
        policySupport,
        effectivenessMultiplier: effectiveness,
        overpromotionPenalty: promotion.overpromotionPenalty,
      },
      reason: `연재 홍보 예산 ${amount.toString()} 집행`,
    });
  });
  revalidatePath("/submissions");
}

export async function addSubmissionCommentAction(formData: FormData) {
  const session = await requireSession();
  const submissionId = z.string().uuid().parse(formData.get("submissionId"));
  const body = z.string().trim().min(2).max(2000).parse(formData.get("body"));
  const submission = await db.query.submissions.findFirst({
    where: and(eq(submissions.id, submissionId), eq(submissions.userId, session.user.id)),
  });
  if (!submission) throw new Error("답변할 연재를 찾을 수 없습니다.");
  await db.transaction(async (tx) => {
    await tx.insert(reviewComments).values({
      submissionId,
      authorId: session.user.id,
      isAdmin: false,
      body: assertSafeMarkdown(body),
    });
    if (submission.status === "NEEDS_INFO") {
      await tx
        .update(submissions)
        .set({ status: "SUBMITTED", updatedAt: new Date() })
        .where(eq(submissions.id, submission.id));
    }
  });
  revalidatePath("/submissions");
}
