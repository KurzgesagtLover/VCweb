import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getSession } from "@/src/auth/session";
import { db } from "@/src/db";
import {
  auditLogs,
  countries,
  countryRelations,
  diplomaticBlocMembers,
  diplomaticBlocs,
  turns,
} from "@/src/db/schema";
import { countryEntityTypeSchema } from "@/src/domain/country/entity-type";
import {
  diplomaticRelationStatusSchema,
  SYMMETRIC_DIPLOMATIC_STATUSES,
  type DiplomaticRelationStatus,
} from "@/src/domain/diplomacy/status";
import { rebuildAutomaticMapBorders } from "@/src/services/rebuild-automatic-map";

export const runtime = "nodejs";

const pairSchema = z.object({
  campaignId: z.string().uuid(),
  fromCountryId: z.string().uuid(),
  toCountryId: z.string().uuid(),
  status: diplomaticRelationStatusSchema,
  reason: z.string().trim().min(1).max(300).default("지도에서 외교 관계 변경"),
});

const mutualSchema = z.object({
  mode: z.enum(["MUTUAL_WAR", "MUTUAL_ALLIANCE"]),
  campaignId: z.string().uuid(),
  countryIds: z.array(z.string().uuid()).min(2).max(40),
  reason: z.string().trim().min(1).max(300).optional(),
});

const createBlocSchema = z.object({
  mode: z.literal("CREATE_BLOC"),
  campaignId: z.string().uuid(),
  countryIds: z.array(z.string().uuid()).min(2).max(40),
  leaderCountryId: z.string().uuid(),
  name: z.string().trim().min(2).max(80),
  acronym: z.string().trim().min(2).max(12),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  description: z.string().trim().max(500).default(""),
  reason: z.string().trim().min(1).max(300).default("지도에서 세력 창설"),
});

const countryActionSchema = z.object({
  mode: z.literal("COUNTRY_ACTION"),
  campaignId: z.string().uuid(),
  countryId: z.string().uuid(),
  action: z.enum([
    "END_WAR",
    "END_ALL_WARS",
    "TRUCE_ALL_WARS",
    "SET_STALEMATE",
    "SET_TRUCE",
    "END_ALLIANCE",
    "END_ALL_ALLIANCES",
  ]),
  counterpartId: z.string().uuid().optional(),
  reason: z.string().trim().min(1).max(300).optional(),
});

const WAR_RELATION_STATUSES = new Set<DiplomaticRelationStatus>(["WAR", "CIVIL_WAR"]);
const ALLIANCE_RELATION_STATUSES = new Set<DiplomaticRelationStatus>(["MUTUAL_DEFENSE"]);

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function upsert(
  tx: Tx,
  campaignId: string,
  fromCountryId: string,
  toCountryId: string,
  status: DiplomaticRelationStatus,
  reason: string,
) {
  await tx
    .insert(countryRelations)
    .values({
      campaignId,
      fromCountryId,
      toCountryId,
      status,
      lastInteraction: reason,
    })
    .onConflictDoUpdate({
      target: [
        countryRelations.campaignId,
        countryRelations.fromCountryId,
        countryRelations.toCountryId,
      ],
      set: { status, lastInteraction: reason, updatedAt: new Date() },
    });
}

async function setPairRelation(
  tx: Tx,
  campaignId: string,
  fromCountryId: string,
  toCountryId: string,
  status: DiplomaticRelationStatus,
  reason: string,
  actorId: string,
) {
  await upsert(tx, campaignId, fromCountryId, toCountryId, status, reason);
  if (SYMMETRIC_DIPLOMATIC_STATUSES.has(status) || status === "INDEPENDENCE_GUARANTEE") {
    await upsert(
      tx,
      campaignId,
      toCountryId,
      fromCountryId,
      status === "INDEPENDENCE_GUARANTEE" ? "NORMAL" : status,
      reason,
    );
  }
  await tx.insert(auditLogs).values({
    campaignId,
    actorId,
    action: "SET_DIPLOMATIC_STATUS",
    targetType: "COUNTRY_RELATION",
    targetId: `${fromCountryId}:${toCountryId}`,
    afterSummary: { status },
    reason,
  });
}

