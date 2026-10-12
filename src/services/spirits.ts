import { and, asc, eq, lte } from "drizzle-orm";
import { db } from "@/src/db";
import { auditLogs, countrySpirits } from "@/src/db/schema";
import {
  combineSpiritEffects,
  customSpiritSchema,
  describeSpiritEffects,
  parseSpiritEffects,
  requireSpiritTemplate,
  spiritEndDate,
  spiritTemplate,
  type CustomSpirit,
  type SpiritCategory,
  type SpiritChange,
  type SpiritSource,
} from "@/src/domain/spirits/model";
import { mechanicStage } from "@/src/domain/world/mechanics";
import { ensureWorldMechanics } from "./world-mechanics";

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | DatabaseTransaction;
type Reader = Pick<typeof db, "select">;

const DAY_MS = 86_400_000;

/** 턴이 끝난 다음 날(다음 턴 시작일) */
export function dayAfter(gameDate: string) {
  return new Date(Date.parse(`${gameDate}T00:00:00.000Z`) + DAY_MS).toISOString().slice(0, 10);
}

export type SpiritGrant = {
  campaignId: string;
  countryId: string;
  /** 효과가 처음 적용되는 게임 날짜 */
  startsOn: string;
  startTurnId: string | null;
  /** 템플릿 키 또는 직접 만든 국가정신 */
  spirit: { templateKey: string } | { custom: CustomSpirit };
  /** undefined면 템플릿 기본 기간, null이면 뗄 때까지 */
  durationMonths?: number | null;
  sourceType: SpiritSource;
  sourceId?: string | null;
  createdBy?: string | null;
};

function resolveSpirit(grant: SpiritGrant) {
  if ("templateKey" in grant.spirit) {
    const template = requireSpiritTemplate(grant.spirit.templateKey);
    return {
      key: template.key,
      name: template.name,
      description: template.description,
      category: template.category as SpiritCategory,
      effects: template.effects,
      durationMonths:
        grant.durationMonths === undefined ? template.defaultDurationMonths : grant.durationMonths,
    };
  }
  const custom = customSpiritSchema.parse(grant.spirit.custom);
  return {
    key: custom.key,
    name: custom.name,
    description: custom.description,
    category: custom.category,
    effects: custom.effects,
    durationMonths: grant.durationMonths ?? null,
  };
}

/**
 * 국가정신을 붙인다. 같은 키가 이미 붙어 있으면 효과와 기간을 새 값으로 바꾼다.
 */
export async function grantSpirit(executor: Executor, grant: SpiritGrant) {
  const spirit = resolveSpirit(grant);
  const endsOn = spiritEndDate(grant.startsOn, spirit.durationMonths ?? null);
  const now = new Date();
  const [existing] = await executor
    .select()
    .from(countrySpirits)
    .where(
      and(
        eq(countrySpirits.countryId, grant.countryId),
        eq(countrySpirits.spiritKey, spirit.key),
        eq(countrySpirits.status, "ACTIVE"),
      ),
    )
    .limit(1);
  if (existing) {
    const [updated] = await executor
      .update(countrySpirits)
      .set({
        name: spirit.name,
        description: spirit.description,
        category: spirit.category,
        effects: spirit.effects,
        endsOn,
        sourceType: grant.sourceType,
        sourceId: grant.sourceId ?? null,
        updatedAt: now,
      })
      .where(eq(countrySpirits.id, existing.id))
      .returning();
    return updated;
  }
  const [created] = await executor
    .insert(countrySpirits)
    .values({
      campaignId: grant.campaignId,
      countryId: grant.countryId,
      spiritKey: spirit.key,
      name: spirit.name,
      description: spirit.description,
      category: spirit.category,
      effects: spirit.effects,
      sourceType: grant.sourceType,
      sourceId: grant.sourceId ?? null,
      startTurnId: grant.startTurnId,
      startsOn: grant.startsOn,
      endsOn,
      createdBy: grant.createdBy ?? null,
    })
    .returning();
  return created;
}

