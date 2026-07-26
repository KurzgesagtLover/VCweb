"use server";

import Decimal from "decimal.js";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/src/auth/session";
import { db } from "@/src/db";
import { adminChangeProposals, auditLogs } from "@/src/db/schema";
import { getCountryLedger } from "@/src/db/queries/country";
import { metricLabel } from "@/src/domain/display-labels";

const politicsMetrics = [
  "stability",
  "legitimacy",
  "governmentApproval",
  "unrest",
  "stateCapacity",
  "corruption",
  "democracy",
] as const;

const proposalSchema = z.object({
  countryId: z.string().uuid(),
  domain: z.literal("POLITICS"),
  metric: z.string().min(1),
  value: z.string().trim().min(1),
  reason: z.string().trim().min(10).max(1000),
});

const economicEditorMetrics = {
  realGdp: { kind: "decimal", min: "0", max: null },
  nominalGdp: { kind: "decimal", min: "0", max: null },
  realGdpGrowth: { kind: "decimal", min: "-0.25", max: "0.3" },
  gdpDeflator: { kind: "decimal", min: "0.01", max: null },
  realGni: { kind: "decimal", min: "0", max: null },
  realGnp: { kind: "decimal", min: "0", max: null },
  wealth: { kind: "decimal", min: "0", max: null },
  foreignReserves: { kind: "decimal", min: "0", max: null },
  currencyValue: { kind: "decimal", min: "0.000001", max: null },
  creditScore: { kind: "integer", min: "0", max: "100" },
  incomeGini: { kind: "decimal", min: "0", max: "1" },
  wealthGini: { kind: "decimal", min: "0", max: "1" },
  inflationRate: { kind: "decimal", min: "-0.1", max: "0.5" },
  landPriceGrowth: { kind: "decimal", min: "-0.5", max: "0.8" },
  unemploymentRate: { kind: "decimal", min: "0", max: "1" },
  governmentRevenue: { kind: "decimal", min: "0", max: null },
  governmentSpending: { kind: "decimal", min: "0", max: null },
  nationalDebt: { kind: "decimal", min: "0", max: null },
  policyRate: { kind: "decimal", min: "-0.1", max: "1" },
  currentAccountToGdp: { kind: "decimal", min: "-0.5", max: "0.5" },
  productivityIndex: { kind: "decimal", min: "0", max: "1000" },
  referenceYear: { kind: "integer", min: "1", max: "9999" },
  currencyCode: { kind: "text", minLength: 1, maxLength: 12 },
  creditRating: { kind: "text", minLength: 1, maxLength: 20 },
  creditRatingAgency: { kind: "text", minLength: 1, maxLength: 80 },
  priceBasis: { kind: "text", minLength: 1, maxLength: 40 },
  scale: { kind: "text", minLength: 1, maxLength: 40 },
} as const;

function parseEconomicEditorValue(
  metric: keyof typeof economicEditorMetrics,
  raw: FormDataEntryValue,
) {
  const spec = economicEditorMetrics[metric];
  const value = String(raw).trim();
  if (spec.kind === "text") {
    if (value.length < spec.minLength || value.length > spec.maxLength) {
      throw new Error(`${metric} 값을 확인해 주세요.`);
    }
    return value;
  }
  const decimal = new Decimal(value);
  if (
    !decimal.isFinite() ||
    decimal.lt(spec.min) ||
    (spec.max !== null && decimal.gt(spec.max)) ||
    (spec.kind === "integer" && !decimal.isInteger())
  ) {
    throw new Error(`${metric} 값이 허용 범위를 벗어났습니다.`);
  }
  return spec.kind === "integer" ? decimal.toNumber() : decimal.toString();
}

