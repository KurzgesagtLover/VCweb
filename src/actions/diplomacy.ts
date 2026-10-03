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
  diplomaticBlocMembers,
  diplomaticBlocs,
  diplomaticMessages,
  diplomaticProposals,
  economicBlocMembers,
  economicBlocs,
} from "@/src/db/schema";
import { getViewerContext } from "@/src/db/queries/viewer";
import { countryEntityTypeSchema } from "@/src/domain/country/entity-type";
import {
  SYMMETRIC_DIPLOMATIC_STATUSES,
  defaultDiplomaticStatus,
  diplomaticProposalIntentSchema,
  diplomaticRelationStatusSchema,
  type DiplomaticProposalIntent,
  type DiplomaticRelationStatus,
} from "@/src/domain/diplomacy/status";
import { enqueueJob } from "@/src/services/job-runner";
import { rebuildAutomaticMapBorders } from "@/src/services/rebuild-automatic-map";

const proposalSchema = z.object({
  toCountryId: z.string().uuid(),
  type: z.enum(["STATEMENT", "NEGOTIATION", "TREATY", "TRADE", "AID", "WARNING", "OTHER"]),
  intent: diplomaticProposalIntentSchema.default("GENERAL"),
  title: z.string().trim().min(4).max(160),
  body: z.string().trim().min(20).max(6000),
  visibility: z.enum(["PUBLIC", "PRIVATE"]),
  blocName: z.string().trim().min(2).max(80).optional(),
  blocAcronym: z.string().trim().min(2).max(12).optional(),
  blocColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  blocDescription: z.string().trim().max(500).optional(),
});

const allianceTermsSchema = z.object({
  blocName: z.string().trim().min(2).max(80),
  blocAcronym: z.string().trim().min(2).max(12),
  blocColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  blocDescription: z.string().trim().max(500).default(""),
});

type DiplomacyTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function assertPlainText(value: string) {
  if (/<\/?[a-z][^>]*>/i.test(value)) throw new Error("외교 문서에는 HTML을 사용할 수 없습니다.");
  return value;
}

async function upsertRelationStatus(
  tx: DiplomacyTransaction,
  input: {
    campaignId: string;
    fromCountryId: string;
    toCountryId: string;
    status: DiplomaticRelationStatus;
    interaction: string;
  },
) {
  await tx
    .insert(countryRelations)
    .values({
      campaignId: input.campaignId,
      fromCountryId: input.fromCountryId,
      toCountryId: input.toCountryId,
      status: input.status,
      lastInteraction: input.interaction.slice(0, 300),
    })
    .onConflictDoUpdate({
      target: [
        countryRelations.campaignId,
        countryRelations.fromCountryId,
        countryRelations.toCountryId,
      ],
      set: {
        status: input.status,
        lastInteraction: input.interaction.slice(0, 300),
        updatedAt: new Date(),
      },
    });
}

async function setAcceptedRelationStatus(
  tx: DiplomacyTransaction,
  proposal: typeof diplomaticProposals.$inferSelect,
  status: DiplomaticRelationStatus,
) {
  const interaction = `${proposal.title} 수락`;
  await upsertRelationStatus(tx, {
    campaignId: proposal.campaignId,
    fromCountryId: proposal.fromCountryId,
    toCountryId: proposal.toCountryId,
    status,
    interaction,
  });
  if (SYMMETRIC_DIPLOMATIC_STATUSES.has(status) || status === "INDEPENDENCE_GUARANTEE") {
    await upsertRelationStatus(tx, {
      campaignId: proposal.campaignId,
      fromCountryId: proposal.toCountryId,
      toCountryId: proposal.fromCountryId,
      status: status === "INDEPENDENCE_GUARANTEE" ? "NORMAL" : status,
      interaction,
    });
  }
}

