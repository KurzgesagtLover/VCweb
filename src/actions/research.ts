"use server";

import Decimal from "decimal.js";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/src/auth/session";
import { db } from "@/src/db";
import { countryResearch, researchAllocations } from "@/src/db/schema";
import { getCountryResearch } from "@/src/db/queries/country";
import { getViewerContext } from "@/src/db/queries/viewer";
import { canResearch } from "@/src/domain/research/graph";
import { effectiveAllocations } from "@/src/services/research";

/**
 * 연구 배분: 국가 연구 역량을 기술별로 몇 %씩 쓸지 정한다. 합은 100%를 넘을 수 없다.
 * 연구는 실시간으로 진행하므로 턴 상태와 관계없이 바꿀 수 있고, 다음 판정부터 반영된다.
 */
export async function allocateResearchPointsAction(formData: FormData) {
  const session = await requireRole("PLAYER");
  const input = z
    .object({ techNodeId: z.string().uuid(), points: z.string().regex(/^\d+(\.\d{1,4})?$/) })
    .parse(Object.fromEntries(formData.entries()));
  const context = await getViewerContext(session.user.id);
  if (!context.country || !context.campaign || !context.turn)
    throw new Error("배정 국가와 진행 턴이 필요합니다.");
  const country = context.country;
  const turn = context.turn;

  const tree = await getCountryResearch(country.id, context.campaign.id, turn.id);
  const node = tree.nodes.find((item) => item.id === input.techNodeId);
  if (!node) throw new Error("연구 기술을 찾을 수 없습니다.");
  const state = tree.states.find((item) => item.techNodeId === node.id);
  if (state?.status === "COMPLETED") throw new Error("이미 완성한 기술입니다.");
  const codeById = new Map(tree.nodes.map((item) => [item.id, item.code]));
  const edges = tree.edges.map((edge) => ({
    tech: codeById.get(edge.techNodeId) ?? "",
    prerequisite: codeById.get(edge.prerequisiteId) ?? "",
  }));
  const completedIds = new Set(
    tree.states.filter((item) => item.status === "COMPLETED").map((item) => item.techNodeId),
  );
  const completedCodes = new Set(
    tree.states
      .filter((item) => item.status === "COMPLETED")
      .map((item) => codeById.get(item.techNodeId))
      .filter(Boolean) as string[],
  );
  const completedExclusiveGroups = new Set(
    tree.nodes
      .filter((item) => item.exclusiveGroup && completedCodes.has(item.code))
      .map((item) => item.exclusiveGroup as string),
  );
  const points = new Decimal(input.points);
  if (
    points.gt(0) &&
    !canResearch({
      techCode: node.code,
      completedCodes,
      edges,
      exclusiveGroup: node.exclusiveGroup,
      completedExclusiveGroups,
    })
  ) {
    throw new Error("선행 기술 또는 상호배타 조건을 충족하지 못했습니다.");
  }

  await db.transaction(async (tx) => {
    // 이번 턴에 배분을 처음 고치면 이전 배분을 먼저 옮겨 와 나머지 배분이 사라지지 않게 한다.
    // 완성한 기술의 배분은 옮기지 않는다(그 몫은 비어 있는 것으로 본다).
    const effective = await effectiveAllocations(tx, country.id, turn.sequence);
    if (effective.turnId && effective.turnId !== turn.id) {
      for (const row of effective.rows) {
        if (completedIds.has(row.techNodeId)) continue;
        await tx
          .insert(researchAllocations)
          .values({
            countryId: country.id,
            turnId: turn.id,
            techNodeId: row.techNodeId,
            points: row.points,
          })
          .onConflictDoNothing({
            target: [
              researchAllocations.countryId,
              researchAllocations.turnId,
              researchAllocations.techNodeId,
            ],
          });
      }
    }
    const current = await tx
      .select({ techNodeId: researchAllocations.techNodeId, points: researchAllocations.points })
      .from(researchAllocations)
      .where(
        and(eq(researchAllocations.countryId, country.id), eq(researchAllocations.turnId, turn.id)),
      );
    const finished = current.filter((row) => completedIds.has(row.techNodeId));
    if (finished.length) {
      await tx.delete(researchAllocations).where(
        and(
          eq(researchAllocations.countryId, country.id),
          eq(researchAllocations.turnId, turn.id),
          inArray(
            researchAllocations.techNodeId,
            finished.map((row) => row.techNodeId),
          ),
        ),
      );
    }
    const others = current
      .filter((row) => row.techNodeId !== node.id && !completedIds.has(row.techNodeId))
      .reduce((sum, row) => sum.plus(row.points), new Decimal(0));
    if (points.lt(0) || others.plus(points).gt(100)) {
      throw new Error("연구 배분 합계가 100%를 넘습니다.");
    }
    await tx
      .insert(researchAllocations)
      .values({
        countryId: country.id,
        turnId: turn.id,
        techNodeId: node.id,
        points: points.toString(),
      })
      .onConflictDoUpdate({
        target: [
          researchAllocations.countryId,
          researchAllocations.turnId,
          researchAllocations.techNodeId,
        ],
        set: { points: points.toString(), updatedAt: new Date() },
      });
    if (points.gt(0)) {
      await tx
        .insert(countryResearch)
        .values({
          countryId: country.id,
          techNodeId: node.id,
          status: "IN_PROGRESS",
          startedTurnId: turn.id,
        })
        .onConflictDoUpdate({
          target: [countryResearch.countryId, countryResearch.techNodeId],
          set: { status: "IN_PROGRESS", updatedAt: new Date() },
        });
    }
  });
  revalidatePath("/country/research");
}

/** 완성한 기술을 기밀로 묶거나 푼다. 기밀 기술은 다른 나라의 기술 전파 보너스에서 빠진다. */
export async function setTechClassifiedAction(formData: FormData) {
  const session = await requireRole("PLAYER");
  const input = z
    .object({ techNodeId: z.string().uuid(), classified: z.enum(["true", "false"]) })
    .parse(Object.fromEntries(formData.entries()));
  const context = await getViewerContext(session.user.id);
  if (!context.country) throw new Error("배정 국가가 필요합니다.");
  const updated = await db
    .update(countryResearch)
    .set({ classified: input.classified === "true", updatedAt: new Date() })
    .where(
      and(
        eq(countryResearch.countryId, context.country.id),
        eq(countryResearch.techNodeId, input.techNodeId),
        eq(countryResearch.status, "COMPLETED"),
      ),
    )
    .returning({ id: countryResearch.id });
  if (!updated.length) throw new Error("완성한 기술만 기밀로 지정할 수 있습니다.");
  revalidatePath("/country/research");
}