export async function createEconomicChangeSetAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const base = z
    .object({
      countryId: z.string().uuid(),
      reason: z.string().trim().min(10).max(1000),
    })
    .parse({ countryId: formData.get("countryId"), reason: formData.get("reason") });
  const ledger = await getCountryLedger(base.countryId);
  if (!ledger?.economic) throw new Error("수정할 경제 스냅샷을 찾을 수 없습니다.");

  const changes: Array<{
    metric: string;
    beforeValue: unknown;
    afterValue: string | number;
    unchanged: boolean;
  }> = (Object.keys(economicEditorMetrics) as Array<keyof typeof economicEditorMetrics>)
    .filter((metric) => formData.has(metric))
    .map((metric) => {
      const beforeValue = ledger.economic![metric];
      const afterValue = parseEconomicEditorValue(metric, formData.get(metric)!);
      const unchanged =
        typeof afterValue === "number"
          ? Number(beforeValue) === afterValue
          : economicEditorMetrics[metric].kind === "text"
            ? String(beforeValue) === afterValue
            : new Decimal(String(beforeValue)).eq(afterValue);
      return { metric, beforeValue, afterValue, unchanged };
    })
    .filter((change) => !change.unchanged);

  if (!changes.length) throw new Error("변경된 경제 지표가 없습니다.");
  const changedMetrics = new Set(changes.map((change) => change.metric));
  const nextSnapshot = { ...ledger.economic } as Record<string, unknown>;
  for (const change of changes) nextSnapshot[change.metric] = change.afterValue;
  const previousSnapshot = ledger.economicTrend.at(-2)?.snapshot;
  const derivedValues: Record<string, string> = {};
  if (changedMetrics.has("governmentRevenue") || changedMetrics.has("governmentSpending")) {
    derivedValues.fiscalBalance = new Decimal(String(nextSnapshot.governmentRevenue))
      .minus(String(nextSnapshot.governmentSpending))
      .toString();
  }
  if (changedMetrics.has("nationalDebt") || changedMetrics.has("nominalGdp")) {
    derivedValues.debtToGdp = new Decimal(String(nextSnapshot.nominalGdp)).isZero()
      ? "0"
      : new Decimal(String(nextSnapshot.nationalDebt))
          .div(String(nextSnapshot.nominalGdp))
          .toString();
  }
  if (changedMetrics.has("governmentSpending") && previousSnapshot) {
    derivedValues.governmentSpendingGrowth = new Decimal(
      previousSnapshot.governmentSpending,
    ).isZero()
      ? String(nextSnapshot.governmentSpendingGrowth)
      : new Decimal(String(nextSnapshot.governmentSpending))
          .div(previousSnapshot.governmentSpending)
          .minus(1)
          .toString();
  }
  for (const [metric, afterValue] of Object.entries(derivedValues)) {
    const beforeValue = ledger.economic[metric as keyof typeof ledger.economic];
    if (!new Decimal(String(beforeValue)).eq(afterValue)) {
      changes.push({ metric, beforeValue, afterValue, unchanged: false });
    }
  }
  const pending = await db.query.adminChangeProposals.findMany({
    where: and(
      eq(adminChangeProposals.countryId, ledger.country.id),
      eq(adminChangeProposals.turnId, ledger.economic.turnId),
      eq(adminChangeProposals.domain, "ECONOMY"),
      eq(adminChangeProposals.status, "PENDING"),
    ),
  });
  const pendingMetrics = new Set(pending.map((proposal) => proposal.metric));
  const duplicate = changes.find((change) => pendingMetrics.has(change.metric));
  if (duplicate)
    throw new Error(`${metricLabel(duplicate.metric)} 지표는 이미 승인 대기 중입니다.`);

  await db.transaction(async (tx) => {
    for (const change of changes) {
      const [proposal] = await tx
        .insert(adminChangeProposals)
        .values({
          campaignId: ledger.country.campaignId,
          countryId: ledger.country.id,
          turnId: ledger.economic!.turnId,
          domain: "ECONOMY",
          metric: change.metric,
          beforeValue: change.beforeValue,
          afterValue: change.afterValue,
          reason: base.reason,
          proposedBy: session.user.id,
        })
        .returning();
      await tx.insert(auditLogs).values({
        campaignId: ledger.country.campaignId,
        actorId: session.user.id,
        action: "PROPOSE_METRIC_CHANGE",
        targetType: "ECONOMY",
        targetId: proposal.id,
        beforeSummary: { [change.metric]: change.beforeValue },
        afterSummary: { [change.metric]: change.afterValue },
        reason: base.reason,
      });
    }
  });
  revalidatePath("/admin/economy");
}

export async function createAdminChangeProposalAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const input = proposalSchema.parse(Object.fromEntries(formData.entries()));
  const ledger = await getCountryLedger(input.countryId);
  if (!ledger) throw new Error("국가를 찾을 수 없습니다.");
  const snapshot = ledger.political;
  if (!snapshot) throw new Error("수정할 현재 스냅샷이 없습니다.");

  if (!politicsMetrics.includes(input.metric as (typeof politicsMetrics)[number])) {
    throw new Error("수정할 수 없는 정치 지표입니다.");
  }
  const value = Number(input.value);
  if (!Number.isInteger(value) || value < 0 || value > 100)
    throw new Error("정치 지표는 0~100 정수여야 합니다.");
  const afterValue = value;

  const beforeValue = (snapshot as Record<string, unknown>)[input.metric];
  await db.transaction(async (tx) => {
    const [proposal] = await tx
      .insert(adminChangeProposals)
      .values({
        campaignId: ledger.country.campaignId,
        countryId: ledger.country.id,
        turnId: snapshot.turnId,
        domain: input.domain,
        metric: input.metric,
        beforeValue,
        afterValue,
        reason: input.reason,
        proposedBy: session.user.id,
      })
      .returning();
    await tx.insert(auditLogs).values({
      campaignId: ledger.country.campaignId,
      actorId: session.user.id,
      action: "PROPOSE_METRIC_CHANGE",
      targetType: input.domain,
      targetId: proposal.id,
      beforeSummary: { [input.metric]: beforeValue },
      afterSummary: { [input.metric]: afterValue },
      reason: input.reason,
    });
  });
  revalidatePath("/admin/politics");
}

export async function reviewAdminChangeProposalAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const input = z
    .object({ proposalId: z.string().uuid(), decision: z.enum(["APPROVED", "REJECTED"]) })
    .parse(Object.fromEntries(formData.entries()));
  const proposal = await db.query.adminChangeProposals.findFirst({
    where: and(
      eq(adminChangeProposals.id, input.proposalId),
      eq(adminChangeProposals.status, "PENDING"),
    ),
  });
  if (!proposal) throw new Error("검토 가능한 변경안이 아닙니다.");
  await db.transaction(async (tx) => {
    await tx
      .update(adminChangeProposals)
      .set({
        status: input.decision,
        reviewedBy: session.user.id,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(adminChangeProposals.id, proposal.id));
    await tx.insert(auditLogs).values({
      campaignId: proposal.campaignId,
      actorId: session.user.id,
      action: input.decision === "APPROVED" ? "APPROVE_METRIC_CHANGE" : "REJECT_METRIC_CHANGE",
      targetType: proposal.domain,
      targetId: proposal.id,
      beforeSummary: { [proposal.metric]: proposal.beforeValue },
      afterSummary: { [proposal.metric]: proposal.afterValue },
      reason: proposal.reason,
    });
  });
  revalidatePath("/admin/economy");
  revalidatePath("/admin/politics");
  revalidatePath("/country/economy");
  revalidatePath("/country/politics");
}
