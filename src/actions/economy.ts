"use server";

import Decimal from "decimal.js";
import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/src/auth/session";
import { db } from "@/src/db";
import {
  auditLogs,
  countryFiscalPolicies,
  economicSnapshots,
  parties,
  partySnapshots,
  turns,
} from "@/src/db/schema";
import { getViewerContext } from "@/src/db/queries/viewer";
import {
  BUDGET_SECTORS,
  getBudgetPresetContext,
  isBudgetPresetId,
  validateBudgetAllocation,
  type BudgetAllocation,
} from "@/src/domain/economy/budget";
import { splitEffectiveTaxRate } from "@/src/domain/economy/tax";

export async function updateCountryTaxRateAction(formData: FormData) {
  const session = await requireRole("PLAYER");
  const context = await getViewerContext(session.user.id);
  if (!context.campaign || !context.country) throw new Error("배정된 국가가 없습니다.");
  const parseTaxRate = (key: string) =>
    new Decimal(z.coerce.number().min(0).max(75).parse(formData.get(key))).div(100).toFixed(6);
  const taxRates = {
    incomeTaxRate: parseTaxRate("incomeTaxRate"),
    corporateTaxRate: parseTaxRate("corporateTaxRate"),
    otherTaxRate: parseTaxRate("otherTaxRate"),
  };
  const previous = await db.query.countryFiscalPolicies.findFirst({
    where: eq(countryFiscalPolicies.countryId, context.country.id),
  });

  await db.transaction(async (tx) => {
    await tx
      .insert(countryFiscalPolicies)
      .values({ countryId: context.country!.id, ...taxRates, updatedBy: session.user.id })
      .onConflictDoUpdate({
        target: countryFiscalPolicies.countryId,
        set: { ...taxRates, updatedBy: session.user.id, updatedAt: new Date() },
      });
    await tx.insert(auditLogs).values({
      campaignId: context.campaign!.id,
      actorId: session.user.id,
      action: "UPDATE_TAX_RATE",
      targetType: "COUNTRY_FISCAL_POLICY",
      targetId: context.country!.id,
      beforeSummary: previous
        ? {
            incomeTaxRate: previous.incomeTaxRate,
            corporateTaxRate: previous.corporateTaxRate,
            otherTaxRate: previous.otherTaxRate,
          }
        : null,
      afterSummary: taxRates,
      reason: "플레이어 세목별 세율 설정",
    });
  });
  revalidatePath("/country/economy");
}

export async function updateCountryBudgetAction(formData: FormData) {
  const session = await requireRole("PLAYER");
  const context = await getViewerContext(session.user.id);
  if (!context.campaign || !context.country) throw new Error("배정된 국가가 없습니다.");

  const rawPreset = formData.get("budgetPreset");
  if (!isBudgetPresetId(rawPreset)) throw new Error("예산 프리셋이 올바르지 않습니다.");
  const allocation = Object.fromEntries(
    BUDGET_SECTORS.map((sector) => [
      sector.key,
      z.coerce.number().int().min(0).max(100).parse(formData.get(sector.key)),
    ]),
  ) as BudgetAllocation;

  const [previous, governingParty, latestEconomic] = await Promise.all([
    db.query.countryFiscalPolicies.findFirst({
      where: eq(countryFiscalPolicies.countryId, context.country.id),
    }),
    db
      .select({ economicAxis: parties.economicAxis, socialAxis: parties.socialAxis })
      .from(partySnapshots)
      .innerJoin(parties, eq(partySnapshots.partyId, parties.id))
      .innerJoin(turns, eq(partySnapshots.turnId, turns.id))
      .where(and(eq(parties.countryId, context.country.id), eq(partySnapshots.isGovernment, true)))
      .orderBy(desc(turns.sequence), desc(partySnapshots.support))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    db
      .select({
        nominalGdp: economicSnapshots.nominalGdp,
        governmentRevenue: economicSnapshots.governmentRevenue,
      })
      .from(economicSnapshots)
      .innerJoin(turns, eq(economicSnapshots.turnId, turns.id))
      .where(eq(economicSnapshots.countryId, context.country.id))
      .orderBy(desc(turns.sequence))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  ]);

  const presetContext = getBudgetPresetContext({
    economicSystem: context.country.economicSystem,
    economicAxis: governingParty?.economicAxis ?? null,
    socialAxis: governingParty?.socialAxis ?? null,
  });
  if (!presetContext.allowed.includes(rawPreset)) {
    throw new Error("현재 집권 이념으로는 선택할 수 없는 예산 프리셋입니다.");
  }
  if (!validateBudgetAllocation(rawPreset, allocation)) {
    throw new Error("예산 합계는 100%여야 하며 프리셋의 조정 범위를 벗어날 수 없습니다.");
  }

  const derivedTaxRate = latestEconomic
    ? Decimal.min(
        "0.75",
        Decimal.max(
          0,
          new Decimal(latestEconomic.governmentRevenue).div(
            Decimal.max(latestEconomic.nominalGdp, 1),
          ),
        ),
      ).toFixed(6)
    : "0.200000";
  const derivedTaxRates = splitEffectiveTaxRate(derivedTaxRate);
  const values = {
    budgetPreset: rawPreset,
    ...allocation,
    updatedBy: session.user.id,
    updatedAt: new Date(),
  };

  await db.transaction(async (tx) => {
    await tx
      .insert(countryFiscalPolicies)
      .values({
        countryId: context.country!.id,
        incomeTaxRate: previous?.incomeTaxRate ?? derivedTaxRates.incomeTaxRate,
        corporateTaxRate: previous?.corporateTaxRate ?? derivedTaxRates.corporateTaxRate,
        otherTaxRate: previous?.otherTaxRate ?? derivedTaxRates.otherTaxRate,
        ...values,
      })
      .onConflictDoUpdate({
        target: countryFiscalPolicies.countryId,
        set: values,
      });
    await tx.insert(auditLogs).values({
      campaignId: context.campaign!.id,
      actorId: session.user.id,
      action: "UPDATE_BUDGET_ALLOCATION",
      targetType: "COUNTRY_FISCAL_POLICY",
      targetId: context.country!.id,
      beforeSummary: previous
        ? {
            budgetPreset: previous.budgetPreset,
            allocation: Object.fromEntries(
              BUDGET_SECTORS.map((sector) => [sector.key, previous[sector.key]]),
            ),
          }
        : null,
      afterSummary: { budgetPreset: rawPreset, allocation },
      reason: "플레이어 정부 예산 배분 설정",
    });
  });
  revalidatePath("/country/economy");
}