export async function removeSpirit(
  executor: Executor,
  input: { countryId: string; spiritKey: string; turnId: string | null; reason: string },
) {
  const rows = await executor
    .update(countrySpirits)
    .set({
      status: "REMOVED",
      endedTurnId: input.turnId,
      endedReason: input.reason,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(countrySpirits.countryId, input.countryId),
        eq(countrySpirits.spiritKey, input.spiritKey),
        eq(countrySpirits.status, "ACTIVE"),
      ),
    )
    .returning({ id: countrySpirits.id });
  return rows.length > 0;
}

/** 턴 공개 때 기간이 끝난 국가정신을 내린다. */
export async function expireSpirits(
  tx: DatabaseTransaction,
  input: { campaignId: string; turn: { id: string; gameDateEnd: string } },
) {
  return tx
    .update(countrySpirits)
    .set({
      status: "EXPIRED",
      endedTurnId: input.turn.id,
      endedReason: "기간 만료",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(countrySpirits.campaignId, input.campaignId),
        eq(countrySpirits.status, "ACTIVE"),
        lte(countrySpirits.endsOn, input.turn.gameDateEnd),
      ),
    )
    .returning({ id: countrySpirits.id, countryId: countrySpirits.countryId });
}

/** 사건 선택지의 국가정신 변경을 반영한다. 효과는 다음 턴부터 적용된다. */
export async function applySpiritChanges(
  tx: DatabaseTransaction,
  input: {
    campaignId: string;
    countryId: string;
    turn: { id: string; gameDateEnd: string };
    changes: SpiritChange[];
    sourceType: SpiritSource;
    sourceId: string;
  },
) {
  for (const change of input.changes) {
    if (!spiritTemplate(change.templateKey)) continue;
    if (change.action === "REMOVE") {
      await removeSpirit(tx, {
        countryId: input.countryId,
        spiritKey: change.templateKey,
        turnId: input.turn.id,
        reason: "사건 선택",
      });
      continue;
    }
    await grantSpirit(tx, {
      campaignId: input.campaignId,
      countryId: input.countryId,
      startsOn: dayAfter(input.turn.gameDateEnd),
      startTurnId: input.turn.id,
      spirit: { templateKey: change.templateKey },
      durationMonths: change.durationMonths ?? undefined,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
    });
  }
}

/**
 * 계산 시점에 효과가 걸리는 국가정신. 시작일이 이번 턴 끝 이전인 활성 국가정신만 센다.
 */
export async function activeCountrySpirits(
  reader: Reader,
  countryId: string,
  asOfGameDate?: string,
) {
  const rows = await reader
    .select()
    .from(countrySpirits)
    .where(and(eq(countrySpirits.countryId, countryId), eq(countrySpirits.status, "ACTIVE")))
    .orderBy(asc(countrySpirits.createdAt));
  return rows.filter((row) => !asOfGameDate || row.startsOn <= asOfGameDate);
}

export async function countrySpiritEffects(
  reader: Reader,
  countryId: string,
  asOfGameDate?: string,
) {
  const spirits = await activeCountrySpirits(reader, countryId, asOfGameDate);
  const parsed = spirits.map((spirit) => ({ spirit, effects: parseSpiritEffects(spirit.effects) }));
  return {
    spirits: parsed,
    combined: combineSpiritEffects(parsed.map(({ effects }) => effects)),
  };
}

