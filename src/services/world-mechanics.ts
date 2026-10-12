import Decimal from "decimal.js";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/src/db";
import {
  auditLogs,
  campaigns,
  countries,
  countryPoliticalResources,
  countryResearch,
  techNodes,
  turns,
  worldMechanicActions,
  worldMechanicHistory,
  worldMechanics,
} from "@/src/db/schema";
import { turnPeriod, monthsAfterTurnEnd } from "@/src/domain/turn/period";
import {
  advanceWorldMechanic,
  evaluateWorldAction,
  mechanicStage,
  requireWorldMechanic,
  WORLD_MECHANICS,
  worldMechanicAction,
  worldMechanicDefinition,
  worldStageEffects,
  type WorldMechanicDefinition,
} from "@/src/domain/world/mechanics";
import { getPoliticalPowerState, lockAndAccruePoliticalPower } from "./political-power";

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | DatabaseTransaction;
type Reader = Pick<typeof db, "select">;
type Campaign = typeof campaigns.$inferSelect;
type Turn = typeof turns.$inferSelect;
type Country = typeof countries.$inferSelect;

/** 캠페인에 정의된 모든 세계 메커니즘 행을 만들고 돌려준다. */
export async function ensureWorldMechanics(executor: Executor, campaignId: string) {
  await executor
    .insert(worldMechanics)
    .values(
      WORLD_MECHANICS.map((definition) => ({
        campaignId,
        mechanicKey: definition.key,
        progress: String(definition.initialProgress),
      })),
    )
    .onConflictDoNothing({ target: [worldMechanics.campaignId, worldMechanics.mechanicKey] });
  const rows = await executor
    .select()
    .from(worldMechanics)
    .where(eq(worldMechanics.campaignId, campaignId));
  return rows.flatMap((row) => {
    const definition = worldMechanicDefinition(row.mechanicKey);
    return definition ? [{ row, definition, progress: Number(row.progress) }] : [];
  });
}

/** 계산 단계에서 모든 국가에 거는 공통 국가정신 효과. */
export async function loadWorldEffects(executor: Executor, campaignId: string) {
  const states = await ensureWorldMechanics(executor, campaignId);
  return {
    effects: worldStageEffects(states),
    states: states.map(({ definition, progress }) => ({
      key: definition.key,
      progress,
      stage: mechanicStage(definition, progress).key,
    })),
  };
}

/** 이 턴에 주문된 세계 대응 행동의 특별 지출($1M) 합계. */
export async function pendingWorldSpending(reader: Reader, countryId: string, turnId: string) {
  const [row] = await reader
    .select({ total: sql<string>`coalesce(sum(${worldMechanicActions.budgetCost}), 0)::text` })
    .from(worldMechanicActions)
    .where(
      and(
        eq(worldMechanicActions.countryId, countryId),
        eq(worldMechanicActions.orderedTurnId, turnId),
        eq(worldMechanicActions.status, "PENDING"),
      ),
    );
  return new Decimal(row?.total ?? 0);
}

async function completedTechCodes(reader: Reader, countryId: string) {
  const rows = await reader
    .select({ code: techNodes.code })
    .from(countryResearch)
    .innerJoin(techNodes, eq(countryResearch.techNodeId, techNodes.id))
    .where(and(eq(countryResearch.countryId, countryId), eq(countryResearch.status, "COMPLETED")));
  return new Set(rows.map((row) => row.code));
}

async function techNameMap(reader: Reader, campaignId: string) {
  const codes = [
    ...new Set(
      WORLD_MECHANICS.flatMap((mechanic) => mechanic.actions).flatMap(
        (action) => action.requiredTechCodes,
      ),
    ),
  ];
  if (!codes.length) return new Map<string, string>();
  const rows = await reader
    .select({ code: techNodes.code, name: techNodes.name })
    .from(techNodes)
    .where(and(eq(techNodes.campaignId, campaignId), inArray(techNodes.code, codes)));
  return new Map(rows.map((row) => [row.code, row.name]));
}

