import { and, desc, eq, inArray, lt, or } from "drizzle-orm";
import type { Role } from "@/src/auth/permissions";
import { db } from "@/src/db";
import { chatChannels, chatMessages, moderationActions, users } from "@/src/db/schema";
import { canReadChatChannel, remainingTimeoutMs } from "@/src/domain/chat/policy";

export async function getAccessibleChatChannels(input: {
  campaignId: string;
  role: Role;
  countryId: string | null;
}) {
  const rows = await db.query.chatChannels.findMany({
    where: eq(chatChannels.campaignId, input.campaignId),
    orderBy: [chatChannels.type, chatChannels.name],
  });
  return rows.filter((channel) =>
    canReadChatChannel({
      role: input.role,
      assignedCountryId: input.countryId,
      channelType: channel.type,
      channelCountryId: channel.countryId,
    }),
  );
}

export async function getChatPage(channelId: string, beforeId?: string, pageSize = 40) {
  const before = beforeId
    ? await db.query.chatMessages.findFirst({ where: eq(chatMessages.id, beforeId) })
    : null;
  const rows = await db.query.chatMessages.findMany({
    where: and(
      eq(chatMessages.channelId, channelId),
      before ? lt(chatMessages.createdAt, before.createdAt) : undefined,
    ),
    orderBy: [desc(chatMessages.createdAt)],
    limit: pageSize + 1,
  });
  const hasMore = rows.length > pageSize;
  const pageRows = rows.slice(0, pageSize).reverse();
  const parentIds = pageRows.flatMap((message) => (message.replyToId ? [message.replyToId] : []));
  const parents = parentIds.length
    ? await db.query.chatMessages.findMany({ where: inArray(chatMessages.id, parentIds) })
    : [];
  const allMessages = [...pageRows, ...parents];
  const senderIds = [...new Set(allMessages.map((message) => message.senderId))];
  const senderRows = senderIds.length
    ? await db.query.users.findMany({ where: inArray(users.id, senderIds) })
    : [];
  const senderById = new Map(senderRows.map((user) => [user.id, user]));
  const parentById = new Map(parents.map((message) => [message.id, message]));
  return {
    messages: pageRows.map((message) => {
      const parent = message.replyToId ? parentById.get(message.replyToId) : null;
      return {
        message,
        sender: senderById.get(message.senderId) ?? null,
        parent: parent
          ? { message: parent, sender: senderById.get(parent.senderId) ?? null }
          : null,
      };
    }),
    hasMore,
    nextCursor: hasMore ? pageRows[0]?.id : undefined,
  };
}

export async function getActiveChatTimeout(userId: string, now = new Date()) {
  const latest = await db.query.moderationActions.findFirst({
    where: and(
      eq(moderationActions.targetUserId, userId),
      or(eq(moderationActions.type, "TIMEOUT_USER"), eq(moderationActions.type, "CLEAR_TIMEOUT")),
    ),
    orderBy: [desc(moderationActions.createdAt)],
  });
  const remainingMs = latest
    ? remainingTimeoutMs(
        { type: latest.type as "TIMEOUT_USER" | "CLEAR_TIMEOUT", expiresAt: latest.expiresAt },
        now,
      )
    : 0;
  return { action: latest ?? null, remainingMs };
}

export async function getModerationDesk(campaignId: string) {
  const [messageRows, actionRows, userRows] = await Promise.all([
    db
      .select({ message: chatMessages, sender: users, channel: chatChannels })
      .from(chatMessages)
      .innerJoin(users, eq(chatMessages.senderId, users.id))
      .innerJoin(chatChannels, eq(chatMessages.channelId, chatChannels.id))
      .where(eq(chatChannels.campaignId, campaignId))
      .orderBy(desc(chatMessages.createdAt))
      .limit(100),
    db.query.moderationActions.findMany({
      where: eq(moderationActions.campaignId, campaignId),
      orderBy: [desc(moderationActions.createdAt)],
      limit: 100,
    }),
    db.query.users.findMany({ orderBy: [users.name] }),
  ]);
  const latestTimeoutByUser = new Map<string, (typeof actionRows)[number]>();
  for (const action of actionRows) {
    if (
      action.targetUserId &&
      (action.type === "TIMEOUT_USER" || action.type === "CLEAR_TIMEOUT") &&
      !latestTimeoutByUser.has(action.targetUserId)
    ) {
      latestTimeoutByUser.set(action.targetUserId, action);
    }
  }
  const activeTimeoutUserIds = new Set(
    [...latestTimeoutByUser.entries()]
      .filter(([, action]) =>
        action.type === "TIMEOUT_USER" && action.expiresAt
          ? action.expiresAt.getTime() > Date.now()
          : false,
      )
      .map(([userId]) => userId),
  );
  return { messages: messageRows, actions: actionRows, users: userRows, activeTimeoutUserIds };
}