async function applyMutualStatus(
  campaignId: string,
  countryIds: string[],
  status: DiplomaticRelationStatus,
  reason: string,
  actorId: string,
  auditAction: string,
) {
  const uniqueIds = [...new Set(countryIds)];
  if (uniqueIds.length < 2) {
    return { error: "국가가 2개 이상 필요합니다.", status: 400 as const };
  }
  const countryRows = await db.query.countries.findMany({
    where: and(eq(countries.campaignId, campaignId), inArray(countries.id, uniqueIds)),
  });
  if (countryRows.length !== uniqueIds.length) {
    return { error: "국가를 찾을 수 없습니다.", status: 404 as const };
  }
  if (countryRows.some((country) => country.entityType === "GUERRILLA_GROUP")) {
    return {
      error: "게릴라 단체는 이 일괄 외교에 포함할 수 없습니다.",
      status: 400 as const,
    };
  }

  let pairCount = 0;
  await db.transaction(async (tx) => {
    for (let i = 0; i < uniqueIds.length; i += 1) {
      for (let j = i + 1; j < uniqueIds.length; j += 1) {
        await setPairRelation(
          tx,
          campaignId,
          uniqueIds[i]!,
          uniqueIds[j]!,
          status,
          reason,
          actorId,
        );
        pairCount += 1;
      }
    }
    await tx.insert(auditLogs).values({
      campaignId,
      actorId,
      action: auditAction,
      targetType: "COUNTRY_RELATION",
      targetId: uniqueIds.join(","),
      afterSummary: { status, countryIds: uniqueIds, pairs: pairCount },
      reason,
    });
  });
  await rebuildAutomaticMapBorders(campaignId, actorId);
  return { countryCount: uniqueIds.length, pairCount, status };
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.user.role !== "ADMIN") {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const body = await request.json();
  const mode =
    body && typeof body === "object" && "mode" in body ? String(body.mode) : "PAIR";

  if (mode === "MUTUAL_WAR" || mode === "MUTUAL_ALLIANCE") {
    const parsed = mutualSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: "입력값을 확인하세요." }, { status: 400 });
    const status = parsed.data.mode === "MUTUAL_WAR" ? "WAR" : "MUTUAL_DEFENSE";
    const reason =
      parsed.data.reason ??
      (parsed.data.mode === "MUTUAL_WAR" ? "지도에서 상호전쟁 선포" : "지도에서 상호동맹 체결");
    const result = await applyMutualStatus(
      parsed.data.campaignId,
      parsed.data.countryIds,
      status,
      reason,
      session.user.id,
      parsed.data.mode === "MUTUAL_WAR" ? "SET_MUTUAL_WAR" : "SET_MUTUAL_ALLIANCE",
    );
    if ("error" in result) {
      return Response.json({ error: result.error }, { status: result.status as 400 | 404 });
    }
    return Response.json(result);
  }

  if (mode === "COUNTRY_ACTION") {
    const parsed = countryActionSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: "입력값을 확인하세요." }, { status: 400 });
    const input = parsed.data;
    const defaultReasons: Record<typeof input.action, string> = {
      END_WAR: "지도에서 단일 전쟁 종료",
      END_ALL_WARS: "지도에서 모든 전쟁 종료",
      TRUCE_ALL_WARS: "지도에서 모든 전쟁 휴전",
      SET_STALEMATE: "지도에서 전쟁 교착",
      SET_TRUCE: "지도에서 전쟁 휴전",
      END_ALLIANCE: "지도에서 단일 동맹 종료",
      END_ALL_ALLIANCES: "지도에서 모든 동맹 종료",
    };
    const reason = input.reason ?? defaultReasons[input.action];
    const needsCounterpart = [
      "END_WAR",
      "SET_STALEMATE",
      "SET_TRUCE",
      "END_ALLIANCE",
    ].includes(input.action);
    if (needsCounterpart && !input.counterpartId) {
      return Response.json({ error: "상대 국가가 필요합니다." }, { status: 400 });
    }
    if (input.counterpartId && input.counterpartId === input.countryId) {
      return Response.json({ error: "같은 대상끼리는 관계를 설정할 수 없습니다." }, { status: 400 });
    }

    const countryExists = await db.query.countries.findFirst({
      where: and(eq(countries.campaignId, input.campaignId), eq(countries.id, input.countryId)),
      columns: { id: true },
    });
    if (!countryExists) {
      return Response.json({ error: "국가를 찾을 수 없습니다." }, { status: 404 });
    }

    const outgoing = await db.query.countryRelations.findMany({
      where: and(
        eq(countryRelations.campaignId, input.campaignId),
        eq(countryRelations.fromCountryId, input.countryId),
      ),
      columns: { toCountryId: true, status: true },
    });

    type PairUpdate = { toCountryId: string; status: DiplomaticRelationStatus };
    const updates: PairUpdate[] = [];

    if (input.action === "END_ALL_WARS") {
      for (const row of outgoing) {
        if (WAR_RELATION_STATUSES.has(row.status as DiplomaticRelationStatus)) {
          updates.push({ toCountryId: row.toCountryId, status: "NORMAL" });
        }
      }
    } else if (input.action === "TRUCE_ALL_WARS") {
      for (const row of outgoing) {
        const status = row.status as DiplomaticRelationStatus;
        if (WAR_RELATION_STATUSES.has(status) || status === "STALEMATE") {
          updates.push({ toCountryId: row.toCountryId, status: "TRUCE" });
        }
      }
    } else if (input.action === "END_ALL_ALLIANCES") {
      for (const row of outgoing) {
        if (ALLIANCE_RELATION_STATUSES.has(row.status as DiplomaticRelationStatus)) {
          updates.push({ toCountryId: row.toCountryId, status: "NORMAL" });
        }
      }
    } else {
      const counterpartId = input.counterpartId!;
      const current = outgoing.find((row) => row.toCountryId === counterpartId);
      const currentStatus = (current?.status ?? "NORMAL") as DiplomaticRelationStatus;
      if (input.action === "END_WAR") {
        if (
          !WAR_RELATION_STATUSES.has(currentStatus) &&
          currentStatus !== "STALEMATE" &&
          currentStatus !== "TRUCE"
        ) {
          return Response.json(
            { error: "해당 상대와 전쟁·교착·휴전 상태가 아닙니다." },
            { status: 400 },
          );
        }
        updates.push({ toCountryId: counterpartId, status: "NORMAL" });
      } else if (input.action === "SET_STALEMATE") {
        if (!WAR_RELATION_STATUSES.has(currentStatus) && currentStatus !== "STALEMATE") {
          return Response.json(
            { error: "전쟁/내전 상태에서만 교착으로 전환할 수 있습니다." },
            { status: 400 },
          );
        }
        updates.push({ toCountryId: counterpartId, status: "STALEMATE" });
      } else if (input.action === "SET_TRUCE") {
        if (
          !WAR_RELATION_STATUSES.has(currentStatus) &&
          currentStatus !== "STALEMATE" &&
          currentStatus !== "TRUCE"
        ) {
          return Response.json(
            { error: "전쟁·교착 상태에서만 휴전으로 전환할 수 있습니다." },
            { status: 400 },
          );
        }
        updates.push({ toCountryId: counterpartId, status: "TRUCE" });
      } else if (input.action === "END_ALLIANCE") {
        if (!ALLIANCE_RELATION_STATUSES.has(currentStatus)) {
          return Response.json({ error: "해당 상대와 동맹 상태가 아닙니다." }, { status: 400 });
        }
        updates.push({ toCountryId: counterpartId, status: "NORMAL" });
      }
    }

    if (updates.length === 0) {
      return Response.json({ error: "변경할 관계가 없습니다." }, { status: 400 });
    }

    await db.transaction(async (tx) => {
      for (const update of updates) {
        await setPairRelation(
          tx,
          input.campaignId,
          input.countryId,
          update.toCountryId,
          update.status,
          reason,
          session.user.id,
        );
      }
      await tx.insert(auditLogs).values({
        campaignId: input.campaignId,
        actorId: session.user.id,
        action: `DIPLOMACY_${input.action}`,
        targetType: "COUNTRY_RELATION",
        targetId: input.countryId,
        afterSummary: {
          action: input.action,
          counterpartId: input.counterpartId ?? null,
          updatedPairs: updates.length,
        },
        reason,
      });
    });
    await rebuildAutomaticMapBorders(input.campaignId, session.user.id);
    return Response.json({ action: input.action, updatedPairs: updates.length });
  }

  if (mode === "CREATE_BLOC") {
    const parsed = createBlocSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: "입력값을 확인하세요." }, { status: 400 });
    const input = parsed.data;
    const uniqueIds = [...new Set(input.countryIds)];
    if (!uniqueIds.includes(input.leaderCountryId)) {
      return Response.json({ error: "주도국은 회원국에 포함되어야 합니다." }, { status: 400 });
    }
    const countryRows = await db.query.countries.findMany({
      where: and(eq(countries.campaignId, input.campaignId), inArray(countries.id, uniqueIds)),
      columns: { id: true, entityType: true },
    });
    if (countryRows.length !== uniqueIds.length) {
      return Response.json({ error: "국가를 찾을 수 없습니다." }, { status: 404 });
    }
    if (countryRows.some((country) => country.entityType === "GUERRILLA_GROUP")) {
      return Response.json({ error: "게릴라 단체는 세력권에 가입할 수 없습니다." }, { status: 400 });
    }
    const occupied = await db
      .select({ countryId: diplomaticBlocMembers.countryId })
      .from(diplomaticBlocMembers)
      .where(inArray(diplomaticBlocMembers.countryId, uniqueIds));
    if (occupied.length) {
      return Response.json(
        { error: "이미 다른 세력에 가입한 국가가 포함되어 있습니다." },
        { status: 400 },
      );
    }
    const currentTurn = await db.query.turns.findFirst({
      where: eq(turns.campaignId, input.campaignId),
      orderBy: [desc(turns.sequence)],
      columns: { id: true },
    });

    const [bloc] = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(diplomaticBlocs)
        .values({
          campaignId: input.campaignId,
          name: input.name,
          acronym: input.acronym.toUpperCase(),
          color: input.color.toUpperCase(),
          description: input.description,
          foundedTurnId: currentTurn?.id ?? null,
          createdBy: session.user.id,
        })
        .returning({ id: diplomaticBlocs.id, name: diplomaticBlocs.name });
      await tx.insert(diplomaticBlocMembers).values(
        uniqueIds.map((countryId) => ({
          blocId: created.id,
          countryId,
          role: countryId === input.leaderCountryId ? "LEADER" : "MEMBER",
          joinedTurnId: currentTurn?.id ?? null,
          addedBy: session.user.id,
        })),
      );
      // 세력원끼리 상호방위 관계도 맞춰 둔다.
      for (let i = 0; i < uniqueIds.length; i += 1) {
        for (let j = i + 1; j < uniqueIds.length; j += 1) {
          await setPairRelation(
            tx,
            input.campaignId,
            uniqueIds[i]!,
            uniqueIds[j]!,
            "MUTUAL_DEFENSE",
            input.reason,
            session.user.id,
          );
        }
      }
      await tx.insert(auditLogs).values({
        campaignId: input.campaignId,
        actorId: session.user.id,
        action: "CREATE_DIPLOMATIC_BLOC",
        targetType: "DIPLOMATIC_BLOC",
        targetId: created.id,
        afterSummary: {
          name: input.name,
          acronym: input.acronym.toUpperCase(),
          countryIds: uniqueIds,
          leaderCountryId: input.leaderCountryId,
        },
        reason: input.reason,
      });
      return [created];
    });

    await rebuildAutomaticMapBorders(input.campaignId, session.user.id);
    return Response.json({
      blocId: bloc.id,
      name: bloc.name,
      countryCount: uniqueIds.length,
    });
  }

  const parsed = pairSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "입력값을 확인하세요." }, { status: 400 });
  const input = parsed.data;

  if (input.fromCountryId === input.toCountryId) {
    return Response.json({ error: "같은 대상끼리는 관계를 설정할 수 없습니다." }, { status: 400 });
  }
  const countryRows = await db.query.countries.findMany({
    where: and(
      eq(countries.campaignId, input.campaignId),
      inArray(countries.id, [input.fromCountryId, input.toCountryId]),
    ),
  });
  if (countryRows.length !== 2) {
    return Response.json({ error: "국가를 찾을 수 없습니다." }, { status: 404 });
  }
  const types = countryRows.map((country) => countryEntityTypeSchema.parse(country.entityType));
  const guerrillaCount = types.filter((type) => type === "GUERRILLA_GROUP").length;
  if (input.status === "GUERRILLA" && guerrillaCount !== 1) {
    return Response.json(
      { error: "게릴라전은 한 개의 게릴라 단체와 다른 한 대상 사이에만 설정할 수 있습니다." },
      { status: 400 },
    );
  }
  if (guerrillaCount > 0 && !["GUERRILLA", "NO_RELATIONS"].includes(input.status)) {
    return Response.json(
      { error: "게릴라 단체에는 일반 외교 관계를 설정할 수 없습니다." },
      { status: 400 },
    );
  }

  await db.transaction(async (tx) => {
    await setPairRelation(
      tx,
      input.campaignId,
      input.fromCountryId,
      input.toCountryId,
      input.status,
      input.reason,
      session.user.id,
    );
  });
  await rebuildAutomaticMapBorders(input.campaignId, session.user.id);
  return Response.json({ status: input.status });
}