/** 국가별 행동의 마지막 시행 턴 끝 날짜. key는 `${mechanicKey}:${actionKey}` */
async function lastAppliedActionEnds(reader: Reader, countryId: string) {
  const rows = await reader
    .select({
      mechanicKey: worldMechanicActions.mechanicKey,
      actionKey: worldMechanicActions.actionKey,
      gameDateEnd: sql<string>`max(${turns.gameDateEnd})::text`,
    })
    .from(worldMechanicActions)
    .innerJoin(turns, eq(worldMechanicActions.appliedTurnId, turns.id))
    .where(
      and(
        eq(worldMechanicActions.countryId, countryId),
        eq(worldMechanicActions.status, "APPLIED"),
      ),
    )
    .groupBy(worldMechanicActions.mechanicKey, worldMechanicActions.actionKey);
  return new Map(
    rows.map((row) => [`${row.mechanicKey}:${row.actionKey}`, String(row.gameDateEnd)]),
  );
}

function actionContext(input: {
  definition: WorldMechanicDefinition;
  actionKey: string;
  turn: Turn | null;
  balance: number;
  completed: ReadonlySet<string>;
  lastEnds: Map<string, string>;
  pendingKeys: ReadonlySet<string>;
  techNames: ReadonlyMap<string, string>;
}) {
  const key = `${input.definition.key}:${input.actionKey}`;
  const lastEnd = input.lastEnds.get(key);
  return {
    turnOpen: input.turn?.status === "DRAFT",
    balance: input.balance,
    completedTechCodes: input.completed,
    monthsSinceLastUse:
      lastEnd === undefined || !input.turn
        ? null
        : monthsAfterTurnEnd(lastEnd, input.turn.gameDateStart),
    hasPendingOrder: input.pendingKeys.has(key),
    techNames: input.techNames,
  };
}

export async function orderWorldMechanicAction(input: {
  userId: string;
  campaign: Campaign;
  country: Country;
  turn: Turn;
  mechanicKey: string;
  actionKey: string;
}) {
  const definition = requireWorldMechanic(input.mechanicKey);
  const action = worldMechanicAction(definition, input.actionKey);
  if (!action) throw new Error("등록되지 않은 대응 행동입니다.");
  const now = new Date();
  return db.transaction(async (tx) => {
    const resource = await lockAndAccruePoliticalPower(tx, input.country.id, input.campaign, now);
    const [completed, lastEnds, pending, techNames] = await Promise.all([
      completedTechCodes(tx, input.country.id),
      lastAppliedActionEnds(tx, input.country.id),
      tx
        .select({
          mechanicKey: worldMechanicActions.mechanicKey,
          actionKey: worldMechanicActions.actionKey,
        })
        .from(worldMechanicActions)
        .where(
          and(
            eq(worldMechanicActions.countryId, input.country.id),
            eq(worldMechanicActions.status, "PENDING"),
          ),
        ),
      techNameMap(tx, input.campaign.id),
    ]);
    const evaluation = evaluateWorldAction(
      action,
      actionContext({
        definition,
        actionKey: action.key,
        turn: input.turn,
        balance: Number(resource.balance),
        completed,
        lastEnds,
        pendingKeys: new Set(pending.map((row) => `${row.mechanicKey}:${row.actionKey}`)),
        techNames,
      }),
    );
    if (!evaluation.allowed)
      throw new Error(evaluation.reason ?? "대응 행동을 시행할 수 없습니다.");
    const nextBalance = new Decimal(resource.balance)
      .minus(action.politicalPowerCost)
      .toDecimalPlaces(4);
    await tx
      .update(countryPoliticalResources)
      .set({ balance: nextBalance.toString(), updatedAt: now })
      .where(eq(countryPoliticalResources.id, resource.id));
    const [order] = await tx
      .insert(worldMechanicActions)
      .values({
        campaignId: input.campaign.id,
        mechanicKey: definition.key,
        actionKey: action.key,
        countryId: input.country.id,
        orderedBy: input.userId,
        orderedTurnId: input.turn.id,
        politicalPowerCost: String(action.politicalPowerCost),
        budgetCost: String(action.budgetCost),
        reduction: String(action.reduction),
      })
      .returning();
    await tx.insert(auditLogs).values({
      campaignId: input.campaign.id,
      actorId: input.userId,
      action: "ORDER_WORLD_MECHANIC_ACTION",
      targetType: "WORLD_MECHANIC_ACTION",
      targetId: order.id,
      beforeSummary: { balance: resource.balance },
      afterSummary: {
        mechanicKey: definition.key,
        actionKey: action.key,
        politicalPowerCost: action.politicalPowerCost,
        budgetCost: action.budgetCost,
        reduction: action.reduction,
        balance: nextBalance.toString(),
      },
      reason: `${definition.label} 대응: ${action.label}`,
    });
    return order;
  });
}

