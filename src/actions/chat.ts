"use server";

import { and, eq, gte, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Role } from "@/src/auth/permissions";
import { requireRole, requireSession } from "@/src/auth/session";
import { db, sqlClient } from "@/src/db";
import { auditLogs, chatChannels, chatMessages, moderationActions, users } from "@/src/db/schema";
import { getActiveChatTimeout } from "@/src/db/queries/chat";
import { getViewerContext } from "@/src/db/queries/viewer";
import { canPostChatChannel } from "@/src/domain/chat/policy";

export type ChatFormState = { error?: string; success?: string };

const messageSchema = z.object({
  channelId: z.string().uuid(),
  body: z
    .string()
    .trim()
    .min(1, "메시지를 입력해 주세요.")
    .max(1200, "메시지는 1,200자 이하로 작성해 주세요."),
  replyToId: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().uuid().optional(),
  ),
});

async function notifyChat(campaignId: string, channelId: string, messageId: string) {
  await sqlClient.notify("chat_events", JSON.stringify({ campaignId, channelId, messageId }));
}

export async function sendChatMessageAction(
  _state: ChatFormState,
  formData: FormData,
): Promise<ChatFormState> {
  const parsed = messageSchema.safeParse({
    channelId: formData.get("channelId"),
    body: formData.get("body"),
    replyToId: formData.get("replyToId"),
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };

  const session = await requireSession();
  const context = await getViewerContext(session.user.id);
  if (!context.campaign) return { error: "활성 캠페인이 없습니다." };
  const channel = await db.query.chatChannels.findFirst({
    where: and(
      eq(chatChannels.id, parsed.data.channelId),
      eq(chatChannels.campaignId, context.campaign.id),
    ),
  });
  if (!channel) return { error: "채널을 찾을 수 없습니다." };
  if (
    !canPostChatChannel({
      role: session.user.role as Role,
      assignedCountryId: context.country?.id ?? null,
      channelType: channel.type,
      channelCountryId: channel.countryId,
    })
  ) {
    return { error: "이 채널에 메시지를 보낼 권한이 없습니다." };
  }

  const timeout = await getActiveChatTimeout(session.user.id);
  if (timeout.remainingMs > 0) {
    const minutes = Math.max(1, Math.ceil(timeout.remainingMs / 60_000));
    return { error: `채팅 타임아웃 중입니다. 약 ${minutes}분 후 다시 시도해 주세요.` };
  }

  const recent = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.senderId, session.user.id),
        gte(chatMessages.createdAt, new Date(Date.now() - 10_000)),
      ),
    );
  if ((recent[0]?.count ?? 0) >= 5) {
    return { error: "메시지를 너무 빠르게 보내고 있습니다. 잠시 후 다시 시도해 주세요." };
  }

  let replyToId = parsed.data.replyToId;
  if (replyToId) {
    const parent = await db.query.chatMessages.findFirst({ where: eq(chatMessages.id, replyToId) });
    if (!parent || parent.channelId !== channel.id)
      return { error: "답글 대상을 찾을 수 없습니다." };
    replyToId = parent.replyToId ?? parent.id;
  }

  const [message] = await db
    .insert(chatMessages)
    .values({
      channelId: channel.id,
      senderId: session.user.id,
      replyToId,
      body: parsed.data.body,
    })
    .returning({ id: chatMessages.id });
  await notifyChat(context.campaign.id, channel.id, message.id);
  revalidatePath("/chat");
  revalidatePath("/admin/chat");
  return { success: "메시지를 보냈습니다." };
}

const moderationSchema = z.object({
  targetUserId: z.string().min(1),
  reason: z.string().trim().min(3).max(300),
});

async function assertModerationTarget(actorRole: string, actorId: string, targetUserId: string) {
  if (actorId === targetUserId) throw new Error("자기 자신에게 제재를 적용할 수 없습니다.");
  const target = await db.query.users.findFirst({ where: eq(users.id, targetUserId) });
  if (!target) throw new Error("대상 사용자를 찾을 수 없습니다.");
  if (target.role === "ADMIN" && actorRole !== "ADMIN") {
    throw new Error("관리자 계정은 관리자만 제재할 수 있습니다.");
  }
  return target;
}

