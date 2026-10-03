"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/src/auth/session";
import { db } from "@/src/db";
import { auditLogs, countries } from "@/src/db/schema";
import { COUNTRY_TRACKS, type DevelopmentMetricKey } from "@/src/domain/development/tracks";
import { applyCountryDevelopmentDelta } from "@/src/services/development-tracks";

const metricKeys = COUNTRY_TRACKS.map((metric) => metric.key) as [
  DevelopmentMetricKey,
  ...DevelopmentMetricKey[],
];

const adjustmentSchema = z.object({
  countryId: z.string().uuid(),
  metric: z.enum(metricKeys),
  delta: z.coerce.number().min(-150).max(150),
  reason: z.string().trim().min(3).max(1000),
});

export async function adjustCountryDevelopmentAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const input = adjustmentSchema.parse(Object.fromEntries(formData.entries()));
  const country = await db.query.countries.findFirst({ where: eq(countries.id, input.countryId) });
  if (!country) throw new Error("국가를 찾을 수 없습니다.");

  await db.transaction(async (tx) => {
    const change = await applyCountryDevelopmentDelta(tx, {
      countryId: country.id,
      metric: input.metric,
      delta: String(input.delta),
    });
    await tx.insert(auditLogs).values({
      campaignId: country.campaignId,
      actorId: session.user.id,
      action: "ADJUST_COUNTRY_DEVELOPMENT",
      targetType: "COUNTRY_DEVELOPMENT_TRACK",
      targetId: country.id,
      beforeSummary: { metric: input.metric, ...change.before },
      afterSummary: { metric: input.metric, ...change.after },
      reason: input.reason,
    });
  });

  revalidatePath(`/admin/countries/${country.id}`);
  revalidatePath("/country/society");
  revalidatePath("/dashboard");
}