async function createBlocFromProposal(
  tx: DiplomacyTransaction,
  proposal: typeof diplomaticProposals.$inferSelect,
  actorId: string,
) {
  const terms = allianceTermsSchema.parse(proposal.terms);
  const existingMemberships = await tx
    .select({ countryId: diplomaticBlocMembers.countryId })
    .from(diplomaticBlocMembers)
    .where(
      inArray(diplomaticBlocMembers.countryId, [proposal.fromCountryId, proposal.toCountryId]),
    );
  if (existingMemberships.length)
    throw new Error("이미 다른 세력에 가입한 국가는 새 세력을 창설할 수 없습니다.");
  const [bloc] = await tx
    .insert(diplomaticBlocs)
    .values({
      campaignId: proposal.campaignId,
      name: terms.blocName,
      acronym: terms.blocAcronym.toUpperCase(),
      color: terms.blocColor.toUpperCase(),
      description: terms.blocDescription,
      foundedTurnId: proposal.turnId,
      createdBy: actorId,
    })
    .returning({ id: diplomaticBlocs.id });
  await tx.insert(diplomaticBlocMembers).values([
    {
      blocId: bloc.id,
      countryId: proposal.fromCountryId,
      role: "LEADER",
      joinedTurnId: proposal.turnId,
      addedBy: actorId,
    },
    {
      blocId: bloc.id,
      countryId: proposal.toCountryId,
      role: "MEMBER",
      joinedTurnId: proposal.turnId,
      addedBy: actorId,
    },
  ]);
}

async function applyAcceptedProposalIntent(
  tx: DiplomacyTransaction,
  proposal: typeof diplomaticProposals.$inferSelect,
  actorId: string,
) {
  const intent = proposal.intent as DiplomaticProposalIntent;
  if (intent === "ALLIANCE_FOUNDATION") {
    await createBlocFromProposal(tx, proposal, actorId);
    return;
  }
  const statusByIntent: Partial<Record<DiplomaticProposalIntent, DiplomaticRelationStatus>> = {
    MUTUAL_DEFENSE: "MUTUAL_DEFENSE",
    INDEPENDENCE_GUARANTEE: "INDEPENDENCE_GUARANTEE",
    TRUCE: "TRUCE",
  };
  const status = statusByIntent[intent];
  if (status) await setAcceptedRelationStatus(tx, proposal, status);
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
  if (input.intent !== "GENERAL" && input.type !== "TREATY") {
    throw new Error("외교 상태 변경 제안은 조약 형식으로 보내야 합니다.");
  }
  const relation = await db.query.countryRelations.findFirst({
    where: and(
      eq(countryRelations.campaignId, context.campaign.id),
      eq(countryRelations.fromCountryId, context.country.id),
      eq(countryRelations.toCountryId, target.id),
    ),
  });
  const ownEntityType = countryEntityTypeSchema.parse(context.country.entityType);
  const targetEntityType = countryEntityTypeSchema.parse(target.entityType);
  if (ownEntityType === "GUERRILLA_GROUP" || targetEntityType === "GUERRILLA_GROUP") {
    throw new Error("게릴라 단체는 일반 외교 제안을 주고받을 수 없습니다.");
  }
  if (
    (relation?.status ?? defaultDiplomaticStatus(ownEntityType, targetEntityType)) ===
    "NO_RELATIONS"
  ) {
    throw new Error("미수교 상태에서는 외교 제안을 보낼 수 없습니다.");
  }
  const minimumScore: Partial<Record<DiplomaticProposalIntent, number>> = {
    ALLIANCE_FOUNDATION: 40,
    MUTUAL_DEFENSE: 50,
    INDEPENDENCE_GUARANTEE: 40,
  };
  const requiredScore = minimumScore[input.intent];
  if (requiredScore !== undefined && (relation?.score ?? 0) < requiredScore) {
    throw new Error(`관계도 ${requiredScore} 이상에서만 제안할 수 있습니다.`);
  }
  if (input.intent === "TRUCE" && !["WAR", "CIVIL_WAR"].includes(relation?.status ?? "NORMAL")) {
    throw new Error("전쟁 또는 내전 상태에서만 휴전을 제안할 수 있습니다.");
  }
  let terms: Record<string, string> = {};
  if (input.intent === "ALLIANCE_FOUNDATION") {
    const parsedTerms = allianceTermsSchema.parse({
      blocName: input.blocName,
      blocAcronym: input.blocAcronym,
      blocColor: input.blocColor,
      blocDescription: input.blocDescription ?? "",
    });
    const memberships = await db
      .select({ countryId: diplomaticBlocMembers.countryId })
      .from(diplomaticBlocMembers)
      .where(inArray(diplomaticBlocMembers.countryId, [context.country.id, target.id]));
    if (memberships.length) throw new Error("이미 세력에 가입한 국가가 포함되어 있습니다.");
    terms = parsedTerms;
  }
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
        intent: input.intent,
        terms,
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
    if (input.response === "ACCEPT") {
      await applyAcceptedProposalIntent(tx, proposal, session.user.id);
    }
  });
  if (input.response === "ACCEPT") {
    await rebuildAutomaticMapBorders(proposal.campaignId, session.user.id);
  }
  revalidatePath("/diplomacy");
  revalidatePath("/admin/diplomacy");
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
  const aiResponse = z
    .enum(["ACCEPT", "REJECT", "COUNTER", "DELAY"])
    .safeParse(message.responseType);
  const approvedProposalStatus = aiResponse.success
    ? responseStatuses[aiResponse.data]
    : "COUNTERED";
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
      .set({
        status: decision === "APPROVED" ? approvedProposalStatus : "REJECTED",
        updatedAt: new Date(),
      })
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
      if (aiResponse.success && aiResponse.data === "ACCEPT") {
        await applyAcceptedProposalIntent(tx, proposal, session.user.id);
      }
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
  if (decision === "APPROVED" && aiResponse.success && aiResponse.data === "ACCEPT") {
    await rebuildAutomaticMapBorders(proposal.campaignId, session.user.id);
  }
  revalidatePath("/admin/diplomacy");
  revalidatePath("/diplomacy");
}

