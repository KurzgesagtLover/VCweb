"use server";

import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/src/auth/session";
import { db } from "@/src/db";
import {
  auditLogs,
  effectProposals,
  judgmentProposals,
  judgmentRuns,
  reviewComments,
  submissions,
} from "@/src/db/schema";
import type { DomainEffect } from "@/src/db/schema/gameplay";
import { validateEffect } from "@/src/domain/effects/registry";
import { policyMetricsForSubmission } from "@/src/domain/policy/metrics";
import { enqueueJob, drainJobs } from "@/src/services/job-runner";
import { enforceActionRateLimit } from "@/src/services/rate-limit";

export async function createManualJudgmentAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const submissionId = z.string().uuid().parse(formData.get("submissionId"));
  const verdict = z
    .enum(["SUCCESS", "PARTIAL", "FAILURE", "DELAYED"])
    .parse(formData.get("verdict"));
  const publicSummary = z.string().trim().min(1).max(1000).parse(formData.get("publicSummary"));
  const adminRationale = z.string().trim().min(1).max(4000).parse(formData.get("adminRationale"));
  const submission = await db.query.submissions.findFirst({
    where: eq(submissions.id, submissionId),
  });
  if (!submission) throw new Error("수동 판정할 연재를 찾을 수 없습니다.");
  if (submission.status === "APPROVED" || submission.status === "REJECTED") {
    throw new Error("이미 확정된 연재는 수동 판정할 수 없습니다.");
  }

  const effects: DomainEffect[] = [];
  for (const metric of policyMetricsForSubmission(submission.category, submission.targetMetrics)) {
    if (formData.get(`manualEnabled:${metric}`) !== "on") continue;
    const value = z
      .string()
      .trim()
      .min(1)
      .parse(formData.get(`manualValue:${metric}`));
    const durationTurns = z.coerce
      .number()
      .int()
      .min(1)
      .max(12)
      .parse(formData.get(`manualDuration:${metric}`));
    const effect: DomainEffect = {
      targetType: "COUNTRY",
      targetId: submission.countryId,
      metric,
      operation: "ADD",
      value,
      durationTurns,
      reason: `${submission.title}: 관리자 수동 판정`,
    };
    const checked = validateEffect(effect);
    if (!checked.valid || !checked.effect) {
      throw new Error(`${metric}: ${checked.warning}`);
    }
    effects.push(checked.effect as DomainEffect);
  }
  if ((verdict === "SUCCESS" || verdict === "PARTIAL") && effects.length === 0) {
    throw new Error("성공 또는 부분 성공 판정에는 하나 이상의 수치 효과가 필요합니다.");
  }

  const pendingProposals = await db.query.judgmentProposals.findMany({
    where: and(
      eq(judgmentProposals.submissionId, submission.id),
      eq(judgmentProposals.status, "PENDING"),
    ),
  });
  const pendingIds = pendingProposals.map((proposal) => proposal.id);
  const now = new Date();
  const idempotencyKey = `${submission.campaignId}:${submission.turnId}:MANUAL_JUDGMENT:${submission.id}:${randomUUID()}`;
  const manualOutput = { verdict, publicSummary, adminRationale, effects };
  const inputHash = createHash("sha256").update(JSON.stringify(manualOutput)).digest("hex");

  await db.transaction(async (tx) => {
    if (pendingIds.length) {
      await tx
        .update(effectProposals)
        .set({ status: "REJECTED", updatedAt: now })
        .where(inArray(effectProposals.judgmentProposalId, pendingIds));
      await tx
        .update(judgmentProposals)
        .set({
          status: "REJECTED",
          reviewedBy: session.user.id,
          reviewedAt: now,
          updatedAt: now,
        })
        .where(inArray(judgmentProposals.id, pendingIds));
    }
    const [run] = await tx
      .insert(judgmentRuns)
      .values({
        campaignId: submission.campaignId,
        turnId: submission.turnId,
        subjectType: "SUBMISSION",
        subjectId: submission.id,
        provider: "manual",
        model: "admin",
        promptVersion: "manual-v1",
        inputHash,
        idempotencyKey,
        attempt: 1,
        status: "SUCCEEDED",
        validatedOutput: manualOutput,
        completedAt: now,
      })
      .returning();
    const [proposal] = await tx
      .insert(judgmentProposals)
      .values({
        judgmentRunId: run.id,
        submissionId: submission.id,
        countryId: submission.countryId,
        turnId: submission.turnId,
        verdict,
        publicSummary,
        publicNarrative: publicSummary,
        adminRationale,
        assumptions: ["관리자가 AI 제안 없이 직접 판정함"],
        confidence: "1",
        projectedChanges: [],
        followUpEvents: [],
        warnings: [],
        requiresAdmin: false,
        status: "APPROVED",
        reviewedBy: session.user.id,
        reviewedAt: now,
      })
      .returning();
    if (effects.length) {
      await tx.insert(effectProposals).values(
        effects.map((effect) => ({
          judgmentProposalId: proposal.id,
          targetType: effect.targetType,
          targetId: effect.targetId,
          metric: effect.metric,
          operation: effect.operation,
          value: effect.value,
          durationTurns: effect.durationTurns,
          reason: effect.reason,
          status: "APPROVED" as const,
          validationWarning: null,
          originalEffect: effect,
        })),
      );
    }
    await tx
      .update(submissions)
      .set({ status: "APPROVED", updatedAt: now })
      .where(eq(submissions.id, submission.id));
    await tx.insert(auditLogs).values({
      campaignId: submission.campaignId,
      actorId: session.user.id,
      action: "CREATE_MANUAL_JUDGMENT",
      targetType: "JUDGMENT_PROPOSAL",
      targetId: proposal.id,
      beforeSummary: { submissionStatus: submission.status, replacedPending: pendingIds },
      afterSummary: { verdict, effects },
      reason: adminRationale,
    });
  });

  revalidatePath("/admin/submissions");
  revalidatePath("/submissions");
  revalidatePath("/admin");
}

