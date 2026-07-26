import { and, eq } from "drizzle-orm";
import { db, sqlClient } from "../src/db";
import {
  chatChannelMembers,
  chatChannels,
  chatMessages,
  countries,
  countryAssignments,
  users,
} from "../src/db/schema";
import { getActiveCampaign } from "../src/db/queries/viewer";

async function ensureChannel(input: {
  campaignId: string;
  type: "CAMPAIGN" | "COUNTRY" | "ANNOUNCEMENT";
  name: string;
  countryId?: string;
}) {
  const existing = await db.query.chatChannels.findFirst({
    where: and(
      eq(chatChannels.campaignId, input.campaignId),
      eq(chatChannels.type, input.type),
      input.countryId ? eq(chatChannels.countryId, input.countryId) : undefined,
    ),
  });
  if (existing) return existing;
  const [created] = await db
    .insert(chatChannels)
    .values({
      campaignId: input.campaignId,
      type: input.type,
      name: input.name,
      countryId: input.countryId,
    })
    .returning();
  return created;
}

async function seedPhase6() {
  const campaign = await getActiveCampaign();
  if (!campaign) throw new Error("활성 캠페인을 먼저 생성해 주세요.");
  const [admin, moderator, playerOne] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.email, "admin@virtual.local") }),
    db.query.users.findFirst({ where: eq(users.email, "moderator@virtual.local") }),
    db.query.users.findFirst({ where: eq(users.email, "player1@virtual.local") }),
  ]);
  if (!admin || !moderator || !playerOne) throw new Error("기본 사용자 시드가 필요합니다.");

  const [campaignChannel, announcementChannel] = await Promise.all([
    ensureChannel({ campaignId: campaign.id, type: "CAMPAIGN", name: "세계 광장" }),
    ensureChannel({ campaignId: campaign.id, type: "ANNOUNCEMENT", name: "운영 공지" }),
  ]);
  const countryRows = await db.query.countries.findMany({
    where: eq(countries.campaignId, campaign.id),
  });
  const countryChannels = new Map<string, Awaited<ReturnType<typeof ensureChannel>>>();
  for (const country of countryRows) {
    const channel = await ensureChannel({
      campaignId: campaign.id,
      type: "COUNTRY",
      name: `${country.name} 내부 채널`,
      countryId: country.id,
    });
    countryChannels.set(country.id, channel);
  }
  const assignments = await db.query.countryAssignments.findMany({
    where: and(
      eq(countryAssignments.campaignId, campaign.id),
      eq(countryAssignments.isActive, true),
    ),
  });
  for (const assignment of assignments) {
    const channel = countryChannels.get(assignment.countryId);
    if (channel) {
      await db
        .insert(chatChannelMembers)
        .values({ channelId: channel.id, userId: assignment.userId })
        .onConflictDoNothing();
    }
  }

  const existingMessage = await db.query.chatMessages.findFirst({
    where: eq(chatMessages.channelId, campaignChannel.id),
  });
  if (!existingMessage) {
    await db.insert(chatMessages).values([
      {
        channelId: announcementChannel.id,
        senderId: admin.id,
        body: "이번 턴 마감은 예정된 날짜에 진행됩니다.",
      },
      {
        channelId: campaignChannel.id,
        senderId: moderator.id,
        body: "세계 광장 채널이 열렸습니다. 서로의 운영 범위를 존중해 주세요.",
      },
      {
        channelId: campaignChannel.id,
        senderId: playerOne.id,
        body: "아스테라 대표단입니다. 공동 연구와 교역 제안을 환영합니다.",
      },
    ]);
    const playerAssignment = assignments.find((assignment) => assignment.userId === playerOne.id);
    const playerChannel = playerAssignment
      ? countryChannels.get(playerAssignment.countryId)
      : undefined;
    if (playerChannel) {
      await db.insert(chatMessages).values({
        channelId: playerChannel.id,
        senderId: playerOne.id,
        body: "이번 턴의 경제 연재와 외교 제안을 함께 점검합시다.",
      });
    }
  }
  console.log("Phase 6 chat channels and sample messages are ready.");
}

seedPhase6().finally(() => sqlClient.end());