export async function cancelWorldMechanicAction(input: {
  userId: string;
  campaign: Campaign;
  country: Country;
  turn: Turn;
  actionId: string;
}) {
  if (input.turn.status !== "DRAFT") throw new Error("턴이 열려 있을 때만 취소할 수 있습니다.");
  const now = new Date();
  await db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(worldMechanicActions)
      .where(
        and(
          eq(worldMechanicActions.id, input.actionId),
          eq(worldMechanicActions.countryId, input.country.id),
          eq(worldMechanicActions.status, "PENDING"),
        ),
      )
      .limit(1)
      .for("update");
    if (!order) throw new Error("취소할 수 있는 대응 행동이 없습니다.");
    if (order.orderedTurnId !== input.turn.id) {
      throw new Error("이번 턴에 주문한 행동만 취소할 수 있습니다.");
    }
    const resource = await lockAndAccruePoliticalPower(tx, input.country.id, input.campaign, now);
    const refunded = new Decimal(resource.balance)
      .plus(order.politicalPowerCost)
      .toDecimalPlaces(4);
    await tx
      .update(countryPoliticalResources)
      .set({ balance: refunded.toString(), updatedAt: now })
      .where(eq(countryPoliticalResources.id, resource.id));
    await tx
      .update(worldMechanicActions)
      .set({ status: "CANCELLED", updatedAt: now })
      .where(eq(worldMechanicActions.id, order.id));
    await tx.insert(auditLogs).values({
      campaignId: input.campaign.id,
      actorId: input.userId,
      action: "CANCEL_WORLD_MECHANIC_ACTION",
      targetType: "WORLD_MECHANIC_ACTION",
      targetId: order.id,
      beforeSummary: { status: "PENDING", balance: resource.balance },
      afterSummary: { status: "CANCELLED", refund: order.politicalPowerCost, balance: refunded },
      reason: "시행 전 취소",
    });
  });
}

/**
 * 턴 공개 트랜잭션 안에서 세계 메커니즘을 한 턴 진행한다.
 * 이번 턴에 주문된 대응 행동을 반영하고 기록을 남긴다. 같은 턴을 두 번 정산하지 않는다.
 */