export async function reviewJudgmentAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const proposalId = z.string().uuid().parse(formData.get("proposalId"));
  const decision = z.enum(["APPROVED", "REJECTED", "NEEDS_INFO"]).parse(formData.get("decision"));
  const proposal = await db.query.judgmentProposals.findFirst({
    where: and(eq(judgmentProposals.id, proposalId), eq(judgmentProposals.status, "PENDING")),
  });
  if (!proposal || !proposal.submissionId) throw new Error("검토 가능한 연재 판정이 아닙니다.");
  const submission = await db.query.submissions.findFirst({
    where: eq(submissions.id, proposal.submissionId),
  });
  if (!submission) throw new Error("원본 연재를 찾을 수 없습니다.");
  const publicSummary = z
    .string()
    .trim()
    .min(1)
    .max(1000)
    .parse(formData.get("publicSummary") ?? proposal.publicSummary);
  const adminRationale = z
    .string()
    .trim()
    .min(1)
    .max(4000)
    .parse(formData.get("adminRationale") ?? proposal.adminRationale);

  if (decision === "NEEDS_INFO") {
    const question = z.string().trim().min(5).max(2000).parse(formData.get("question"));
    await db.transaction(async (tx) => {
      await tx
        .update(judgmentProposals)
        .set({
          status: "NEEDS_INFO",
          reviewedBy: session.user.id,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(judgmentProposals.id, proposal.id));
      await tx
        .update(submissions)
        .set({ status: "NEEDS_INFO", updatedAt: new Date() })
        .where(eq(submissions.id, submission.id));
      await tx.insert(reviewComments).values({
        submissionId: submission.id,
        authorId: session.user.id,
        isAdmin: true,
        body: question,
      });
    });
    revalidatePath("/admin/submissions");
    revalidatePath("/submissions");
    return;
  }

  const effects = await db.query.effectProposals.findMany({
    where: eq(effectProposals.judgmentProposalId, proposal.id),
  });
  const revised = effects.map((effect) => {
    const value = String(formData.get(`effectValue:${effect.id}`) ?? effect.value);
    const durationRaw = String(
      formData.get(`effectDuration:${effect.id}`) ?? effect.durationTurns ?? "",
    );
    const durationTurns = durationRaw ? Number(durationRaw) : null;
    const checked = validateEffect({
      targetType: effect.targetType,
      targetId: effect.targetId,
      metric: effect.metric,
      operation: effect.operation,
      value,
      durationTurns,
      reason: effect.reason,
    });
    if (!checked.valid && decision === "APPROVED") {
      throw new Error(`${effect.metric}: ${checked.warning}`);
    }
    return { effect, checked };
  });

  await db.transaction(async (tx) => {
    for (const item of revised) {
      await tx
        .update(effectProposals)
        .set({
          value: item.checked.effect?.value ?? item.effect.value,
          durationTurns: item.checked.effect?.durationTurns ?? item.effect.durationTurns,
          status: decision === "APPROVED" ? "APPROVED" : "REJECTED",
          validationWarning: item.checked.valid ? null : item.checked.warning,
          updatedAt: new Date(),
        })
        .where(eq(effectProposals.id, item.effect.id));
    }
    await tx
      .update(judgmentProposals)
      .set({
        publicSummary,
        adminRationale,
        status: decision,
        reviewedBy: session.user.id,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(judgmentProposals.id, proposal.id));
    await tx
      .update(submissions)
      .set({ status: decision, updatedAt: new Date() })
      .where(eq(submissions.id, submission.id));
    await tx.insert(auditLogs).values({
      campaignId: submission.campaignId,
      actorId: session.user.id,
      action: `${decision}_JUDGMENT`,
      targetType: "JUDGMENT_PROPOSAL",
      targetId: proposal.id,
      beforeSummary: { status: proposal.status, effects: effects.length },
      afterSummary: { status: decision, effects: revised.map((item) => item.checked.effect) },
      reason: adminRationale,
    });
  });
  revalidatePath("/admin/submissions");
  revalidatePath("/submissions");
  revalidatePath("/admin");
}

export async function regenerateJudgmentAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  enforceActionRateLimit(`judgment-regenerate:${session.user.id}`, 6, 60_000);
  const submissionId = z.string().uuid().parse(formData.get("submissionId"));
  const submission = await db.query.submissions.findFirst({
    where: eq(submissions.id, submissionId),
  });
  if (!submission) throw new Error("재판정할 연재가 없습니다.");
  const attempt = Date.now();
  await enqueueJob({
    campaignId: submission.campaignId,
    turnId: submission.turnId,
    type: "JUDGE_SUBMISSION",
    payload: { submissionId: submission.id },
    idempotencyKey: `${submission.campaignId}:${submission.turnId}:JUDGE_SUBMISSION:${submission.id}:regen:${attempt}`,
  });
  await drainJobs(1);
  revalidatePath("/admin/submissions");
}
