"use server";

import Decimal from "decimal.js";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/src/auth/session";
import { db } from "@/src/db";
import { countryResearch, researchAllocations } from "@/src/db/schema";
import { getCountryResearch } from "@/src/db/queries/country";
import { getViewerContext } from "@/src/db/queries/viewer";
import { canResearch } from "@/src/domain/research/graph";

export async function allocateResearchPointsAction(formData: FormData) {
  const session = await requireRole("PLAYER");
  const input = z
    .object({ techNodeId: z.string().uuid(), points: z.string().regex(/^\d+(\.\d{1,4})?$/) })
    .parse(Object.fromEntries(formData.entries()));
  const context = await getViewerContext(session.user.id);
  if (!context.country || !context.campaign || !context.turn)
    throw new Error("배정 국가와 진행 턴이 필요합니다.");
  if (context.turn.status !== "DRAFT")
    throw new Error("연구 배분은 턴 초안 단계에서만 수정할 수 있습니다.");

  const tree = await getCountryResearch(context.country.id, context.campaign.id, context.turn.id);
  const node = tree.nodes.find((item) => item.id === input.techNodeId);
  if (!node) throw new Error("연구 기술을 찾을 수 없습니다.");
  const codeById = new Map(tree.nodes.map((item) => [item.id, item.code]));
  const edges = tree.edges.map((edge) => ({
    tech: codeById.get(edge.techNodeId) ?? "",
    prerequisite: codeById.get(edge.prerequisiteId) ?? "",
  }));
  const completedCodes = new Set(
    tree.states
      .filter((state) => state.status === "COMPLETED")
      .map((state) => codeById.get(state.techNodeId))
      .filter(Boolean) as string[],
  );
  if (
    !canResearch({
      techCode: node.code,
      completedCodes,
      edges,
      exclusiveGroup: node.exclusiveGroup,
    })
  ) {
    throw new Error("선행 기술 또는 상호배타 조건을 충족하지 못했습니다.");
  }

  const points = new Decimal(input.points);
  const otherPoints = tree.allocations
    .filter((allocation) => allocation.techNodeId !== input.techNodeId)
    .reduce((sum, allocation) => sum.plus(allocation.points), new Decimal(0));
  const availablePoints = new Decimal(100);
  if (points.lt(0) || otherPoints.plus(points).gt(availablePoints)) {
    throw new Error("이번 턴 연구 포인트 100점을 초과했습니다.");
  }

  await db.transaction(async (tx) => {
    await tx
      .insert(researchAllocations)
      .values({
        countryId: context.country!.id,
        turnId: context.turn!.id,
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
    await tx
      .insert(countryResearch)
      .values({
        countryId: context.country!.id,
        techNodeId: node.id,
        status: "IN_PROGRESS",
        startedTurnId: context.turn!.id,
      })
      .onConflictDoUpdate({
        target: [countryResearch.countryId, countryResearch.techNodeId],
        set: { status: "IN_PROGRESS", updatedAt: new Date() },
      });
  });
  revalidatePath("/country/research");
}
