"use server";

import { desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/src/auth/session";
import { db } from "@/src/db";
import { auditLogs, campaignLoreViews, campaignMaps, campaigns, turns } from "@/src/db/schema";
import { getViewerContext } from "@/src/db/queries/viewer";
import {
  adjudicationRealDayInterval,
  GAME_TIME_UNITS,
  gameDurationInDays,
  type GameTimeUnit,
  nextTurnDeadline,
} from "@/src/domain/turn/schedule";

const campaignSettingsSchema = z.object({
  name: z.string().trim().min(2).max(80),
  gameTimePerRealDayValue: z.coerce.number().int().min(1).max(365_000),
  gameTimePerRealDayUnit: z.enum(GAME_TIME_UNITS),
  adjudicationIntervalValue: z.coerce.number().int().min(1).max(365_000),
  adjudicationIntervalUnit: z.enum(GAME_TIME_UNITS),
  closeTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  mapCount: z.coerce.number().int().min(1).max(16),
});

export async function updateCampaignSettingsAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const context = await getViewerContext(session.user.id);
  if (!context.campaign) throw new Error("활성 캠페인이 없습니다.");
  const input = campaignSettingsSchema.parse({
    name: formData.get("name"),
    gameTimePerRealDayValue: formData.get("gameTimePerRealDayValue"),
    gameTimePerRealDayUnit: formData.get("gameTimePerRealDayUnit"),
    adjudicationIntervalValue: formData.get("adjudicationIntervalValue"),
    adjudicationIntervalUnit: formData.get("adjudicationIntervalUnit"),
    closeTime: formData.get("closeTime"),
    mapCount: formData.get("mapCount"),
  });
  const [turnCloseHour, turnCloseMinute] = input.closeTime.split(":").map(Number);
  const realDayInterval = adjudicationRealDayInterval(
    input.gameTimePerRealDayValue,
    input.adjudicationIntervalValue,
    input.gameTimePerRealDayUnit,
    input.adjudicationIntervalUnit,
  );

  await db.transaction(async (tx) => {
    const lockedRows = await tx.execute<{
      id: string;
      name: string;
      gameDaysPerRealDay: number;
      adjudicationIntervalGameDays: number;
      gameTimePerRealDayValue: number;
      gameTimePerRealDayUnit: GameTimeUnit;
      adjudicationIntervalValue: number;
      adjudicationIntervalUnit: GameTimeUnit;
      turnCloseHour: number;
      turnCloseMinute: number;
      mapCount: number;
      mapRevision: number;
      administrativeDivisionRevision: number;
    }>(sql`
      SELECT
        id,
        name,
        game_days_per_real_day AS "gameDaysPerRealDay",
        adjudication_interval_game_days AS "adjudicationIntervalGameDays",
        game_time_per_real_day_value AS "gameTimePerRealDayValue",
        game_time_per_real_day_unit AS "gameTimePerRealDayUnit",
        adjudication_interval_value AS "adjudicationIntervalValue",
        adjudication_interval_unit AS "adjudicationIntervalUnit",
        turn_close_hour AS "turnCloseHour",
        turn_close_minute AS "turnCloseMinute",
        map_count AS "mapCount",
        map_revision AS "mapRevision",
        administrative_division_revision AS "administrativeDivisionRevision"
      FROM campaigns
      WHERE id = ${context.campaign!.id}
      FOR UPDATE
    `);
    const locked = lockedRows.at(0);
    if (!locked) throw new Error("캠페인을 찾을 수 없습니다.");
    await tx
      .update(campaigns)
      .set({
        name: input.name,
        gameDaysPerRealDay: Math.max(
          1,
          Math.round(
            gameDurationInDays(input.gameTimePerRealDayValue, input.gameTimePerRealDayUnit),
          ),
        ),
        adjudicationIntervalGameDays: Math.max(
          1,
          Math.round(
            gameDurationInDays(input.adjudicationIntervalValue, input.adjudicationIntervalUnit),
          ),
        ),
        gameTimePerRealDayValue: input.gameTimePerRealDayValue,
        gameTimePerRealDayUnit: input.gameTimePerRealDayUnit,
        adjudicationIntervalValue: input.adjudicationIntervalValue,
        adjudicationIntervalUnit: input.adjudicationIntervalUnit,
        turnCloseHour,
        turnCloseMinute,
        mapCount: input.mapCount,
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, locked.id));

    const existingMaps = await tx.query.campaignMaps.findMany({
      where: eq(campaignMaps.campaignId, locked.id),
    });
    const existingPositions = new Set(existingMaps.map((map) => map.position));
    const missingMaps = Array.from({ length: input.mapCount }, (_, index) => index + 1).filter(
      (position) => !existingPositions.has(position),
    );
    if (missingMaps.length) {
      await tx.insert(campaignMaps).values(
        missingMaps.map((position) => ({
          campaignId: locked.id,
          position,
          name: `지도 ${position}`,
          revision: position === 1 ? locked.mapRevision : 0,
          administrativeDivisionRevision:
            position === 1 ? locked.administrativeDivisionRevision : 0,
        })),
      );
    }

    const currentTurn = await tx.query.turns.findFirst({
      where: eq(turns.campaignId, locked.id),
      orderBy: [desc(turns.sequence)],
    });
    if (currentTurn?.status === "DRAFT") {
      await tx
        .update(turns)
        .set({
          deadlineAt: nextTurnDeadline(new Date(), realDayInterval, turnCloseHour, turnCloseMinute),
          updatedAt: new Date(),
        })
        .where(eq(turns.id, currentTurn.id));
    }

    await tx.insert(auditLogs).values({
      campaignId: locked.id,
      actorId: session.user.id,
      action: "UPDATE_CAMPAIGN_SETTINGS",
      targetType: "CAMPAIGN",
      targetId: locked.id,
      beforeSummary: {
        name: locked.name,
        gameDaysPerRealDay: locked.gameDaysPerRealDay,
        adjudicationIntervalGameDays: locked.adjudicationIntervalGameDays,
        gameTimePerRealDayValue: locked.gameTimePerRealDayValue,
        gameTimePerRealDayUnit: locked.gameTimePerRealDayUnit,
        adjudicationIntervalValue: locked.adjudicationIntervalValue,
        adjudicationIntervalUnit: locked.adjudicationIntervalUnit,
        closeTime: `${String(locked.turnCloseHour).padStart(2, "0")}:${String(locked.turnCloseMinute).padStart(2, "0")}`,
        mapCount: locked.mapCount,
      },
      afterSummary: { ...input, realDayInterval },
      reason: "캠페인 진행 설정 변경",
    });
  });
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/map");
  revalidatePath("/dashboard");
}

