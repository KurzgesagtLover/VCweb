"use server";

import Decimal from "decimal.js";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/src/auth/session";
import { db } from "@/src/db";
import { auditLogs, countryFiscalPolicies } from "@/src/db/schema";
import { getViewerContext } from "@/src/db/queries/viewer";

export async function updateCountryTaxRateAction(formData: FormData) {
  const session = await requireRole("PLAYER");
  const context = await getViewerContext(session.user.id);
  if (!context.campaign || !context.country) throw new Error("배정된 국가가 없습니다.");
  const percent = z.coerce.number().min(0).max(75).parse(formData.get("taxRate"));
  const taxRate = new Decimal(percent).div(100).toFixed(6);
  const previous = await db.query.countryFiscalPolicies.findFirst({
    where: eq(countryFiscalPolicies.countryId, context.country.id),
  });

  await db.transaction(async (tx) => {
    await tx
      .insert(countryFiscalPolicies)
      .values({ countryId: context.country!.id, taxRate, updatedBy: session.user.id })
      .onConflictDoUpdate({
        target: countryFiscalPolicies.countryId,
        set: { taxRate, updatedBy: session.user.id, updatedAt: new Date() },
      });
    await tx.insert(auditLogs).values({
      campaignId: context.campaign!.id,
      actorId: session.user.id,
      action: "UPDATE_TAX_RATE",
      targetType: "COUNTRY_FISCAL_POLICY",
      targetId: context.country!.id,
      beforeSummary: { taxRate: previous?.taxRate ?? null },
      afterSummary: { taxRate },
      reason: "플레이어 세율 설정",
    });
  });
  revalidatePath("/country/economy");
}
