"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/src/auth/session";
import { db } from "@/src/db";
import { countries } from "@/src/db/schema";
import { getViewerContext } from "@/src/db/queries/viewer";
import { customSpiritSchema, requireSpiritTemplate } from "@/src/domain/spirits/model";
import { adminGrantSpirit, adminRemoveSpirit } from "@/src/services/spirits";
import { eq } from "drizzle-orm";

async function adminContext(countryId: string) {
  const session = await requireRole("ADMIN");
  const context = await getViewerContext(session.user.id);
  if (!context.campaign) throw new Error("활성 캠페인이 없습니다.");
  const country = await db.query.countries.findFirst({ where: eq(countries.id, countryId) });
  if (!country || country.campaignId !== context.campaign.id)
    throw new Error("국가를 찾을 수 없습니다.");
  return { session, campaign: context.campaign, turn: context.turn, country };
}

function revalidateSpiritPages(countryId: string) {
  revalidatePath(`/admin/countries/${countryId}`);
  revalidatePath("/country/politics");
}

/** 기간 입력: 비우면 기본 기간, 0이면 뗄 때까지 유지 */
const durationField = z
  .string()
  .trim()
  .transform((value, context) => {
    if (value === "") return undefined;
    const number = Number(value);
    if (!Number.isInteger(number) || number < 0 || number > 240) {
      context.addIssue({ code: "custom", message: "기간은 0~240개월 정수여야 합니다." });
      return z.NEVER;
    }
    return number === 0 ? null : number;
  });

export async function grantSpiritAction(formData: FormData) {
  const input = z
    .object({
      countryId: z.string().uuid(),
      mode: z.enum(["TEMPLATE", "CUSTOM"]),
      templateKey: z.string().trim().max(64).optional(),
      custom: z.string().max(20_000).optional(),
      durationMonths: durationField,
      reason: z.string().trim().min(3).max(1000),
    })
    .parse(Object.fromEntries(formData.entries()));
  const viewer = await adminContext(input.countryId);
  let spirit: { templateKey: string } | { custom: z.infer<typeof customSpiritSchema> };
  if (input.mode === "TEMPLATE") {
    spirit = { templateKey: requireSpiritTemplate(input.templateKey ?? "").key };
  } else {
    let raw: unknown;
    try {
      raw = JSON.parse(input.custom ?? "");
    } catch {
      throw new Error("국가정신 JSON 형식이 올바르지 않습니다.");
    }
    const parsed = customSpiritSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(" / "),
      );
    }
    spirit = { custom: parsed.data };
  }
  await adminGrantSpirit({
    actorId: viewer.session.user.id,
    campaignId: viewer.campaign.id,
    countryId: viewer.country.id,
    turn: viewer.turn ? { id: viewer.turn.id, gameDateStart: viewer.turn.gameDateStart } : null,
    spirit,
    durationMonths: input.durationMonths,
    reason: input.reason,
  });
  revalidateSpiritPages(viewer.country.id);
}

export async function removeSpiritAction(formData: FormData) {
  const input = z
    .object({
      countryId: z.string().uuid(),
      spiritKey: z.string().trim().min(1).max(64),
      reason: z.string().trim().min(3).max(1000),
    })
    .parse(Object.fromEntries(formData.entries()));
  const viewer = await adminContext(input.countryId);
  await adminRemoveSpirit({
    actorId: viewer.session.user.id,
    campaignId: viewer.campaign.id,
    countryId: viewer.country.id,
    spiritKey: input.spiritKey,
    turnId: viewer.turn?.id ?? null,
    reason: input.reason,
  });
  revalidateSpiritPages(viewer.country.id);
}