export async function deleteChatMessageAction(formData: FormData) {
  const session = await requireRole("MODERATOR");
  const input = z
    .object({ messageId: z.string().uuid(), reason: z.string().trim().min(3).max(300) })
    .parse({ messageId: formData.get("messageId"), reason: formData.get("reason") });
  const message = await db.query.chatMessages.findFirst({
    where: eq(chatMessages.id, input.messageId),
  });
  if (!message || message.deletedAt) throw new Error("삭제 가능한 메시지를 찾을 수 없습니다.");
  const channel = await db.query.chatChannels.findFirst({
    where: eq(chatChannels.id, message.channelId),
  });
  if (!channel) throw new Error("채널을 찾을 수 없습니다.");

  await db.transaction(async (tx) => {
    await tx
      .update(chatMessages)
      .set({ deletedAt: new Date(), deletedBy: session.user.id, updatedAt: new Date() })
      .where(eq(chatMessages.id, message.id));
    await tx.insert(moderationActions).values({
      campaignId: channel.campaignId,
      type: "DELETE_MESSAGE",
      messageId: message.id,
      targetUserId: message.senderId,
      reason: input.reason,
      actorId: session.user.id,
    });
    await tx.insert(auditLogs).values({
      campaignId: channel.campaignId,
      actorId: session.user.id,
      action: "DELETE_CHAT_MESSAGE",
      targetType: "CHAT_MESSAGE",
      targetId: message.id,
      beforeSummary: { body: message.body, senderId: message.senderId },
      afterSummary: { deleted: true },
      reason: input.reason,
    });
  });
  await notifyChat(channel.campaignId, channel.id, message.id);
  revalidatePath("/admin/moderation");
  revalidatePath("/chat");
  revalidatePath("/admin/chat");
}

export async function timeoutUserAction(formData: FormData) {
  const session = await requireRole("MODERATOR");
  const input = moderationSchema
    .extend({ minutes: z.coerce.number().int().min(1).max(10_080) })
    .parse({
      targetUserId: formData.get("targetUserId"),
      reason: formData.get("reason"),
      minutes: formData.get("minutes"),
    });
  const target = await assertModerationTarget(
    session.user.role ?? "USER",
    session.user.id,
    input.targetUserId,
  );
  const context = await getViewerContext(session.user.id);
  if (!context.campaign) throw new Error("활성 캠페인이 없습니다.");
  const expiresAt = new Date(Date.now() + input.minutes * 60_000);
  await db.transaction(async (tx) => {
    await tx.insert(moderationActions).values({
      campaignId: context.campaign!.id,
      type: "TIMEOUT_USER",
      targetUserId: target.id,
      reason: input.reason,
      expiresAt,
      actorId: session.user.id,
    });
    await tx.insert(auditLogs).values({
      campaignId: context.campaign!.id,
      actorId: session.user.id,
      action: "TIMEOUT_USER",
      targetType: "USER",
      targetId: target.id,
      afterSummary: { expiresAt: expiresAt.toISOString() },
      reason: input.reason,
    });
  });
  revalidatePath("/admin/moderation");
}

export async function clearUserTimeoutAction(formData: FormData) {
  const session = await requireRole("MODERATOR");
  const input = moderationSchema.parse({
    targetUserId: formData.get("targetUserId"),
    reason: formData.get("reason"),
  });
  const target = await assertModerationTarget(
    session.user.role ?? "USER",
    session.user.id,
    input.targetUserId,
  );
  const context = await getViewerContext(session.user.id);
  if (!context.campaign) throw new Error("활성 캠페인이 없습니다.");
  await db.transaction(async (tx) => {
    await tx.insert(moderationActions).values({
      campaignId: context.campaign!.id,
      type: "CLEAR_TIMEOUT",
      targetUserId: target.id,
      reason: input.reason,
      actorId: session.user.id,
    });
    await tx.insert(auditLogs).values({
      campaignId: context.campaign!.id,
      actorId: session.user.id,
      action: "CLEAR_CHAT_TIMEOUT",
      targetType: "USER",
      targetId: target.id,
      afterSummary: { timeout: null },
      reason: input.reason,
    });
  });
  revalidatePath("/admin/moderation");
}

export async function setUserStatusAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const input = moderationSchema.extend({ status: z.enum(["ACTIVE", "SUSPENDED"]) }).parse({
    targetUserId: formData.get("targetUserId"),
    reason: formData.get("reason"),
    status: formData.get("status"),
  });
  const target = await assertModerationTarget(
    session.user.role ?? "USER",
    session.user.id,
    input.targetUserId,
  );
  const context = await getViewerContext(session.user.id);
  if (!context.campaign) throw new Error("활성 캠페인이 없습니다.");
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ status: input.status, updatedAt: new Date() })
      .where(eq(users.id, target.id));
    await tx.insert(moderationActions).values({
      campaignId: context.campaign!.id,
      type: input.status === "SUSPENDED" ? "SUSPEND_USER" : "ACTIVATE_USER",
      targetUserId: target.id,
      reason: input.reason,
      actorId: session.user.id,
    });
    await tx.insert(auditLogs).values({
      campaignId: context.campaign!.id,
      actorId: session.user.id,
      action: input.status === "SUSPENDED" ? "SUSPEND_USER" : "ACTIVATE_USER",
      targetType: "USER",
      targetId: target.id,
      beforeSummary: { status: target.status },
      afterSummary: { status: input.status },
      reason: input.reason,
    });
  });
  revalidatePath("/admin/moderation");
  revalidatePath("/admin/users");
}