export async function settleWorldMechanics(
  tx: DatabaseTransaction,
  input: { campaign: Campaign; turn: Turn; now: Date },
) {
  const states = await ensureWorldMechanics(tx, input.campaign.id);
  const years = turnPeriod(input.turn.gameDateStart, input.turn.gameDateEnd).years;
  const results: Array<{ key: string; before: number; after: number; stage: string }> = [];
  for (const { row, definition } of states) {
    const [locked] = await tx
      .select()
      .from(worldMechanics)
      .where(eq(worldMechanics.id, row.id))
      .limit(1)
      .for("update");
    if (!locked) continue;
    const [history] = await tx
      .select({ id: worldMechanicHistory.id })
      .from(worldMechanicHistory)
      .where(
        and(
          eq(worldMechanicHistory.mechanicId, locked.id),
          eq(worldMechanicHistory.turnId, input.turn.id),
        ),
      )
      .limit(1);
    if (history) continue;
    const orders = await tx
      .select()
      .from(worldMechanicActions)
      .where(
        and(
          eq(worldMechanicActions.campaignId, input.campaign.id),
          eq(worldMechanicActions.mechanicKey, definition.key),
          eq(worldMechanicActions.orderedTurnId, input.turn.id),
          eq(worldMechanicActions.status, "PENDING"),
        ),
      );
    const requested = orders.reduce((total, order) => total + Number(order.reduction), 0);
    const step = advanceWorldMechanic(definition, {
      progress: Number(locked.progress),
      years,
      reductions: requested,
    });
    await tx
      .update(worldMechanics)
      .set({ progress: String(step.after), updatedTurnId: input.turn.id, updatedAt: input.now })
      .where(eq(worldMechanics.id, locked.id));
    await tx.insert(worldMechanicHistory).values({
      mechanicId: locked.id,
      turnId: input.turn.id,
      progressBefore: String(step.before),
      progressAfter: String(step.after),
      naturalGrowth: String(step.natural),
      reduction: String(step.reduction),
      stage: step.stage.key,
      detail: {
        years,
        requestedReduction: requested,
        locked: step.locked,
        orders: orders.map((order) => ({
          id: order.id,
          countryId: order.countryId,
          actionKey: order.actionKey,
          reduction: order.reduction,
        })),
      },
    });
    if (orders.length) {
      await tx
        .update(worldMechanicActions)
        .set({ status: "APPLIED", appliedTurnId: input.turn.id, updatedAt: input.now })
        .where(
          inArray(
            worldMechanicActions.id,
            orders.map((order) => order.id),
          ),
        );
    }
    results.push({
      key: definition.key,
      before: step.before,
      after: step.after,
      stage: step.stage.key,
    });
  }
  return results;
}

export async function adminSetWorldMechanicProgress(input: {
  actorId: string;
  campaignId: string;
  mechanicKey: string;
  progress: number;
  reason: string;
}) {
  const definition = requireWorldMechanic(input.mechanicKey);
  if (
    !Number.isFinite(input.progress) ||
    input.progress < definition.min ||
    input.progress > definition.max
  ) {
    throw new Error(`진행도는 ${definition.min}~${definition.max} 사이여야 합니다.`);
  }
  await db.transaction(async (tx) => {
    await ensureWorldMechanics(tx, input.campaignId);
    const [row] = await tx
      .select()
      .from(worldMechanics)
      .where(
        and(
          eq(worldMechanics.campaignId, input.campaignId),
          eq(worldMechanics.mechanicKey, definition.key),
        ),
      )
      .limit(1)
      .for("update");
    if (!row) throw new Error("세계 메커니즘을 찾을 수 없습니다.");
    await tx
      .update(worldMechanics)
      .set({ progress: String(input.progress), updatedAt: new Date() })
      .where(eq(worldMechanics.id, row.id));
    await tx.insert(auditLogs).values({
      campaignId: input.campaignId,
      actorId: input.actorId,
      action: "SET_WORLD_MECHANIC_PROGRESS",
      targetType: "WORLD_MECHANIC",
      targetId: row.id,
      beforeSummary: { mechanicKey: definition.key, progress: row.progress },
      afterSummary: { mechanicKey: definition.key, progress: input.progress },
      reason: input.reason,
    });
  });
}

