"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AuthorizationError, requireRole } from "@/src/auth/session";
import { getViewerContext } from "@/src/db/queries/viewer";
import { LAW_DEFINITIONS } from "@/src/domain/politics/laws";
import { adminSetLawStage, cancelLawChange, orderLawChange } from "@/src/services/laws";
import { enforceActionRateLimit } from "@/src/services/rate-limit";

const lawKeys = LAW_DEFINITIONS.map((law) => law.key) as [string, ...string[]];

async function playerContext() {
  const session = await requireRole("PLAYER");
  if (session.user.role !== "PLAYER") {
    throw new AuthorizationError("플레이어만 법·제도를 바꿀 수 있습니다.");
  }
  const context = await getViewerContext(session.user.id);
  if (!context.campaign || !context.country || !context.turn) {
    throw new Error("운영 중인 국가와 진행 중인 턴이 필요합니다.");
  }
  return {
    session,
    campaign: context.campaign,
    country: context.country,
    turn: context.turn,
  };
}

function revalidateLawPages() {
  revalidatePath("/country/politics");
  revalidatePath("/country/society");
  revalidatePath("/country/economy");
}

export async function changeLawAction(formData: FormData) {
  const viewer = await playerContext();
  enforceActionRateLimit(`law-change:${viewer.session.user.id}`, 10, 60_000);
  const input = z
    .object({
      lawKey: z.enum(lawKeys),
      targetStage: z.coerce.number().int().min(1).max(7),
    })
    .parse(Object.fromEntries(formData.entries()));
  await orderLawChange({
    userId: viewer.session.user.id,
    campaign: viewer.campaign,
    country: viewer.country,
    turn: viewer.turn,
    lawKey: input.lawKey,
    targetStage: input.targetStage,
  });
  revalidateLawPages();
}

export async function cancelLawChangeAction(formData: FormData) {
  const viewer = await playerContext();
  enforceActionRateLimit(`law-change:${viewer.session.user.id}`, 10, 60_000);
  const input = z
    .object({ changeId: z.string().uuid() })
    .parse(Object.fromEntries(formData.entries()));
  await cancelLawChange({
    userId: viewer.session.user.id,
    campaign: viewer.campaign,
    country: viewer.country,
    turn: viewer.turn,
    changeId: input.changeId,
  });
  revalidateLawPages();
}

export async function setCountryLawStageAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const input = z
    .object({
      countryId: z.string().uuid(),
      lawStage: z.string().regex(/^[A-Za-z]+:[1-7]$/),
      reason: z.string().trim().min(3).max(1000),
    })
    .parse(Object.fromEntries(formData.entries()));
  const [lawKey, stage] = input.lawStage.split(":");
  if (!lawKeys.includes(lawKey)) throw new Error("등록되지 않은 법·제도입니다.");
  await adminSetLawStage({
    actorId: session.user.id,
    countryId: input.countryId,
    lawKey,
    stage: Number(stage),
    reason: input.reason,
  });
  revalidatePath(`/admin/countries/${input.countryId}`);
  revalidateLawPages();
}
