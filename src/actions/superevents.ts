"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole, requireSession } from "@/src/auth/session";
import { db, sqlClient } from "@/src/db";
import {
  auditLogs,
  campaignMemberships,
  countryAssignments,
  notifications,
  superEventReceipts,
  superEvents,
} from "@/src/db/schema";
import { getViewerContext } from "@/src/db/queries/viewer";
import { SUPER_EVENT_LIMITS } from "@/src/domain/superevents/template";

const trimmed = (max: number) => z.string().trim().max(max);

const composeSchema = z.object({
  id: z.string().uuid().optional(),
  intent: z.enum(["SAVE", "BROADCAST"]),
  audience: z.enum(["ALL", "COUNTRY"]),
  targetCountryId: z.string().uuid().nullable(),
  codeName: trimmed(SUPER_EVENT_LIMITS.codeName),
  sourceLabel: trimmed(SUPER_EVENT_LIMITS.sourceLabel),
  title: trimmed(SUPER_EVENT_LIMITS.title),
  subtitle: trimmed(SUPER_EVENT_LIMITS.subtitle),
  body: trimmed(SUPER_EVENT_LIMITS.body),
  footnote: trimmed(SUPER_EVENT_LIMITS.footnote),
  stampText: trimmed(SUPER_EVENT_LIMITS.stampText),
  imageUrl: z.string().max(400).nullable(),
  imageAlt: trimmed(200),
  videoUrl: z.string().max(400).nullable(),
  videoSound: z.boolean(),
  audioUrl: z.string().max(400).nullable(),
  audioVolume: z.coerce.number().int().min(0).max(100),
  audioStartSeconds: z.coerce.number().int().min(0).max(SUPER_EVENT_LIMITS.audioStartSecondsMax),
  audioIntroReduced: z.boolean(),
  dismissLabel: trimmed(SUPER_EVENT_LIMITS.dismissLabel),
  holdSeconds: z.coerce.number().int().min(0).max(SUPER_EVENT_LIMITS.holdSecondsMax),
  bulletinEnabled: z.boolean(),
  superEnabled: z.boolean(),
  bulletinOutlet: trimmed(SUPER_EVENT_LIMITS.bulletinOutlet),
  bulletinSection: trimmed(SUPER_EVENT_LIMITS.bulletinSection),
  bulletinHeadline: trimmed(SUPER_EVENT_LIMITS.bulletinHeadline),
  bulletinByline: trimmed(SUPER_EVENT_LIMITS.bulletinByline),
  bulletinBody: trimmed(SUPER_EVENT_LIMITS.bulletinBody),
  bulletinImageUrl: z.string().max(400).nullable(),
  bulletinImageCaption: trimmed(SUPER_EVENT_LIMITS.bulletinImageCaption),
  bulletinKicker: trimmed(SUPER_EVENT_LIMITS.bulletinKicker),
});

function optionalText(value: FormDataEntryValue | null) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length ? text : null;
}

/** 호외와 전대역 송출 가운데 최소 한 겹은 내용이 있어야 한다. */
function assertComposeShape(input: z.infer<typeof composeSchema>) {
  if (!input.bulletinEnabled && !input.superEnabled) {
    throw new Error("호외와 전대역 송출 가운데 최소 하나는 켜야 합니다.");
  }
  if (input.superEnabled && !input.title) throw new Error("전대역 송출은 제목이 필요합니다.");
  if (input.bulletinEnabled && !input.bulletinHeadline) {
    throw new Error("호외는 기사 제목이 필요합니다.");
  }
}

/** 알림과 목록에 쓸 대표 문구. 호외만 내보낸 건은 기사 제목을 쓴다. */
function headlineOf(target: { title: string; bulletinHeadline: string; superEnabled: boolean }) {
  const primary = target.superEnabled ? target.title : target.bulletinHeadline;
  return primary || target.title || target.bulletinHeadline;
}

