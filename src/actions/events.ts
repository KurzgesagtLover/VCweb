"use server";

import { and, eq, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole, requireSession } from "@/src/auth/session";
import { db } from "@/src/db";
import {
  auditLogs,
  countries,
  eventChoices,
  eventOptions,
  events,
  oppositionActions,
} from "@/src/db/schema";
import { validateEffects } from "@/src/domain/effects/registry";
import { getViewerContext } from "@/src/db/queries/viewer";

export async function chooseEventOptionAction(formData: FormData) {
  const session = await requireSession();
  const context = await getViewerContext(session.user.id);
  if (!context.country || !context.turn || context.turn.status !== "DRAFT") {
    throw new Error("사건 선택 기간이 아닙니다.");
  }
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const optionId = z.string().uuid().parse(formData.get("optionId"));
  const event = await db.query.events.findFirst({
    where: and(
      eq(events.id, eventId),
      eq(events.status, "PUBLISHED"),
      or(eq(events.countryId, context.country.id), eq(events.visibility, "PUBLIC")),
    ),
  });
  if (!event) throw new Error("선택 가능한 사건이 아닙니다.");
  const option = await db.query.eventOptions.findFirst({
    where: and(eq(eventOptions.id, optionId), eq(eventOptions.eventId, event.id)),
  });
  if (!option) throw new Error("사건 선택지를 찾을 수 없습니다.");
  const invalid = validateEffects(option.effects).find((item) => !item.valid);
  if (invalid) throw new Error(`선택지 효과가 유효하지 않습니다: ${invalid.warning}`);
  const existing = await db.query.eventChoices.findFirst({
    where: and(eq(eventChoices.eventId, event.id), eq(eventChoices.countryId, context.country.id)),
  });
  if (existing && !event.choiceMutable) throw new Error("이 사건의 선택은 변경할 수 없습니다.");
  if (existing) {
    await db
      .update(eventChoices)
      .set({ optionId: option.id, version: existing.version + 1, updatedAt: new Date() })
      .where(eq(eventChoices.id, existing.id));
  } else {
    await db.insert(eventChoices).values({
      eventId: event.id,
      optionId: option.id,
      countryId: context.country.id,
      userId: session.user.id,
    });
  }
  revalidatePath("/events");
  revalidatePath("/dashboard");
}

export async function reviewGeneratedEventAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const decision = z.enum(["APPROVED", "REJECTED"]).parse(formData.get("decision"));
  const event = await db.query.events.findFirst({
    where: and(eq(events.id, eventId), eq(events.status, "REVIEW")),
  });
  if (!event) throw new Error("검토 가능한 사건이 아닙니다.");
  await db.transaction(async (tx) => {
    await tx
      .update(events)
      .set({
        status: decision === "APPROVED" ? "PUBLISHED" : "ARCHIVED",
        publishedAt: decision === "APPROVED" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(events.id, event.id));
    await tx.insert(auditLogs).values({
      campaignId: event.campaignId,
      actorId: session.user.id,
      action: `${decision}_GENERATED_EVENT`,
      targetType: "EVENT",
      targetId: event.id,
      beforeSummary: { status: "REVIEW" },
      afterSummary: { status: decision === "APPROVED" ? "PUBLISHED" : "ARCHIVED" },
      reason: "자동 생성 사건 관리자 검토",
    });
  });
  revalidatePath("/admin/events");
  revalidatePath("/events");
}

export async function reviewOppositionAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const actionId = z.string().uuid().parse(formData.get("actionId"));
  const decision = z.enum(["APPROVED", "REJECTED"]).parse(formData.get("decision"));
  const action = await db.query.oppositionActions.findFirst({
    where: and(eq(oppositionActions.id, actionId), eq(oppositionActions.status, "PENDING_REVIEW")),
  });
  if (!action) throw new Error("검토 가능한 야당 행동이 아닙니다.");
  const country = await db.query.countries.findFirst({
    where: eq(countries.id, action.countryId),
  });
  if (!country) throw new Error("야당 행동의 국가를 찾을 수 없습니다.");
  const invalid = validateEffects(action.effects).find((item) => !item.valid);
  if (decision === "APPROVED" && invalid) throw new Error(`야당 효과 오류: ${invalid.warning}`);
  await db.transaction(async (tx) => {
    let eventId: string | null = null;
    if (decision === "APPROVED") {
      const [event] = await tx
        .insert(events)
        .values({
          campaignId: country.campaignId,
          countryId: action.countryId,
          title: action.title,
          subtitle: "의회에서 시작된 정치적 파장",
          body: action.narrative,
          visibility: "COUNTRY",
          status: "PUBLISHED",
          startTurnId: action.turnId,
          sourceType: "OPPOSITION_ACTION",
          sourceId: action.id,
          required: true,
          choiceMutable: true,
          publishedAt: new Date(),
          portraitImageKey: "opposition-leader",
        })
        .returning();
      eventId = event.id;
      await tx.insert(eventOptions).values([
        {
          eventId: event.id,
          order: 1,
          label: "공개 청문과 자료 제출 수용",
          description: "야당 요구를 제도권 검증 절차로 흡수합니다.",
          expectedEffect: "단기 정치 비용, 장기 투명성 개선 가능",
          effects: action.effects,
        },
        {
          eventId: event.id,
          order: 2,
          label: "정부 독자 일정 유지",
          description: "정책 집행을 우선하고 정치적 책임을 감수합니다.",
          expectedEffect: "정책 지연 없음, 사회 불안 소폭 상승",
          effects: [
            {
              targetType: "COUNTRY",
              targetId: action.countryId,
              metric: "unrest",
              operation: "ADD",
              value: "2",
              durationTurns: 1,
              reason: "청문 요구 거부에 따른 단기 반발",
            },
          ],
        },
      ]);
    }
    await tx
      .update(oppositionActions)
      .set({
        status: decision === "APPROVED" ? "APPROVED" : "REJECTED",
        eventId,
        reviewedBy: session.user.id,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(oppositionActions.id, action.id));
    await tx.insert(auditLogs).values({
      campaignId: country.campaignId,
      actorId: session.user.id,
      action: `${decision}_OPPOSITION_ACTION`,
      targetType: "OPPOSITION_ACTION",
      targetId: action.id,
      beforeSummary: { status: "PENDING_REVIEW" },
      afterSummary: { status: decision, eventId },
      reason: action.rationale,
    });
  });
  revalidatePath("/admin/events");
  revalidatePath("/events");
}
