import { and, desc, eq, inArray } from "drizzle-orm";
import { publishTurnCore } from "@/src/actions/turn";
import { db } from "@/src/db";
import {
  auditLogs,
  campaignMemberships,
  campaigns,
  countries,
  effectProposals,
  eventChoices,
  eventOptions,
  events,
  jobs,
  judgmentProposals,
  oppositionActions,
  submissions,
  turnStepRuns,
  turns,
} from "@/src/db/schema";
import { validateEffect, validateEffects } from "@/src/domain/effects/registry";
import {
  adjudicationRealDayInterval,
  judgmentEndsAt,
  nextTurnDeadline,
} from "@/src/domain/turn/schedule";
import { turnStepKey } from "@/src/domain/turn/state-machine";
import { enqueueAiStage, enqueueJob } from "@/src/services/job-runner";

type Campaign = typeof campaigns.$inferSelect;
type Turn = typeof turns.$inferSelect;

async function systemActorId(campaignId: string) {
  const membership = await db.query.campaignMemberships.findFirst({
    where: and(
      eq(campaignMemberships.campaignId, campaignId),
      eq(campaignMemberships.role, "ADMIN"),
      eq(campaignMemberships.status, "ACTIVE"),
    ),
    orderBy: [campaignMemberships.createdAt],
  });
  if (!membership) throw new Error("자동 턴 처리를 기록할 관리자 계정이 없습니다.");
  return membership.userId;
}

async function operationalCountries(campaignId: string) {
  return db.query.countries.findMany({
    where: and(eq(countries.campaignId, campaignId), eq(countries.setupStatus, "APPROVED")),
  });
}

