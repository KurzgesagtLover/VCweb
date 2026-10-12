"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AuthorizationError, requireRole } from "@/src/auth/session";
import { getViewerContext } from "@/src/db/queries/viewer";
import {
  adminSetWorldMechanicProgress,
  cancelWorldMechanicAction,
  orderWorldMechanicAction,
} from "@/src/services/world-mechanics";
import { enforceActionRateLimit } from "@/src/services/rate-limit";

async function playerContext() {
  const session = await requireRole("PLAYER");
  if (session.user.role !== "PLAYER") {
    throw new AuthorizationError("플레이어만 세계 대응 행동을 시행할 수 있습니다.");
  }
  const context = await getViewerContext(session.user.id);
  if (!context.campaign || !context.country || !context.turn) {
    throw new Error("운영 중인 국가와 진행 중인 턴이 필요합니다.");
  }
  return { session, campaign: context.campaign, country: context.country, turn: context.turn };
}

function revalidateWorldPages() {
  revalidatePath("/world-state");
  revalidatePath("/country/politics");
  revalidatePath("/admin/world-mechanics");
}

export async function orderWorldActionAction(formData: FormData) {
  const viewer = await playerContext();
  enforceActionRateLimit(`world-action:${viewer.session.user.id}`, 10, 60_000);
  const input = z
    .object({
      mechanicKey: z.string().trim().min(1).max(64),
      actionKey: z.string().trim().min(1).max(64),
    })
    .parse(Object.fromEntries(formData.entries()));
  await orderWorldMechanicAction({
    userId: viewer.session.user.id,
    campaign: viewer.campaign,
    country: viewer.country,
    turn: viewer.turn,
    mechanicKey: input.mechanicKey,
    actionKey: input.actionKey,
  });
  revalidateWorldPages();
}

export async function cancelWorldActionAction(formData: FormData) {
  const viewer = await playerContext();
  enforceActionRateLimit(`world-action:${viewer.session.user.id}`, 10, 60_000);
  const input = z
    .object({ actionId: z.string().uuid() })
    .parse(Object.fromEntries(formData.entries()));
  await cancelWorldMechanicAction({
    userId: viewer.session.user.id,
    campaign: viewer.campaign,
    country: viewer.country,
    turn: viewer.turn,
    actionId: input.actionId,
  });
  revalidateWorldPages();
}

export async function setWorldMechanicProgressAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const context = await getViewerContext(session.user.id);
  if (!context.campaign) throw new Error("활성 캠페인이 없습니다.");
  const input = z
    .object({
      mechanicKey: z.string().trim().min(1).max(64),
      progress: z.coerce.number().finite(),
      reason: z.string().trim().min(3).max(1000),
    })
    .parse(Object.fromEntries(formData.entries()));
  await adminSetWorldMechanicProgress({
    actorId: session.user.id,
    campaignId: context.campaign.id,
    mechanicKey: input.mechanicKey,
    progress: input.progress,
    reason: input.reason,
  });
  revalidateWorldPages();
}
