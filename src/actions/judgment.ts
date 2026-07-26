"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/src/auth/session";
import { db } from "@/src/db";
import {
  auditLogs,
  effectProposals,
  judgmentProposals,
  reviewComments,
  submissions,
} from "@/src/db/schema";
import { validateEffect } from "@/src/domain/effects/registry";
import { enqueueJob, drainJobs } from "@/src/services/job-runner";
import { enforceActionRateLimit } from "@/src/services/rate-limit";

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