async function enqueueCalculationStage(campaign: Campaign, turn: Turn, actorId: string) {
  const countryRows = await operationalCountries(campaign.id);
  await db.transaction(async (tx) => {
    const now = new Date();
    await tx
      .update(submissions)
      .set({ status: "LOCKED", lockedAt: now, updatedAt: now })
      .where(and(eq(submissions.turnId, turn.id), eq(submissions.status, "SUBMITTED")));
    await tx
      .update(turns)
      .set({
        status: "CALCULATING",
        error: null,
        stepCompletedAt: { ...turn.stepCompletedAt, LOCKED: now.toISOString() },
        updatedAt: now,
      })
      .where(and(eq(turns.id, turn.id), inArray(turns.status, ["DRAFT", "LOCKED"])));
    await tx
      .insert(turnStepRuns)
      .values({
        campaignId: campaign.id,
        turnId: turn.id,
        step: "LOCK",
        idempotencyKey: turnStepKey(campaign.id, turn.id, "LOCK"),
        status: "SUCCEEDED",
        result: { lockedAt: now.toISOString(), automatic: true },
        completedAt: now,
      })
      .onConflictDoNothing({ target: turnStepRuns.idempotencyKey });
    await tx
      .insert(turnStepRuns)
      .values({
        campaignId: campaign.id,
        turnId: turn.id,
        step: "CALCULATING",
        idempotencyKey: turnStepKey(campaign.id, turn.id, "CALCULATING"),
        status: "RUNNING",
      })
      .onConflictDoNothing({ target: turnStepRuns.idempotencyKey });
    await tx.insert(auditLogs).values({
      campaignId: campaign.id,
      actorId,
      action: "AUTO_CLOSE_TURN",
      targetType: "TURN",
      targetId: turn.id,
      beforeSummary: { status: turn.status },
      afterSummary: { status: "CALCULATING", countries: countryRows.length },
      reason: `T${turn.sequence} ${String(campaign.turnCloseHour).padStart(2, "0")}:${String(campaign.turnCloseMinute).padStart(2, "0")} 자동 마감`,
    });
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
}

async function calculationStageSettled(campaignId: string, turnId: string) {
  const countryRows = await operationalCountries(campaignId);
  const expected = new Set(
    countryRows.flatMap((country) => [
      `${campaignId}:${turnId}:CALCULATE_COUNTRY_ECONOMY:${country.id}`,
      `${campaignId}:${turnId}:CALCULATE_COUNTRY_RESEARCH:${country.id}`,
    ]),
  );
  if (!expected.size) return true;
  const rows = await db.query.jobs.findMany({
    where: and(
      eq(jobs.turnId, turnId),
      inArray(jobs.type, ["CALCULATE_COUNTRY_ECONOMY", "CALCULATE_COUNTRY_RESEARCH"]),
    ),
  });
  return [...expected].every((key) =>
    rows.some((job) => job.idempotencyKey === key && job.status === "SUCCEEDED"),
  );
}

async function startAiStage(campaign: Campaign, turn: Turn) {
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(turns)
      .set({
        status: "AI_RUNNING",
        stepCompletedAt: { ...turn.stepCompletedAt, CALCULATING: now.toISOString() },
        updatedAt: now,
      })
      .where(and(eq(turns.id, turn.id), eq(turns.status, "CALCULATING")));
    await tx
      .update(turnStepRuns)
      .set({ status: "SUCCEEDED", completedAt: now })
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
}

async function autoReviewOpposition(turnId: string, actorId: string) {
  const rows = await db.query.oppositionActions.findMany({
    where: and(
      eq(oppositionActions.turnId, turnId),
      eq(oppositionActions.status, "PENDING_REVIEW"),
    ),
  });
  for (const action of rows) {
    const country = await db.query.countries.findFirst({
      where: eq(countries.id, action.countryId),
    });
    if (!country) continue;
    const invalid = validateEffects(action.effects).find((item) => !item.valid);
    await db.transaction(async (tx) => {
      let eventId: string | null = null;
      if (!invalid) {
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
            eventId,
            order: 1,
            label: "공개 청문과 자료 제출 수용",
            description: "야당 요구를 제도권 검증 절차로 흡수합니다.",
            expectedEffect: "단기 정치 비용, 장기 투명성 개선 가능",
            effects: action.effects,
          },
          {
            eventId,
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
          status: invalid ? "REJECTED" : "APPROVED",
          eventId,
          reviewedBy: actorId,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(oppositionActions.id, action.id));
    });
  }
}

async function autoReviewTurn(campaign: Campaign, turn: Turn, actorId: string) {
  const proposals = await db.query.judgmentProposals.findMany({
    where: and(eq(judgmentProposals.turnId, turn.id), eq(judgmentProposals.status, "PENDING")),
  });
  await db.transaction(async (tx) => {
    for (const proposal of proposals) {
      const effects = await tx.query.effectProposals.findMany({
        where: eq(effectProposals.judgmentProposalId, proposal.id),
      });
      const valid =
        proposal.verdict !== "NEEDS_ADMIN" &&
        effects.every(
          (effect) =>
            validateEffect({
              targetType: effect.targetType,
              targetId: effect.targetId,
              metric: effect.metric,
              operation: effect.operation,
              value: effect.value,
              durationTurns: effect.durationTurns,
              reason: effect.reason,
            }).valid,
        );
      if (effects.length) {
        await tx
          .update(effectProposals)
          .set({ status: valid ? "APPROVED" : "REJECTED", updatedAt: new Date() })
          .where(eq(effectProposals.judgmentProposalId, proposal.id));
      }
      await tx
        .update(judgmentProposals)
        .set({
          status: valid ? "APPROVED" : "REJECTED",
          reviewedBy: actorId,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(judgmentProposals.id, proposal.id));
      if (proposal.submissionId) {
        await tx
          .update(submissions)
          .set({ status: valid ? "APPROVED" : "REJECTED", updatedAt: new Date() })
          .where(eq(submissions.id, proposal.submissionId));
      }
    }
    await tx
      .update(events)
      .set({ status: "PUBLISHED", publishedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(events.startTurnId, turn.id), eq(events.status, "REVIEW")));
  });
  await autoReviewOpposition(turn.id, actorId);

  const requiredEvents = await db.query.events.findMany({
    where: and(
      eq(events.campaignId, campaign.id),
      eq(events.status, "PUBLISHED"),
      eq(events.required, true),
    ),
  });
  for (const event of requiredEvents) {
    if (
      event.startTurnId === turn.id &&
      ["AUTO_TURN", "OPPOSITION_ACTION"].includes(event.sourceType)
    ) {
      continue;
    }
    const existing = await db.query.eventChoices.findFirst({
      where: eq(eventChoices.eventId, event.id),
    });
    if (existing || !event.countryId) continue;
    const option = await db.query.eventOptions.findFirst({
      where: eq(eventOptions.eventId, event.id),
      orderBy: [eventOptions.order],
    });
    if (option) {
      await db
        .insert(eventChoices)
        .values({
          eventId: event.id,
          optionId: option.id,
          countryId: event.countryId,
          userId: actorId,
        })
        .onConflictDoNothing({ target: [eventChoices.eventId, eventChoices.countryId] });
    }
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(turns)
      .set({
        status: "REVIEW",
        stepCompletedAt: { ...turn.stepCompletedAt, AI_RUNNING: now.toISOString() },
        updatedAt: now,
      })
      .where(and(eq(turns.id, turn.id), inArray(turns.status, ["AI_RUNNING", "REVIEW"])));
    await tx
      .update(turnStepRuns)
      .set({ status: "SUCCEEDED", completedAt: now })
      .where(eq(turnStepRuns.idempotencyKey, turnStepKey(campaign.id, turn.id, "AI_RUNNING")));
    await tx.insert(auditLogs).values({
      campaignId: campaign.id,
      actorId,
      action: "AUTO_REVIEW_TURN",
      targetType: "TURN",
      targetId: turn.id,
      beforeSummary: { judgments: proposals.length },
      afterSummary: { status: "REVIEW" },
      reason: "10분 자동 판정 종료",
    });
  });
}

async function aiJobsSettled(turnId: string) {
  const rows = await db.query.jobs.findMany({ where: eq(jobs.turnId, turnId) });
  return {
    settled: rows.every((job) => job.status === "SUCCEEDED"),
    failed: rows.some((job) => job.status === "FAILED"),
  };
}

async function tickCampaign(campaign: Campaign, now: Date) {
  let turn = await db.query.turns.findFirst({
    where: eq(turns.campaignId, campaign.id),
    orderBy: [desc(turns.sequence)],
  });
  if (!turn || turn.status === "PUBLISHED") return;
  let deadline = turn.deadlineAt;
  if (!deadline) {
    deadline = nextTurnDeadline(
      now,
      adjudicationRealDayInterval(
        campaign.gameTimePerRealDayValue,
        campaign.adjudicationIntervalValue,
        campaign.gameTimePerRealDayUnit,
        campaign.adjudicationIntervalUnit,
      ),
      campaign.turnCloseHour,
      campaign.turnCloseMinute,
    );
    await db
      .update(turns)
      .set({ deadlineAt: deadline, updatedAt: now })
      .where(eq(turns.id, turn.id));
    turn = { ...turn, deadlineAt: deadline };
  }
  const actorId = await systemActorId(campaign.id);

  if ((turn.status === "DRAFT" && now >= deadline) || turn.status === "LOCKED") {
    await enqueueCalculationStage(campaign, turn, actorId);
    return;
  }
  if (turn.status === "CALCULATING") {
    if (await calculationStageSettled(campaign.id, turn.id)) await startAiStage(campaign, turn);
    return;
  }
  if (turn.status === "AI_RUNNING") {
    if (now < judgmentEndsAt(deadline)) return;
    const jobsState = await aiJobsSettled(turn.id);
    if (!jobsState.settled) {
      if (jobsState.failed) {
        await db
          .update(turns)
          .set({ status: "FAILED", error: "자동 판정 작업이 최종 실패했습니다.", updatedAt: now })
          .where(eq(turns.id, turn.id));
      }
      return;
    }
    await autoReviewTurn(campaign, turn, actorId);
    const reviewTurn = await db.query.turns.findFirst({ where: eq(turns.id, turn.id) });
    if (reviewTurn) await publishTurnCore(campaign, reviewTurn, actorId);
    return;
  }
  if (turn.status === "REVIEW" && now >= judgmentEndsAt(deadline)) {
    await autoReviewTurn(campaign, turn, actorId);
    const reviewTurn = await db.query.turns.findFirst({ where: eq(turns.id, turn.id) });
    if (reviewTurn) await publishTurnCore(campaign, reviewTurn, actorId);
  }
}

export async function runScheduledTurnTick(now = new Date()) {
  const activeCampaigns = await db.query.campaigns.findMany({
    where: eq(campaigns.isActive, true),
  });
  for (const campaign of activeCampaigns) await tickCampaign(campaign, now);
}