/** 세계 정세 화면 데이터. 국가가 없으면(관리자·관전) 행동 목록 없이 상태만 돌려준다. */
export async function getWorldMechanicBoard(input: {
  campaign: Campaign;
  country: Country | null;
  turn: Turn | null;
}) {
  const states = await ensureWorldMechanics(db, input.campaign.id);
  const country = input.country;
  const [historyRows, power, completed, lastEnds, pendingOrders, techNames, turnOrders] =
    await Promise.all([
      db
        .select({ history: worldMechanicHistory, sequence: turns.sequence })
        .from(worldMechanicHistory)
        .innerJoin(turns, eq(worldMechanicHistory.turnId, turns.id))
        .where(
          inArray(
            worldMechanicHistory.mechanicId,
            states.map(({ row }) => row.id),
          ),
        )
        .orderBy(desc(turns.sequence))
        .limit(12 * Math.max(1, states.length)),
      country ? getPoliticalPowerState(country.id, input.campaign) : null,
      country ? completedTechCodes(db, country.id) : new Set<string>(),
      country ? lastAppliedActionEnds(db, country.id) : new Map<string, string>(),
      country
        ? db
            .select()
            .from(worldMechanicActions)
            .where(
              and(
                eq(worldMechanicActions.countryId, country.id),
                eq(worldMechanicActions.status, "PENDING"),
              ),
            )
        : [],
      techNameMap(db, input.campaign.id),
      input.turn
        ? db
            .select({
              mechanicKey: worldMechanicActions.mechanicKey,
              count: sql<number>`count(*)::int`,
              reduction: sql<string>`coalesce(sum(${worldMechanicActions.reduction}), 0)::text`,
            })
            .from(worldMechanicActions)
            .where(
              and(
                eq(worldMechanicActions.orderedTurnId, input.turn.id),
                eq(worldMechanicActions.status, "PENDING"),
              ),
            )
            .groupBy(worldMechanicActions.mechanicKey)
        : [],
    ]);
  const pendingKeys = new Set(
    pendingOrders.map((order) => `${order.mechanicKey}:${order.actionKey}`),
  );
  const balance = power ? Number(power.balance) : 0;
  const years = input.turn
    ? turnPeriod(input.turn.gameDateStart, input.turn.gameDateEnd).years
    : 0.25;
  return {
    balance: power?.balance ?? null,
    mechanics: states.map(({ row, definition, progress }) => {
      const stage = mechanicStage(definition, progress);
      const projection = advanceWorldMechanic(definition, { progress, years, reductions: 0 });
      const yearAhead = advanceWorldMechanic(definition, { progress, years: 1, reductions: 0 });
      const turnOrder = turnOrders.find((order) => order.mechanicKey === definition.key);
      return {
        definition,
        progress,
        stage,
        nextTurnNatural: projection.natural,
        nextYearProgress: yearAhead.after,
        pendingReductionThisTurn: Number(turnOrder?.reduction ?? 0),
        pendingOrdersThisTurn: Number(turnOrder?.count ?? 0),
        history: historyRows
          .filter(({ history }) => history.mechanicId === row.id)
          .slice(0, 12)
          .reverse()
          .map(({ history, sequence }) => ({
            sequence,
            before: Number(history.progressBefore),
            after: Number(history.progressAfter),
            natural: Number(history.naturalGrowth),
            reduction: Number(history.reduction),
            stage: history.stage,
          })),
        actions: definition.actions.map((action) => {
          const evaluation = country
            ? evaluateWorldAction(
                action,
                actionContext({
                  definition,
                  actionKey: action.key,
                  turn: input.turn,
                  balance,
                  completed,
                  lastEnds,
                  pendingKeys,
                  techNames,
                }),
              )
            : {
                allowed: false,
                reason: "국가를 운영할 때 시행할 수 있습니다.",
                missingTechCodes: [],
              };
          const pending = pendingOrders.find(
            (order) => order.mechanicKey === definition.key && order.actionKey === action.key,
          );
          return {
            action,
            allowed: evaluation.allowed,
            reason: evaluation.reason,
            requiredTechNames: action.requiredTechCodes.map((code) => techNames.get(code) ?? code),
            pending: pending
              ? { id: pending.id, cancellable: pending.orderedTurnId === input.turn?.id }
              : null,
          };
        }),
      };
    }),
  };
}

export type WorldMechanicBoard = Awaited<ReturnType<typeof getWorldMechanicBoard>>;