const adminStatusSchema = z.object({
  fromCountryId: z.string().uuid(),
  toCountryId: z.string().uuid(),
  status: diplomaticRelationStatusSchema,
  reason: z.string().trim().min(3).max(300),
});

export async function setDiplomaticStatusAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const context = await getViewerContext(session.user.id);
  if (!context.campaign) throw new Error("활성 캠페인이 없습니다.");
  const input = adminStatusSchema.parse(Object.fromEntries(formData.entries()));
  if (input.fromCountryId === input.toCountryId)
    throw new Error("같은 국가끼리는 외교 상태를 지정할 수 없습니다.");
  const countryRows = await db.query.countries.findMany({
    where: and(
      eq(countries.campaignId, context.campaign.id),
      inArray(countries.id, [input.fromCountryId, input.toCountryId]),
    ),
    columns: { id: true, entityType: true },
  });
  if (countryRows.length !== 2) throw new Error("캠페인 내 국가를 선택해야 합니다.");
  const guerrillaCount = countryRows.filter(
    (country) => country.entityType === "GUERRILLA_GROUP",
  ).length;
  if (input.status === "GUERRILLA" && guerrillaCount !== 1) {
    throw new Error("게릴라전은 한 개의 게릴라 단체와 다른 한 대상 사이에만 설정할 수 있습니다.");
  }
  if (guerrillaCount > 0 && !["GUERRILLA", "NO_RELATIONS"].includes(input.status)) {
    throw new Error("게릴라 단체에는 일반 외교 관계를 설정할 수 없습니다.");
  }
  await db.transaction(async (tx) => {
    await upsertRelationStatus(tx, {
      campaignId: context.campaign!.id,
      fromCountryId: input.fromCountryId,
      toCountryId: input.toCountryId,
      status: input.status,
      interaction: input.reason,
    });
    if (
      SYMMETRIC_DIPLOMATIC_STATUSES.has(input.status) ||
      input.status === "INDEPENDENCE_GUARANTEE"
    ) {
      await upsertRelationStatus(tx, {
        campaignId: context.campaign!.id,
        fromCountryId: input.toCountryId,
        toCountryId: input.fromCountryId,
        status: input.status === "INDEPENDENCE_GUARANTEE" ? "NORMAL" : input.status,
        interaction: input.reason,
      });
    }
    await tx.insert(auditLogs).values({
      campaignId: context.campaign!.id,
      actorId: session.user.id,
      action: "SET_DIPLOMATIC_STATUS",
      targetType: "COUNTRY_RELATION",
      targetId: `${input.fromCountryId}:${input.toCountryId}`,
      afterSummary: { status: input.status },
      reason: input.reason,
    });
  });
  await rebuildAutomaticMapBorders(context.campaign.id, session.user.id);
  revalidatePath("/admin/diplomacy");
  revalidatePath("/diplomacy");
}

const createBlocSchema = z.object({
  name: z.string().trim().min(2).max(80),
  acronym: z.string().trim().min(2).max(12),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  description: z.string().trim().max(500),
  leaderCountryId: z.string().uuid(),
});