/** 정치 화면의 국가정신 패널: 세계 공통 국가정신과 국가 국가정신을 함께 보여 준다. */
export async function getSpiritPanel(input: {
  campaignId: string;
  countryId: string;
  currentGameDate: string | null;
}) {
  const [{ spirits }, worldStates] = await Promise.all([
    countrySpiritEffects(db, input.countryId),
    ensureWorldMechanics(db, input.campaignId),
  ]);
  return {
    world: worldStates.map(({ definition, progress }) => {
      const stage = mechanicStage(definition, progress);
      const lines = [
        ...describeSpiritEffects(
          parseSpiritEffects({
            drift: stage.drift,
            potentialGrowth: stage.potentialGrowth ? Number(stage.potentialGrowth) : undefined,
            naturalUnemployment: stage.naturalUnemployment
              ? Number(stage.naturalUnemployment)
              : undefined,
            inflationPressure: stage.inflationPressure
              ? Number(stage.inflationPressure)
              : undefined,
            revenueEfficiency: stage.revenueEfficiency
              ? Number(stage.revenueEfficiency)
              : undefined,
          }),
        ),
      ];
      return {
        key: `world:${definition.key}`,
        name: `${definition.spiritLabel} · ${stage.label}`,
        description: stage.description,
        category: "WORLD" as const,
        sourceLabel: `${definition.label} 진행도 ${progress.toFixed(1)}`,
        effects: lines,
        endsOn: null,
        pending: false,
      };
    }),
    country: spirits.map(({ spirit, effects }) => ({
      key: spirit.spiritKey,
      id: spirit.id,
      name: spirit.name,
      description: spirit.description,
      category: spirit.category as SpiritCategory,
      sourceType: spirit.sourceType as SpiritSource,
      effects: describeSpiritEffects(effects),
      startsOn: spirit.startsOn,
      endsOn: spirit.endsOn,
      pending: input.currentGameDate !== null && spirit.startsOn > input.currentGameDate,
    })),
  };
}

export type SpiritPanel = Awaited<ReturnType<typeof getSpiritPanel>>;

/** 관리자: 국가정신 부여 */
export async function adminGrantSpirit(input: {
  actorId: string;
  campaignId: string;
  countryId: string;
  turn: { id: string; gameDateStart: string } | null;
  spirit: SpiritGrant["spirit"];
  durationMonths: number | null | undefined;
  reason: string;
}) {
  await db.transaction(async (tx) => {
    const startsOn = input.turn?.gameDateStart ?? new Date().toISOString().slice(0, 10);
    const row = await grantSpirit(tx, {
      campaignId: input.campaignId,
      countryId: input.countryId,
      startsOn,
      startTurnId: input.turn?.id ?? null,
      spirit: input.spirit,
      durationMonths: input.durationMonths,
      sourceType: "ADMIN",
      createdBy: input.actorId,
    });
    await tx.insert(auditLogs).values({
      campaignId: input.campaignId,
      actorId: input.actorId,
      action: "GRANT_NATIONAL_SPIRIT",
      targetType: "COUNTRY_SPIRIT",
      targetId: row.id,
      afterSummary: {
        countryId: input.countryId,
        spiritKey: row.spiritKey,
        startsOn: row.startsOn,
        endsOn: row.endsOn,
        effects: row.effects,
      },
      reason: input.reason,
    });
  });
}

export async function adminRemoveSpirit(input: {
  actorId: string;
  campaignId: string;
  countryId: string;
  spiritKey: string;
  turnId: string | null;
  reason: string;
}) {
  await db.transaction(async (tx) => {
    const removed = await removeSpirit(tx, {
      countryId: input.countryId,
      spiritKey: input.spiritKey,
      turnId: input.turnId,
      reason: input.reason,
    });
    if (!removed) throw new Error("뗄 수 있는 국가정신이 없습니다.");
    await tx.insert(auditLogs).values({
      campaignId: input.campaignId,
      actorId: input.actorId,
      action: "REMOVE_NATIONAL_SPIRIT",
      targetType: "COUNTRY",
      targetId: input.countryId,
      afterSummary: { spiritKey: input.spiritKey },
      reason: input.reason,
    });
  });
}

/** 계산 근거에서 국가정신의 정치력 수입 보정을 읽는다. */
export function spiritIncomeFromEvidence(evidence: unknown) {
  const systems = (evidence as { politicalSystems?: Record<string, unknown> } | null)
    ?.politicalSystems;
  const spirits = systems?.spirits as
    | {
        politicalPowerIncome?: number;
        list?: Array<{ name: string; politicalPowerIncome?: number }>;
      }
    | null
    | undefined;
  return {
    income: Number(spirits?.politicalPowerIncome ?? 0) || 0,
    items: (spirits?.list ?? [])
      .filter((item) => item.politicalPowerIncome)
      .map((item) => ({ label: item.name, income: Number(item.politicalPowerIncome) })),
  };
}
