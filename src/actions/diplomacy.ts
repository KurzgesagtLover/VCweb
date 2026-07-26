"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole, requireSession } from "@/src/auth/session";
import { db } from "@/src/db";
import {
  auditLogs,
  countries,
  countryRelations,
  diplomaticMessages,
  diplomaticProposals,
} from "@/src/db/schema";
import { getViewerContext } from "@/src/db/queries/viewer";
import { enqueueJob } from "@/src/services/job-runner";

const proposalSchema = z.object({
  toCountryId: z.string().uuid(),
  type: z.enum(["STATEMENT", "NEGOTIATION", "TREATY", "TRADE", "AID", "WARNING", "OTHER"]),
  title: z.string().trim().min(4).max(160),
  body: z.string().trim().min(20).max(6000),
  visibility: z.enum(["PUBLIC", "PRIVATE"]),
});

function assertPlainText(value: string) {
  if (/<\/?[a-z][^>]*>/i.test(value)) throw new Error("외교 문서에는 HTML을 사용할 수 없습니다.");
  return value;
}

export async function sendDiplomaticProposalAction(formData: FormData) {
  const session = await requireSession();
  const context = await getViewerContext(session.user.id);
  if (!context.campaign || !context.country || !context.turn || context.turn.status !== "DRAFT") {
    throw new Error("외교 제안 제출 기간이 아닙니다.");
  }
  const input = proposalSchema.parse(Object.fromEntries(formData.entries()));
  if (input.toCountryId === context.country.id)
    throw new Error("자국에는 외교 제안을 보낼 수 없습니다.");
  const target = await db.query.countries.findFirst({
    where: and(eq(countries.id, input.toCountryId), eq(countries.campaignId, context.campaign.id)),
  });
  if (!target) throw new Error("대상 국가를 찾을 수 없습니다.");
  const requiresAdmin = ["TREATY", "AID"].includes(input.type);
  const status = target.isAi ? "PENDING_AI" : "SENT";
  const [proposal] = await db.transaction(async (tx) => {
    const rows = await tx
      .insert(diplomaticProposals)
      .values({
        campaignId: context.campaign!.id,
        turnId: context.turn!.id,
        fromCountryId: context.country!.id,
        toCountryId: target.id,
        createdBy: session.user.id,
        type: input.type,
        title: input.title,
        body: assertPlainText(input.body),
        visibility: input.visibility,
        status,
        requiresAdmin,
      })
      .returning();
    await tx.insert(diplomaticMessages).values({
      proposalId: rows[0].id,
      senderCountryId: context.country!.id,
      authorUserId: session.user.id,
      responseType: "OFFER",
      body: input.body,
      status: "SENT",
      sentAt: new Date(),
    });
    return rows;
  });
  if (target.isAi) {
    await enqueueJob({
      campaignId: context.campaign.id,
      turnId: context.turn.id,
      type: "GENERATE_AI_DIPLOMACY_RESPONSE",
      payload: { proposalId: proposal.id },
      idempotencyKey: `${context.campaign.id}:${context.turn.id}:AI_DIPLOMACY:${proposal.id}`,
    });
  }
  revalidatePath("/diplomacy");
  revalidatePath("/admin/diplomacy");
}

const responseSchema = z.object({
  proposalId: z.string().uuid(),
  response: z.enum(["ACCEPT", "REJECT", "COUNTER", "DELAY"]),
  body: z.string().trim().min(5).max(4000),
});

const responseStatuses = {
  ACCEPT: "ACCEPTED",
  REJECT: "REJECTED",
  COUNTER: "COUNTERED",
  DELAY: "DELAYED",
} as const;