export async function createDiplomaticBlocAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const context = await getViewerContext(session.user.id);
  if (!context.campaign) throw new Error("활성 캠페인이 없습니다.");
  const input = createBlocSchema.parse(Object.fromEntries(formData.entries()));
  const memberCountryIds = z
    .array(z.string().uuid())
    .parse(formData.getAll("memberCountryIds").map(String));
  const countryIds = [...new Set([input.leaderCountryId, ...memberCountryIds])];
  const countryRows = await db.query.countries.findMany({
    where: and(eq(countries.campaignId, context.campaign.id), inArray(countries.id, countryIds)),
    columns: { id: true, entityType: true },
  });
  if (countryRows.length !== countryIds.length)
    throw new Error("캠페인 내 국가만 세력에 포함할 수 있습니다.");
  if (countryRows.some((country) => country.entityType === "GUERRILLA_GROUP")) {
    throw new Error("게릴라 단체는 세력권에 가입할 수 없습니다.");
  }
  const occupied = await db
    .select({ countryId: diplomaticBlocMembers.countryId })
    .from(diplomaticBlocMembers)
    .where(inArray(diplomaticBlocMembers.countryId, countryIds));
  if (occupied.length) throw new Error("이미 다른 세력에 가입한 국가가 포함되어 있습니다.");
  await db.transaction(async (tx) => {
    const [bloc] = await tx
      .insert(diplomaticBlocs)
      .values({
        campaignId: context.campaign!.id,
        name: input.name,
        acronym: input.acronym.toUpperCase(),
        color: input.color.toUpperCase(),
        description: input.description,
        foundedTurnId: context.turn?.id ?? null,
        createdBy: session.user.id,
      })
      .returning({ id: diplomaticBlocs.id });
    await tx.insert(diplomaticBlocMembers).values(
      countryIds.map((countryId) => ({
        blocId: bloc.id,
        countryId,
        role: countryId === input.leaderCountryId ? "LEADER" : "MEMBER",
        joinedTurnId: context.turn?.id ?? null,
        addedBy: session.user.id,
      })),
    );
    await tx.insert(auditLogs).values({
      campaignId: context.campaign!.id,
      actorId: session.user.id,
      action: "CREATE_DIPLOMATIC_BLOC",
      targetType: "DIPLOMATIC_BLOC",
      targetId: bloc.id,
      afterSummary: { name: input.name, countryIds },
      reason: "관리자 세력권 창설",
    });
  });
  revalidatePath("/admin/diplomacy");
  revalidatePath("/diplomacy");
}

export async function addDiplomaticBlocMemberAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const context = await getViewerContext(session.user.id);
  if (!context.campaign) throw new Error("활성 캠페인이 없습니다.");
  const input = z
    .object({ blocId: z.string().uuid(), countryId: z.string().uuid() })
    .parse(Object.fromEntries(formData.entries()));
  const [bloc, country] = await Promise.all([
    db.query.diplomaticBlocs.findFirst({
      where: and(
        eq(diplomaticBlocs.id, input.blocId),
        eq(diplomaticBlocs.campaignId, context.campaign.id),
        eq(diplomaticBlocs.status, "ACTIVE"),
      ),
    }),
    db.query.countries.findFirst({
      where: and(eq(countries.id, input.countryId), eq(countries.campaignId, context.campaign.id)),
    }),
  ]);
  if (!bloc || !country) throw new Error("세력 또는 국가를 찾을 수 없습니다.");
  if (country.entityType === "GUERRILLA_GROUP") {
    throw new Error("게릴라 단체는 세력권에 가입할 수 없습니다.");
  }
  await db.insert(diplomaticBlocMembers).values({
    blocId: bloc.id,
    countryId: country.id,
    joinedTurnId: context.turn?.id ?? null,
    addedBy: session.user.id,
  });
  revalidatePath("/admin/diplomacy");
  revalidatePath("/diplomacy");
}

export async function removeDiplomaticBlocMemberAction(formData: FormData) {
  await requireRole("ADMIN");
  const memberId = z.string().uuid().parse(formData.get("memberId"));
  const member = await db.query.diplomaticBlocMembers.findFirst({
    where: eq(diplomaticBlocMembers.id, memberId),
  });
  if (!member) throw new Error("세력 회원국을 찾을 수 없습니다.");
  if (member.role === "LEADER") throw new Error("세력 주도국은 제거할 수 없습니다.");
  await db.delete(diplomaticBlocMembers).where(eq(diplomaticBlocMembers.id, member.id));
  revalidatePath("/admin/diplomacy");
  revalidatePath("/diplomacy");
}