/** 편성 화면의 저장 버튼. intent=BROADCAST이면 저장 직후 곧바로 송출한다. */
export async function saveSuperEventAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const context = await getViewerContext(session.user.id);
  if (!context.campaign) throw new Error("활성 캠페인이 없습니다.");

  const input = composeSchema.parse({
    id: optionalText(formData.get("id")) ?? undefined,
    intent: formData.get("intent"),
    audience: formData.get("audience"),
    targetCountryId: optionalText(formData.get("targetCountryId")),
    codeName: formData.get("codeName") ?? "",
    sourceLabel: formData.get("sourceLabel") ?? "",
    title: formData.get("title") ?? "",
    subtitle: formData.get("subtitle") ?? "",
    body: formData.get("body") ?? "",
    footnote: formData.get("footnote") ?? "",
    stampText: formData.get("stampText") ?? "",
    imageUrl: optionalText(formData.get("imageUrl")),
    imageAlt: formData.get("imageAlt") ?? "",
    videoUrl: optionalText(formData.get("videoUrl")),
    videoSound: formData.get("videoSound") === "on",
    audioUrl: optionalText(formData.get("audioUrl")),
    audioVolume: formData.get("audioVolume") ?? 70,
    audioStartSeconds: formData.get("audioStartSeconds") ?? 0,
    audioIntroReduced: formData.get("audioIntroReduced") === "on",
    dismissLabel: formData.get("dismissLabel") ?? "확인",
    holdSeconds: formData.get("holdSeconds") ?? 4,
    bulletinEnabled: formData.get("bulletinEnabled") === "on",
    superEnabled: formData.get("superEnabled") === "on",
    bulletinOutlet: formData.get("bulletinOutlet") ?? "",
    bulletinSection: formData.get("bulletinSection") ?? "",
    bulletinHeadline: formData.get("bulletinHeadline") ?? "",
    bulletinByline: formData.get("bulletinByline") ?? "",
    bulletinBody: formData.get("bulletinBody") ?? "",
    bulletinImageUrl: optionalText(formData.get("bulletinImageUrl")),
    bulletinImageCaption: formData.get("bulletinImageCaption") ?? "",
    bulletinKicker: formData.get("bulletinKicker") ?? "",
  });
  if (input.audience === "COUNTRY" && !input.targetCountryId) {
    throw new Error("국가 지정 송출은 대상 국가를 골라야 합니다.");
  }
  assertComposeShape(input);

  const values = {
    campaignId: context.campaign.id,
    turnId: context.turn?.id ?? null,
    audience: input.audience,
    targetCountryId: input.audience === "COUNTRY" ? input.targetCountryId : null,
    codeName: input.codeName,
    sourceLabel: input.sourceLabel,
    title: input.title,
    subtitle: input.subtitle,
    body: input.body,
    footnote: input.footnote,
    stampText: input.stampText,
    imageUrl: input.imageUrl,
    imageAlt: input.imageAlt,
    videoUrl: input.videoUrl,
    videoSound: input.videoSound,
    audioUrl: input.audioUrl,
    audioVolume: input.audioVolume,
    audioStartSeconds: input.audioStartSeconds,
    audioIntroReduced: input.audioIntroReduced,
    dismissLabel: input.dismissLabel || "확인",
    holdSeconds: input.holdSeconds,
    bulletinEnabled: input.bulletinEnabled,
    superEnabled: input.superEnabled,
    bulletinOutlet: input.bulletinOutlet,
    bulletinSection: input.bulletinSection,
    bulletinHeadline: input.bulletinHeadline,
    bulletinByline: input.bulletinByline,
    bulletinBody: input.bulletinBody,
    bulletinImageUrl: input.bulletinImageUrl,
    bulletinImageCaption: input.bulletinImageCaption,
    bulletinKicker: input.bulletinKicker,
    updatedAt: new Date(),
  };

  let superEventId = input.id ?? null;
  if (superEventId) {
    const existing = await db.query.superEvents.findFirst({
      where: and(eq(superEvents.id, superEventId), eq(superEvents.campaignId, context.campaign.id)),
    });
    if (!existing) throw new Error("수정할 슈퍼이벤트를 찾을 수 없습니다.");
    if (existing.status === "BROADCAST")
      throw new Error("이미 송출한 슈퍼이벤트는 고칠 수 없습니다.");
    await db.update(superEvents).set(values).where(eq(superEvents.id, superEventId));
  } else {
    const [created] = await db
      .insert(superEvents)
      .values({ ...values, createdBy: session.user.id })
      .returning({ id: superEvents.id });
    superEventId = created.id;
  }

  await db.insert(auditLogs).values({
    campaignId: context.campaign.id,
    actorId: session.user.id,
    action: input.id ? "UPDATE_SUPER_EVENT" : "CREATE_SUPER_EVENT",
    targetType: "SUPER_EVENT",
    targetId: superEventId,
    afterSummary: { title: input.title, audience: input.audience },
    reason: "슈퍼이벤트 편성",
  });

  revalidatePath("/admin/superevents");
  if (input.intent === "BROADCAST") await broadcast(session.user.id, superEventId);
}

export async function broadcastSuperEventAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  await broadcast(session.user.id, z.string().uuid().parse(formData.get("id")));
}

/** 이미 송출한 건을 다시 띄운다. 확인 기록을 지워 모든 대상이 한 번 더 보게 한다. */
export async function rebroadcastSuperEventAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const id = z.string().uuid().parse(formData.get("id"));
  await db.delete(superEventReceipts).where(eq(superEventReceipts.superEventId, id));
  await broadcast(session.user.id, id);
}