export async function respondToDiplomaticProposalAction(formData: FormData) {
  const session = await requireSession();
  const context = await getViewerContext(session.user.id);
  if (!context.country || !context.turn || context.turn.status !== "DRAFT") {
    throw new Error("외교 응답 기간이 아닙니다.");
  }
  const input = responseSchema.parse(Object.fromEntries(formData.entries()));
  const proposal = await db.query.diplomaticProposals.findFirst({
    where: and(
      eq(diplomaticProposals.id, input.proposalId),
      eq(diplomaticProposals.toCountryId, context.country.id),
      inArray(diplomaticProposals.status, ["SENT", "COUNTERED", "DELAYED"]),
    ),
  });
  if (!proposal) throw new Error("응답할 수 있는 제안이 아닙니다.");
  const relationDelta = input.response === "ACCEPT" ? 4 : input.response === "REJECT" ? -2 : 1;
  await db.transaction(async (tx) => {
    await tx.insert(diplomaticMessages).values({
      proposalId: proposal.id,
      senderCountryId: context.country!.id,
      authorUserId: session.user.id,
      responseType: input.response,
      body: assertPlainText(input.body),
      status: "SENT",
      relationDelta,
      sentAt: new Date(),
    });
    await tx
      .update(diplomaticProposals)
      .set({ status: responseStatuses[input.response], updatedAt: new Date() })
      .where(eq(diplomaticProposals.id, proposal.id));
    await tx
      .insert(countryRelations)
      .values({
        campaignId: proposal.campaignId,
        fromCountryId: context.country!.id,
        toCountryId: proposal.fromCountryId,
        score: relationDelta,
        tags: [input.response === "ACCEPT" ? "협력" : "협상 중"],
        lastInteraction: input.body.slice(0, 300),
      })
      .onConflictDoUpdate({
        target: [
          countryRelations.campaignId,
          countryRelations.fromCountryId,
          countryRelations.toCountryId,
        ],
        set: {
          score: sql`GREATEST(-100, LEAST(100, ${countryRelations.score} + ${relationDelta}))`,
          lastInteraction: input.body.slice(0, 300),
          updatedAt: new Date(),
        },
      });
  });
  revalidatePath("/diplomacy");
}

export async function reviewAiDiplomaticResponseAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const messageId = z.string().uuid().parse(formData.get("messageId"));
  const decision = z.enum(["APPROVED", "REJECTED"]).parse(formData.get("decision"));
  const body = z.string().trim().min(5).max(4000).parse(formData.get("body"));
  const message = await db.query.diplomaticMessages.findFirst({
    where: and(
      eq(diplomaticMessages.id, messageId),
      eq(diplomaticMessages.isAi, true),
      eq(diplomaticMessages.status, "DRAFT"),
    ),
  });
  if (!message) throw new Error("검토 가능한 AI 외교 답변이 아닙니다.");
  const proposal = await db.query.diplomaticProposals.findFirst({
    where: eq(diplomaticProposals.id, message.proposalId),
  });
  if (!proposal) throw new Error("원본 외교 제안이 없습니다.");
  await db.transaction(async (tx) => {
    await tx
      .update(diplomaticMessages)
      .set({
        body: assertPlainText(body),
        status: decision === "APPROVED" ? "SENT" : "REJECTED",
        sentAt: decision === "APPROVED" ? new Date() : null,
      })
      .where(eq(diplomaticMessages.id, message.id));
    await tx
      .update(diplomaticProposals)
      .set({ status: decision === "APPROVED" ? "COUNTERED" : "REJECTED", updatedAt: new Date() })
      .where(eq(diplomaticProposals.id, proposal.id));
    if (decision === "APPROVED") {
      await tx
        .insert(countryRelations)
        .values({
          campaignId: proposal.campaignId,
          fromCountryId: proposal.toCountryId,
          toCountryId: proposal.fromCountryId,
          score: message.relationDelta,
          tags: ["AI 협상"],
          lastInteraction: body.slice(0, 300),
        })
        .onConflictDoUpdate({
          target: [
            countryRelations.campaignId,
            countryRelations.fromCountryId,
            countryRelations.toCountryId,
          ],
          set: {
            score: sql`GREATEST(-100, LEAST(100, ${countryRelations.score} + ${message.relationDelta}))`,
            lastInteraction: body.slice(0, 300),
            updatedAt: new Date(),
          },
        });
    }
    await tx.insert(auditLogs).values({
      campaignId: proposal.campaignId,
      actorId: session.user.id,
      action: `${decision}_AI_DIPLOMACY_RESPONSE`,
      targetType: "DIPLOMATIC_MESSAGE",
      targetId: message.id,
      beforeSummary: { status: "DRAFT", body: message.body },
      afterSummary: { status: decision === "APPROVED" ? "SENT" : "REJECTED", body },
      reason: "AI 국가 외교 답변 관리자 검토",
    });
  });
  revalidatePath("/admin/diplomacy");
  revalidatePath("/diplomacy");
}