export async function createEconomicBlocAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const context = await getViewerContext(session.user.id);
  if (!context.campaign) throw new Error("활성 캠페인이 없습니다.");
  const input = createBlocSchema.parse(Object.fromEntries(formData.entries()));
  const memberCountryIds = z
    .array(z.string().uuid())
    .parse(formData.getAll("memberCountryIds").map(String));
  const countryIds = [...new Set([input.leaderCountryId, ...memberCountryIds])];
  const countryRows = await db.query.countries.findMany({
    where: and(eq(countries.campaignId, context.campaign.id), inArray(countries.id, countryIds)),
    columns: { id: true, entityType: true },
  });
  if (countryRows.length !== countryIds.length) {
    throw new Error("캠페인 내 국가만 경제권에 포함할 수 있습니다.");
  }
  if (countryRows.some((country) => country.entityType === "GUERRILLA_GROUP")) {
    throw new Error("게릴라 단체는 경제권에 가입할 수 없습니다.");
  }
  const occupied = await db
    .select({ countryId: economicBlocMembers.countryId })
    .from(economicBlocMembers)
    .where(inArray(economicBlocMembers.countryId, countryIds));
  if (occupied.length) throw new Error("이미 다른 경제권에 가입한 국가가 포함되어 있습니다.");

  await db.transaction(async (tx) => {
    const [bloc] = await tx
      .insert(economicBlocs)
      .values({
        campaignId: context.campaign!.id,
        name: input.name,
        acronym: input.acronym.toUpperCase(),
        color: input.color.toUpperCase(),
        description: input.description,
        foundedTurnId: context.turn?.id ?? null,
        createdBy: session.user.id,
      })
      .returning({ id: economicBlocs.id });
    await tx.insert(economicBlocMembers).values(
      countryIds.map((countryId) => ({
        blocId: bloc.id,
        countryId,
        role: countryId === input.leaderCountryId ? "LEADER" : "MEMBER",
        joinedTurnId: context.turn?.id ?? null,
        addedBy: session.user.id,
      })),
    );
    await tx.insert(auditLogs).values({
      campaignId: context.campaign!.id,
      actorId: session.user.id,
      action: "CREATE_ECONOMIC_BLOC",
      targetType: "ECONOMIC_BLOC",
      targetId: bloc.id,
      afterSummary: { name: input.name, countryIds },
      reason: "관리자 경제권 창설",
    });
  });
  revalidatePath("/admin/diplomacy");
  revalidatePath("/diplomacy");
}

export async function addEconomicBlocMemberAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const context = await getViewerContext(session.user.id);
  if (!context.campaign) throw new Error("활성 캠페인이 없습니다.");
  const input = z
    .object({ blocId: z.string().uuid(), countryId: z.string().uuid() })
    .parse(Object.fromEntries(formData.entries()));
  const [bloc, country] = await Promise.all([
    db.query.economicBlocs.findFirst({
      where: and(
        eq(economicBlocs.id, input.blocId),
        eq(economicBlocs.campaignId, context.campaign.id),
        eq(economicBlocs.status, "ACTIVE"),
      ),
    }),
    db.query.countries.findFirst({
      where: and(eq(countries.id, input.countryId), eq(countries.campaignId, context.campaign.id)),
    }),
  ]);
  if (!bloc || !country) throw new Error("경제권 또는 국가를 찾을 수 없습니다.");
  if (country.entityType === "GUERRILLA_GROUP") {
    throw new Error("게릴라 단체는 경제권에 가입할 수 없습니다.");
  }
  await db.insert(economicBlocMembers).values({
    blocId: bloc.id,
    countryId: country.id,
    joinedTurnId: context.turn?.id ?? null,
    addedBy: session.user.id,
  });
  revalidatePath("/admin/diplomacy");
  revalidatePath("/diplomacy");
}

export async function removeEconomicBlocMemberAction(formData: FormData) {
  await requireRole("ADMIN");
  const memberId = z.string().uuid().parse(formData.get("memberId"));
  const member = await db.query.economicBlocMembers.findFirst({
    where: eq(economicBlocMembers.id, memberId),
  });
  if (!member) throw new Error("경제권 회원국을 찾을 수 없습니다.");
  if (member.role === "LEADER") throw new Error("경제권 주도국은 제거할 수 없습니다.");
  await db.delete(economicBlocMembers).where(eq(economicBlocMembers.id, member.id));
  revalidatePath("/admin/diplomacy");
  revalidatePath("/diplomacy");
}