export async function updateCampaignNameAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const context = await getViewerContext(session.user.id);
  if (!context.campaign) throw new Error("활성 캠페인이 없습니다.");
  const name = z.string().trim().min(2).max(80).parse(formData.get("name"));
  if (name === context.campaign.name) return;

  await db.transaction(async (tx) => {
    await tx
      .update(campaigns)
      .set({ name, updatedAt: new Date() })
      .where(eq(campaigns.id, context.campaign!.id));
    await tx.insert(auditLogs).values({
      campaignId: context.campaign!.id,
      actorId: session.user.id,
      action: "UPDATE_CAMPAIGN_NAME",
      targetType: "CAMPAIGN",
      targetId: context.campaign!.id,
      beforeSummary: { name: context.campaign!.name },
      afterSummary: { name },
      reason: "캠페인 이름 변경",
    });
  });
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/dashboard");
}

export async function updateEconomicMultiplierAutomationAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const context = await getViewerContext(session.user.id);
  if (!context.campaign) throw new Error("활성 캠페인이 없습니다.");
  const enabled = formData.get("enabled") === "yes";

  await db.transaction(async (tx) => {
    await tx
      .update(campaigns)
      .set({ autoApproveEconomicMultipliers: enabled, updatedAt: new Date() })
      .where(eq(campaigns.id, context.campaign!.id));
    await tx.insert(auditLogs).values({
      campaignId: context.campaign!.id,
      actorId: session.user.id,
      action: "UPDATE_AI_ECONOMIC_MULTIPLIER_AUTOMATION",
      targetType: "CAMPAIGN",
      targetId: context.campaign!.id,
      beforeSummary: {
        enabled: context.campaign!.autoApproveEconomicMultipliers,
      },
      afterSummary: { enabled },
      reason: "AI 경제 승수 자동 확정 설정 변경",
    });
  });
  revalidatePath("/admin/ai-jobs");
}

export async function saveCampaignLoreAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const context = await getViewerContext(session.user.id);
  if (!context.campaign) throw new Error("활성 캠페인이 없습니다.");
  const input = z
    .object({
      html: z.string().max(500_000),
      css: z.string().max(200_000),
    })
    .parse({ html: formData.get("html"), css: formData.get("css") });

  await db.transaction(async (tx) => {
    const locked = await tx.execute<{ loreVersion: number }>(sql`
      SELECT lore_version AS "loreVersion"
      FROM campaigns
      WHERE id = ${context.campaign!.id}
      FOR UPDATE
    `);
    const nextVersion = (locked.at(0)?.loreVersion ?? context.campaign!.loreVersion) + 1;
    await tx
      .update(campaigns)
      .set({
        lore: input.html,
        loreCss: input.css,
        loreVersion: nextVersion,
        lorePublishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, context.campaign!.id));
    await tx.insert(auditLogs).values({
      campaignId: context.campaign!.id,
      actorId: session.user.id,
      action: "PUBLISH_CAMPAIGN_LORE",
      targetType: "CAMPAIGN",
      targetId: context.campaign!.id,
      beforeSummary: { version: context.campaign!.loreVersion },
      afterSummary: {
        version: nextVersion,
        htmlLength: input.html.length,
        cssLength: input.css.length,
      },
      reason: "세계관 페이지 게시",
    });
  });
  revalidatePath("/admin/world");
  revalidatePath("/world");
  revalidatePath("/world-intro");
}

export async function acknowledgeCampaignLoreAction() {
  const session = await requireRole("USER");
  if (session.user.role === "ADMIN" || session.user.role === "MODERATOR") redirect("/admin");
  const context = await getViewerContext(session.user.id);
  if (!context.campaign) redirect("/");

  await db
    .insert(campaignLoreViews)
    .values({
      campaignId: context.campaign.id,
      userId: session.user.id,
      version: context.campaign.loreVersion,
      viewedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [campaignLoreViews.campaignId, campaignLoreViews.userId],
      set: { version: context.campaign.loreVersion, viewedAt: new Date() },
    });
  redirect(context.assignment ? "/dashboard" : "/apply");
}