export async function archiveSuperEventAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const id = z.string().uuid().parse(formData.get("id"));
  const target = await db.query.superEvents.findFirst({ where: eq(superEvents.id, id) });
  if (!target) throw new Error("슈퍼이벤트를 찾을 수 없습니다.");
  await db
    .update(superEvents)
    .set({ status: "ARCHIVED", updatedAt: new Date() })
    .where(eq(superEvents.id, id));
  await db.insert(auditLogs).values({
    campaignId: target.campaignId,
    actorId: session.user.id,
    action: "ARCHIVE_SUPER_EVENT",
    targetType: "SUPER_EVENT",
    targetId: id,
    beforeSummary: { status: target.status },
    afterSummary: { status: "ARCHIVED" },
    reason: "슈퍼이벤트 송출 종료",
  });
  revalidatePath("/admin/superevents");
}

export async function deleteSuperEventAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const id = z.string().uuid().parse(formData.get("id"));
  const target = await db.query.superEvents.findFirst({ where: eq(superEvents.id, id) });
  if (!target) throw new Error("슈퍼이벤트를 찾을 수 없습니다.");
  if (target.status === "BROADCAST") throw new Error("송출 중인 슈퍼이벤트는 먼저 종료해 주세요.");
  await db.delete(superEvents).where(eq(superEvents.id, id));
  await db.insert(auditLogs).values({
    campaignId: target.campaignId,
    actorId: session.user.id,
    action: "DELETE_SUPER_EVENT",
    targetType: "SUPER_EVENT",
    targetId: id,
    beforeSummary: { title: target.title, status: target.status },
    reason: "슈퍼이벤트 초안 삭제",
  });
  revalidatePath("/admin/superevents");
}

/** 플레이어가 송출을 끝까지 보고 확인 버튼을 눌렀을 때. */
export async function acknowledgeSuperEventAction(superEventId: string) {
  const session = await requireSession();
  const id = z.string().uuid().parse(superEventId);
  await db
    .insert(superEventReceipts)
    .values({ superEventId: id, userId: session.user.id })
    .onConflictDoNothing();
}

async function broadcast(actorId: string, superEventId: string) {
  const target = await db.query.superEvents.findFirst({
    where: eq(superEvents.id, superEventId),
  });
  if (!target) throw new Error("송출할 슈퍼이벤트를 찾을 수 없습니다.");
  const headline = headlineOf(target).trim();
  if (!headline) throw new Error("제목이 빈 송출은 내보낼 수 없습니다.");

  const recipients =
    target.audience === "COUNTRY" && target.targetCountryId
      ? await db
          .select({ userId: countryAssignments.userId })
          .from(countryAssignments)
          .where(
            and(
              eq(countryAssignments.campaignId, target.campaignId),
              eq(countryAssignments.countryId, target.targetCountryId),
              eq(countryAssignments.isActive, true),
              isNull(countryAssignments.endTurnId),
            ),
          )
      : await db
          .select({ userId: campaignMemberships.userId })
          .from(campaignMemberships)
          .where(
            and(
              eq(campaignMemberships.campaignId, target.campaignId),
              eq(campaignMemberships.status, "ACTIVE"),
            ),
          );

  await db.transaction(async (tx) => {
    await tx
      .update(superEvents)
      .set({ status: "BROADCAST", broadcastAt: new Date(), updatedAt: new Date() })
      .where(eq(superEvents.id, target.id));
    if (recipients.length) {
      await tx.insert(notifications).values(
        recipients.map((recipient) => ({
          userId: recipient.userId,
          campaignId: target.campaignId,
          type: "SUPER_EVENT",
          title: `${target.superEnabled ? "전대역 송출" : "호외"} · ${headline}`,
          body: target.subtitle || target.bulletinKicker || "긴급 송출이 전달되었습니다.",
          href: null,
        })),
      );
    }
    await tx.insert(auditLogs).values({
      campaignId: target.campaignId,
      actorId,
      action: "BROADCAST_SUPER_EVENT",
      targetType: "SUPER_EVENT",
      targetId: target.id,
      beforeSummary: { status: target.status },
      afterSummary: { status: "BROADCAST", recipients: recipients.length },
      reason: "슈퍼이벤트 전대역 송출",
    });
  });

  await sqlClient.notify(
    "superevent_events",
    JSON.stringify({ campaignId: target.campaignId, superEventId: target.id }),
  );
  await sqlClient.notify("notification_events", JSON.stringify({ campaignId: target.campaignId }));
  revalidatePath("/admin/superevents");
}
