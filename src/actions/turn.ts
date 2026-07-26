import Decimal from "decimal.js";
import { and, eq, inArray, ne, notInArray, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/src/auth/session";
import { db, sqlClient } from "@/src/db";
import {
  appliedEffects,
  auditLogs,
  campaignMemberships,
  campaigns,
  countries,
  demographicSnapshots,
  economicSnapshots,
  effectProposals,
  eventChoices,
  eventOptions,
  events,
  jobs,
  judgmentProposals,
  modifiers,
  notifications,
  oppositionActions,
  politicalSnapshots,
  submissions,
  turnCountryWorkspaces,
  turns,
  turnStepRuns,
  type DomainEffect,
} from "@/src/db/schema";
import { assertTurnTransition, turnStepKey } from "@/src/domain/turn/state-machine";
import {
  adjudicationRealDayInterval,
  addGameDuration,
  advanceTurnDeadline,
  nextTurnDeadline,
} from "@/src/domain/turn/schedule";
import { validateEffect } from "@/src/domain/effects/registry";
import { getViewerContext } from "@/src/db/queries/viewer";
import {
  drainJobs,
  enqueueAiStage,
  enqueueJob,
  turnJobsAreSettled,
} from "@/src/services/job-runner";

function requireConfirmation(formData: FormData) {
  if (formData.get("confirm") !== "yes")
    throw new Error("영향 범위를 확인해야 실행할 수 있습니다.");
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

const economicEffectBounds: Record<string, [string, string]> = {
  realGdpGrowth: ["-0.25", "0.30"],
  inflationRate: ["-0.10", "1"],
  unemploymentRate: ["0", "1"],
  productivityIndex: ["0", "1000000"],
  incomeGini: ["0", "1"],
  wealthGini: ["0", "1"],
  debtToGdp: ["0", "10"],
  currentAccountToGdp: ["-1", "1"],
};

const politicalEffectMetrics = new Set([
  "stability",
  "legitimacy",
  "governmentApproval",
  "policySupport",
  "unrest",
  "stateCapacity",
  "corruption",
  "democracy",
]);

function applyEffectValue(current: unknown, effect: DomainEffect) {
  const value = new Decimal(String(current));
  return effect.operation === "ADD"
    ? value.plus(effect.value)
    : value.mul(new Decimal(1).plus(effect.value));
}

function applyEffectToSnapshot(
  economic: Record<string, unknown>,
  political: Record<string, unknown>,
  effect: DomainEffect,
) {
  const economicBounds = economicEffectBounds[effect.metric];
  if (economicBounds) {
    economic[effect.metric] = Decimal.max(
      economicBounds[0],
      Decimal.min(economicBounds[1], applyEffectValue(economic[effect.metric], effect)),
    ).toString();
    return;
  }
  if (politicalEffectMetrics.has(effect.metric)) {
    political[effect.metric] = Math.round(
      Decimal.max(
        0,
        Decimal.min(100, applyEffectValue(political[effect.metric], effect)),
      ).toNumber(),
    );
  }
}

async function activeTurnForAdmin(userId: string) {
  const context = await getViewerContext(userId);
  if (!context.campaign || !context.turn) throw new Error("활성 턴이 없습니다.");
  return { campaign: context.campaign, turn: context.turn };
}

export async function lockTurnAction(formData: FormData) {
  "use server";
  const session = await requireRole("ADMIN");
  requireConfirmation(formData);
  const { campaign, turn } = await activeTurnForAdmin(session.user.id);
  if (turn.status !== "DRAFT") {
    const prior = await db.query.turnStepRuns.findFirst({
      where: eq(turnStepRuns.idempotencyKey, turnStepKey(campaign.id, turn.id, "LOCK")),
    });
    if (prior?.status === "SUCCEEDED") return;
    throw new Error("잠글 수 있는 DRAFT 턴이 아닙니다.");
  }
  assertTurnTransition(turn.status, "LOCKED");
  await db.transaction(async (tx) => {
    const key = turnStepKey(campaign.id, turn.id, "LOCK");
    await tx.insert(turnStepRuns).values({
      campaignId: campaign.id,
      turnId: turn.id,
      step: "LOCK",
      idempotencyKey: key,
      status: "SUCCEEDED",
      result: { lockedAt: new Date().toISOString() },
      completedAt: new Date(),
    });
    await tx
      .update(submissions)
      .set({ status: "LOCKED", lockedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(submissions.turnId, turn.id), eq(submissions.status, "SUBMITTED")));
    await tx
      .update(turns)
      .set({
        status: "LOCKED",
        stepCompletedAt: { ...turn.stepCompletedAt, LOCKED: new Date().toISOString() },
        updatedAt: new Date(),
      })
      .where(and(eq(turns.id, turn.id), eq(turns.status, "DRAFT")));
    await tx.insert(auditLogs).values({
      campaignId: campaign.id,
      actorId: session.user.id,
      action: "LOCK_TURN",
      targetType: "TURN",
      targetId: turn.id,
      beforeSummary: { status: "DRAFT" },
      afterSummary: { status: "LOCKED" },
      reason: `T${turn.sequence} 제출 마감`,
    });
  });
  revalidatePath("/admin");
  revalidatePath("/submissions");
}

export async function startTurnCalculationAction(formData: FormData) {
  "use server";
  const session = await requireRole("ADMIN");
  requireConfirmation(formData);
  const { campaign, turn } = await activeTurnForAdmin(session.user.id);
  if (!(["LOCKED", "CALCULATING"] as string[]).includes(turn.status)) {
    throw new Error("계산을 시작할 수 있는 턴 상태가 아닙니다.");
  }
  if (turn.status === "LOCKED") {
    assertTurnTransition(turn.status, "CALCULATING");
    await db
      .update(turns)
      .set({ status: "CALCULATING", error: null, updatedAt: new Date() })
      .where(and(eq(turns.id, turn.id), eq(turns.status, "LOCKED")));
    await db
      .insert(turnStepRuns)
      .values({
        campaignId: campaign.id,
        turnId: turn.id,
        step: "CALCULATING",
        idempotencyKey: turnStepKey(campaign.id, turn.id, "CALCULATING"),
        status: "RUNNING",
      })
      .onConflictDoNothing({ target: turnStepRuns.idempotencyKey });
  }
  const countryRows = await db.query.countries.findMany({
    where: and(eq(countries.campaignId, campaign.id), eq(countries.setupStatus, "APPROVED")),
  });
  for (const country of countryRows) {
    await enqueueJob({
      campaignId: campaign.id,
      turnId: turn.id,
      type: "CALCULATE_COUNTRY_ECONOMY",
      payload: { countryId: country.id },
      idempotencyKey: `${campaign.id}:${turn.id}:CALCULATE_COUNTRY_ECONOMY:${country.id}`,
    });
    await enqueueJob({
      campaignId: campaign.id,
      turnId: turn.id,
      type: "CALCULATE_COUNTRY_RESEARCH",
      payload: { countryId: country.id },
      idempotencyKey: `${campaign.id}:${turn.id}:CALCULATE_COUNTRY_RESEARCH:${country.id}`,
    });
  }
  revalidatePath("/admin");
}

export async function runTurnJobsAction(formData: FormData) {
  "use server";
  const session = await requireRole("ADMIN");
  requireConfirmation(formData);
  const { campaign, turn } = await activeTurnForAdmin(session.user.id);
  if (!(["CALCULATING", "AI_RUNNING"] as string[]).includes(turn.status)) {
    throw new Error("실행할 턴 작업이 없습니다.");
  }
  await drainJobs(250);
  let current = await db.query.turns.findFirst({ where: eq(turns.id, turn.id) });
  if (!current) throw new Error("턴을 찾을 수 없습니다.");
  if (current.status === "CALCULATING") {
    const complete = await turnJobsAreSettled(current.id, [
      "CALCULATE_COUNTRY_ECONOMY",
      "CALCULATE_COUNTRY_RESEARCH",
    ]);
    if (!complete) throw new Error("결정론적 계산 작업이 아직 완료되지 않았습니다.");
    await db.transaction(async (tx) => {
      await tx
        .update(turns)
        .set({
          status: "AI_RUNNING",
          stepCompletedAt: { ...current!.stepCompletedAt, CALCULATING: new Date().toISOString() },
          updatedAt: new Date(),
        })
        .where(eq(turns.id, current!.id));
      await tx
        .update(turnStepRuns)
        .set({ status: "SUCCEEDED", completedAt: new Date() })
        .where(eq(turnStepRuns.idempotencyKey, turnStepKey(campaign.id, turn.id, "CALCULATING")));
      await tx
        .insert(turnStepRuns)
        .values({
          campaignId: campaign.id,
          turnId: turn.id,
          step: "AI_RUNNING",
          idempotencyKey: turnStepKey(campaign.id, turn.id, "AI_RUNNING"),
          status: "RUNNING",
        })
        .onConflictDoNothing({ target: turnStepRuns.idempotencyKey });
    });
    await enqueueAiStage(campaign.id, turn.id);
    await drainJobs(250);
    current = await db.query.turns.findFirst({ where: eq(turns.id, turn.id) });
  }
  if (current?.status === "AI_RUNNING") {
    const unsettled = await db.query.jobs.findMany({
      where: and(eq(jobs.turnId, turn.id), ne(jobs.status, "SUCCEEDED")),
    });
    if (unsettled.some((job) => job.status === "FAILED")) {
      await db
        .update(turns)
        .set({
          status: "FAILED",
          error: "하나 이상의 작업이 최종 실패했습니다.",
          updatedAt: new Date(),
        })
        .where(eq(turns.id, turn.id));
      throw new Error("실패한 작업이 있어 턴을 REVIEW로 이동하지 못했습니다.");
    }
    if (unsettled.length === 0) {
      await db.transaction(async (tx) => {
        await tx
          .update(turns)
          .set({
            status: "REVIEW",
            stepCompletedAt: { ...current!.stepCompletedAt, AI_RUNNING: new Date().toISOString() },
            updatedAt: new Date(),
          })
          .where(eq(turns.id, turn.id));
        await tx
          .update(turnStepRuns)
          .set({ status: "SUCCEEDED", completedAt: new Date() })
          .where(eq(turnStepRuns.idempotencyKey, turnStepKey(campaign.id, turn.id, "AI_RUNNING")));
      });
    }
  }
  revalidatePath("/admin");
  revalidatePath("/admin/submissions");
  revalidatePath("/admin/events");
}

async function applyEffect(
  effect: DomainEffect,
  sourceKey: string,
  campaignId: string,
  turnId: string,
  effectProposalId?: string,
  eventChoiceId?: string,
) {
  const checked = validateEffect(effect);
  if (!checked.valid) throw new Error(`승인 효과 검증 실패: ${checked.warning}`);
  if (checked.effect.targetType !== "COUNTRY") {
    throw new Error("현재 공개 단계에서는 COUNTRY 표준 효과만 직접 적용할 수 있습니다.");
  }
  await db.transaction(async (tx) => {
    const [applied] = await tx
      .insert(appliedEffects)
      .values({
        campaignId,
        turnId,
        sourceKey,
        effectProposalId,
        eventChoiceId,
        effect: checked.effect,
      })
      .onConflictDoNothing({ target: appliedEffects.sourceKey })
      .returning();
    if (!applied) return;
    const [modifier] = await tx
      .insert(modifiers)
      .values({
        countryId: checked.effect.targetId,
        targetType: checked.effect.targetType,
        targetId: checked.effect.targetId,
        metric: checked.effect.metric,
        operation: checked.effect.operation,
        value: checked.effect.value,
        startTurnId: turnId,
        durationTurns: checked.effect.durationTurns,
        sourceType: effectProposalId ? "JUDGMENT" : "EVENT_CHOICE",
        sourceId: sourceKey,
      })
      .returning();
    await tx
      .update(appliedEffects)
      .set({ modifierId: modifier.id })
      .where(eq(appliedEffects.id, applied.id));
  });
}

export async function publishTurnAction(formData: FormData) {
  "use server";
  const session = await requireRole("ADMIN");
  requireConfirmation(formData);
  const { campaign, turn } = await activeTurnForAdmin(session.user.id);
  await publishTurnCore(campaign, turn, session.user.id);
  revalidatePath("/admin");
  revalidatePath("/dashboard");
  revalidatePath("/events");
  revalidatePath("/submissions");
}

export async function publishTurnCore(
  campaign: typeof campaigns.$inferSelect,
  turn: typeof turns.$inferSelect,
  actorId: string,
) {
  if (turn.status !== "REVIEW") {
    const prior = await db.query.turnStepRuns.findFirst({
      where: eq(turnStepRuns.idempotencyKey, turnStepKey(campaign.id, turn.id, "PUBLISH")),
    });
    if (prior?.status === "SUCCEEDED") return;
    throw new Error("REVIEW 상태의 턴만 공개할 수 있습니다.");
  }

  const [pendingJudgments, pendingOpposition, reviewEvents, failedJobs, workspaceRows] =
    await Promise.all([
      db
        .select({ id: judgmentProposals.id })
        .from(judgmentProposals)
        .innerJoin(submissions, eq(judgmentProposals.submissionId, submissions.id))
        .where(and(eq(judgmentProposals.turnId, turn.id), eq(judgmentProposals.status, "PENDING"))),
      db.query.oppositionActions.findMany({
        where: and(
          eq(oppositionActions.turnId, turn.id),
          eq(oppositionActions.status, "PENDING_REVIEW"),
        ),
      }),
      db.query.events.findMany({
        where: and(eq(events.startTurnId, turn.id), eq(events.status, "REVIEW")),
      }),
      db.query.jobs.findMany({
        where: and(eq(jobs.turnId, turn.id), eq(jobs.status, "FAILED")),
      }),
      db
        .select({
          id: turnCountryWorkspaces.id,
          countryId: turnCountryWorkspaces.countryId,
          afterEconomic: turnCountryWorkspaces.afterEconomic,
          afterDemographic: turnCountryWorkspaces.afterDemographic,
          afterPolitical: turnCountryWorkspaces.afterPolitical,
        })
        .from(turnCountryWorkspaces)
        .innerJoin(countries, eq(turnCountryWorkspaces.countryId, countries.id))
        .where(
          and(eq(turnCountryWorkspaces.turnId, turn.id), eq(countries.setupStatus, "APPROVED")),
        ),
    ]);
  const countryCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(countries)
    .where(and(eq(countries.campaignId, campaign.id), eq(countries.setupStatus, "APPROVED")));
  if (workspaceRows.length !== countryCount[0].count)
    throw new Error("국가별 계산 작업 공간이 완성되지 않았습니다.");
  if (
    pendingJudgments.length ||
    pendingOpposition.length ||
    reviewEvents.length ||
    failedJobs.length
  ) {
    throw new Error("미승인 판정·사건 또는 실패 작업이 남아 있어 공개할 수 없습니다.");
  }
  const requiredEvents = await db.query.events.findMany({
    where: and(
      eq(events.campaignId, campaign.id),
      eq(events.status, "PUBLISHED"),
      eq(events.required, true),
      sql`EXISTS (
        SELECT 1 FROM turns event_turn
        WHERE event_turn.id = ${events.startTurnId}
          AND event_turn.sequence <= ${turn.sequence}
      )`,
      or(
        ne(events.startTurnId, turn.id),
        notInArray(events.sourceType, ["AUTO_TURN", "OPPOSITION_ACTION"]),
      ),
    ),
  });
  for (const event of requiredEvents) {
    const choice = await db.query.eventChoices.findFirst({
      where: eq(eventChoices.eventId, event.id),
    });
    if (choice) continue;
    const eventCountry = event.countryId
      ? await db.query.countries.findFirst({ where: eq(countries.id, event.countryId) })
      : null;
    if (eventCountry?.isAi) {
      const option = await db.query.eventOptions.findFirst({
        where: eq(eventOptions.eventId, event.id),
        orderBy: [eventOptions.order],
      });
      if (!option) throw new Error(`AI 사건 '${event.title}'의 선택지가 없습니다.`);
      await db.insert(eventChoices).values({
        eventId: event.id,
        optionId: option.id,
        countryId: eventCountry.id,
        userId: actorId,
      });
      continue;
    }
    throw new Error(`필수 사건 '${event.title}'의 선택이 없습니다.`);
  }

  const approvedEffects = await db
    .select({ effect: effectProposals, submission: submissions })
    .from(effectProposals)
    .innerJoin(judgmentProposals, eq(effectProposals.judgmentProposalId, judgmentProposals.id))
    .innerJoin(submissions, eq(judgmentProposals.submissionId, submissions.id))
    .where(and(eq(judgmentProposals.turnId, turn.id), eq(effectProposals.status, "APPROVED")));
  const snapshotEffects: DomainEffect[] = [];
  const receptionApplied = new Set<string>();
  for (const { effect, submission } of approvedEffects) {
    const baseEffect: DomainEffect = {
      targetType: effect.targetType as DomainEffect["targetType"],
      targetId: effect.targetId,
      metric: effect.metric,
      operation: effect.operation as DomainEffect["operation"],
      value: effect.value,
      durationTurns: effect.durationTurns,
      reason: effect.reason,
    };
    const scaledCandidate: DomainEffect = {
      ...baseEffect,
      value: new Decimal(baseEffect.value).mul(submission.effectivenessMultiplier).toString(),
      reason: `${baseEffect.reason} · 정책 효과 배율 ×${Number(
        submission.effectivenessMultiplier,
      ).toFixed(2)}`,
    };
    const scaledCheck = validateEffect(scaledCandidate);
    const domainEffect = scaledCheck.valid ? scaledCheck.effect : baseEffect;
    snapshotEffects.push(domainEffect);
    await applyEffect(
      domainEffect,
      `judgment-effect:${effect.id}`,
      campaign.id,
      turn.id,
      effect.id,
    );
    if (!receptionApplied.has(submission.id)) {
      receptionApplied.add(submission.id);
      snapshotEffects.push({
        targetType: "COUNTRY",
        targetId: submission.countryId,
        metric: "policySupport",
        operation: "ADD",
        value: new Decimal(submission.policySupport).minus(50).mul("0.12").toString(),
        durationTurns: null,
        reason: `${submission.title}에 대한 초기 국민 반응`,
      });
    }
  }
  const choices = await db
    .select({ choice: eventChoices, option: eventOptions })
    .from(eventChoices)
    .innerJoin(eventOptions, eq(eventChoices.optionId, eventOptions.id))
    .innerJoin(events, eq(eventChoices.eventId, events.id))
    .where(and(eq(events.campaignId, campaign.id), eq(events.status, "PUBLISHED")));
  for (const { choice, option } of choices) {
    for (const [index, effect] of option.effects.entries()) {
      snapshotEffects.push(effect);
      await applyEffect(
        effect,
        `event-choice:${choice.id}:${index}`,
        campaign.id,
        turn.id,
        undefined,
        choice.id,
      );
    }
  }

  await db.transaction(async (tx) => {
    const key = turnStepKey(campaign.id, turn.id, "PUBLISH");
    await tx
      .insert(turnStepRuns)
      .values({
        campaignId: campaign.id,
        turnId: turn.id,
        step: "PUBLISH",
        idempotencyKey: key,
        status: "SUCCEEDED",
        result: { effects: approvedEffects.length, choices: choices.length },
        completedAt: new Date(),
      })
      .onConflictDoNothing({ target: turnStepRuns.idempotencyKey });
    await tx
      .update(turnCountryWorkspaces)
      .set({ publishedAt: new Date(), updatedAt: new Date() })
      .where(eq(turnCountryWorkspaces.turnId, turn.id));
    for (const workspace of workspaceRows) {
      const economic = { ...workspace.afterEconomic } as Record<string, unknown>;
      const demographic = { ...workspace.afterDemographic } as Record<string, unknown>;
      const political = { ...workspace.afterPolitical } as Record<string, unknown>;
      for (const effect of snapshotEffects) {
        if (effect.targetType === "COUNTRY" && effect.targetId === workspace.countryId) {
          applyEffectToSnapshot(economic, political, effect);
        }
      }
      for (const key of ["id", "turnId", "createdAt", "updatedAt", "calculationState"]) {
        delete economic[key];
        delete demographic[key];
        delete political[key];
      }
      await tx
        .insert(demographicSnapshots)
        .values({
          ...(demographic as typeof demographicSnapshots.$inferInsert),
          countryId: workspace.countryId,
          turnId: turn.id,
        })
        .onConflictDoNothing({
          target: [demographicSnapshots.countryId, demographicSnapshots.turnId],
        });
      await tx
        .insert(economicSnapshots)
        .values({
          ...(economic as typeof economicSnapshots.$inferInsert),
          countryId: workspace.countryId,
          turnId: turn.id,
        })
        .onConflictDoNothing({
          target: [economicSnapshots.countryId, economicSnapshots.turnId],
        });
      await tx
        .insert(politicalSnapshots)
        .values({
          ...(political as typeof politicalSnapshots.$inferInsert),
          countryId: workspace.countryId,
          turnId: turn.id,
        })
        .onConflictDoNothing({
          target: [politicalSnapshots.countryId, politicalSnapshots.turnId],
        });
    }
    if (approvedEffects.length) {
      await tx
        .update(effectProposals)
        .set({ status: "APPLIED", updatedAt: new Date() })
        .where(
          inArray(
            effectProposals.id,
            approvedEffects.map(({ effect }) => effect.id),
          ),
        );
    }
    await tx
      .update(submissions)
      .set({ status: "PUBLISHED", updatedAt: new Date() })
      .where(and(eq(submissions.turnId, turn.id), eq(submissions.status, "APPROVED")));
    await tx
      .update(oppositionActions)
      .set({ status: "PUBLISHED", updatedAt: new Date() })
      .where(and(eq(oppositionActions.turnId, turn.id), eq(oppositionActions.status, "APPROVED")));
    if (choices.length) {
      await tx
        .update(events)
        .set({ status: "RESOLVED", updatedAt: new Date() })
        .where(
          inArray(
            events.id,
            choices.map(({ choice }) => choice.eventId),
          ),
        );
    }
    await tx
      .update(turns)
      .set({
        status: "PUBLISHED",
        stepCompletedAt: { ...turn.stepCompletedAt, PUBLISHED: new Date().toISOString() },
        updatedAt: new Date(),
      })
      .where(and(eq(turns.id, turn.id), eq(turns.status, "REVIEW")));

    const next = await tx.query.turns.findFirst({
      where: and(eq(turns.campaignId, campaign.id), eq(turns.sequence, turn.sequence + 1)),
    });
    if (!next) {
      const start = new Date(`${turn.gameDateEnd}T00:00:00.000Z`);
      start.setUTCDate(start.getUTCDate() + 1);
      const end = addGameDuration(
        start,
        campaign.adjudicationIntervalValue,
        campaign.adjudicationIntervalUnit,
      );
      end.setUTCDate(end.getUTCDate() - 1);
      const realDayInterval = adjudicationRealDayInterval(
        campaign.gameTimePerRealDayValue,
        campaign.adjudicationIntervalValue,
        campaign.gameTimePerRealDayUnit,
        campaign.adjudicationIntervalUnit,
      );
      await tx.insert(turns).values({
        campaignId: campaign.id,
        sequence: turn.sequence + 1,
        gameDateStart: dateOnly(start),
        gameDateEnd: dateOnly(end),
        status: "DRAFT",
        deadlineAt: turn.deadlineAt
          ? advanceTurnDeadline(turn.deadlineAt, realDayInterval)
          : nextTurnDeadline(
              new Date(),
              realDayInterval,
              campaign.turnCloseHour,
              campaign.turnCloseMinute,
            ),
      });
    }
    const members = await tx.query.campaignMemberships.findMany({
      where: and(
        eq(campaignMemberships.campaignId, campaign.id),
        eq(campaignMemberships.status, "ACTIVE"),
      ),
    });
    if (members.length) {
      await tx.insert(notifications).values(
        members.map((member) => ({
          userId: member.userId,
          campaignId: campaign.id,
          type: "TURN_PUBLISHED",
          title: `T${turn.sequence} 공개 완료`,
          body: "새 사건과 승인 효과가 국가 원장에 반영되었습니다.",
          href: "/dashboard",
        })),
      );
    }
    await tx.insert(auditLogs).values({
      campaignId: campaign.id,
      actorId,
      action: "PUBLISH_TURN",
      targetType: "TURN",
      targetId: turn.id,
      beforeSummary: { status: "REVIEW" },
      afterSummary: { status: "PUBLISHED", effects: approvedEffects.length },
      reason: `T${turn.sequence} 최종 공개`,
    });
  });
  await sqlClient.notify("notification_events", JSON.stringify({ campaignId: campaign.id }));
}
