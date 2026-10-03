"use server";

import Decimal from "decimal.js";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/src/auth/session";
import { db } from "@/src/db";
import {
  auditLogs,
  companyClassFinancials,
  companyScaleStatistics,
  countries,
  majorCompanies,
} from "@/src/db/schema";
import {
  AGGREGATE_COMPANY_CLASSES,
  COMPANY_AGGREGATE_METRICS,
  companyAutomationFieldName,
  companyClassFieldName,
  type CompanyAggregateTotals,
} from "@/src/domain/economy/company";

const requiredText = (formData: FormData, key: string, max = 500) =>
  z.string().trim().min(1).max(max).parse(formData.get(key));

const optionalText = (formData: FormData, key: string, max = 500) => {
  const value = String(formData.get(key) ?? "").trim();
  return value ? z.string().max(max).parse(value) : null;
};

const textList = (formData: FormData, key: string) =>
  String(formData.get(key) ?? "")
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean);

const decimalValue = (
  formData: FormData,
  key: string,
  { required = false, min }: { required?: boolean; min?: number } = {},
) => {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw && !required) return null;
  const value = new Decimal(raw);
  if (!value.isFinite() || (min !== undefined && value.lt(min))) {
    throw new Error(`${key} 값이 올바르지 않습니다.`);
  }
  return value.toString();
};

const percentValue = (
  formData: FormData,
  key: string,
  { min = 0, max = 1000 }: { min?: number; max?: number } = {},
) => {
  const raw = decimalValue(formData, key, { min });
  if (raw === null) return null;
  const value = new Decimal(raw);
  if (value.gt(max)) throw new Error(`${key} 비율이 올바르지 않습니다.`);
  return value.div(100).toString();
};

export async function saveMajorCompanyAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const countryId = z.string().uuid().parse(formData.get("countryId"));
  const companyIdRaw = String(formData.get("companyId") ?? "").trim();
  const companyId = companyIdRaw ? z.string().uuid().parse(companyIdRaw) : null;
  const country = await db.query.countries.findFirst({ where: eq(countries.id, countryId) });
  if (!country) throw new Error("국가를 찾을 수 없습니다.");

  const existing = companyId
    ? await db.query.majorCompanies.findFirst({ where: eq(majorCompanies.id, companyId) })
    : null;
  if (companyId && (!existing || existing.countryId !== countryId)) {
    throw new Error("수정할 기업을 찾을 수 없습니다.");
  }

  const productsAndServices = textList(formData, "productsAndServices");
  if (!productsAndServices.length) throw new Error("주요 제품·서비스를 입력해야 합니다.");

  const industry = requiredText(formData, "industry", 200);
  const values = {
    name: requiredText(formData, "name", 200),
    logo: requiredText(formData, "logo", 2000),
    slogan: requiredText(formData, "slogan", 500),
    abbreviation: optionalText(formData, "abbreviation", 100),
    founded: requiredText(formData, "founded", 100),
    history: String(formData.get("history") ?? "").trim(),
    legalForm: requiredText(formData, "legalForm", 200),
    headquarters: requiredText(formData, "headquarters", 300),
    placeOfFoundation: optionalText(formData, "placeOfFoundation", 300),
    chiefExecutiveOfficer: requiredText(formData, "chiefExecutiveOfficer", 200),
    boardChair: optionalText(formData, "boardChair", 200),
    parentCompany: requiredText(formData, "parentCompany", 200),
    largestShareholder: optionalText(formData, "largestShareholder", 200),
    majorShareholders: textList(formData, "majorShareholders"),
    subsidiaries: textList(formData, "subsidiaries"),
    affiliates: textList(formData, "affiliates"),
    employeeCount: decimalValue(formData, "employeeCount", { required: true, min: 0 })!,
    indirectEmployment: decimalValue(formData, "indirectEmployment", { min: 0 }),
    overseasEmployees: decimalValue(formData, "overseasEmployees", { min: 0 }),
    averageSalary: decimalValue(formData, "averageSalary", { min: 0 }),
    unionMembershipRate: percentValue(formData, "unionMembershipRate", { max: 100 }),
    revenue: decimalValue(formData, "revenue", { required: true, min: 0 })!,
    grossProfit: decimalValue(formData, "grossProfit", { required: true })!,
    operatingProfit: decimalValue(formData, "operatingProfit", { required: true })!,
    netIncome: decimalValue(formData, "netIncome", { required: true })!,
    totalAssets: decimalValue(formData, "totalAssets", { required: true, min: 0 })!,
    totalDebt: decimalValue(formData, "totalDebt", { min: 0 }),
    enterpriseValue: decimalValue(formData, "enterpriseValue", { required: true, min: 0 })!,
    marketCapitalization: decimalValue(formData, "marketCapitalization", { min: 0 }),
    creditRating: optionalText(formData, "creditRating", 50),
    researchAndDevelopmentExpense: decimalValue(formData, "researchAndDevelopmentExpense", {
      min: 0,
    }),
    capitalExpenditure: decimalValue(formData, "capitalExpenditure", { min: 0 }),
    cashAndEquivalents: decimalValue(formData, "cashAndEquivalents", { min: 0 }),
    dividendsPaid: decimalValue(formData, "dividendsPaid", { min: 0 }),
    debtRatio: percentValue(formData, "debtRatio"),
    operatingMargin: percentValue(formData, "operatingMargin", { min: -1000 }),
    automationProductivityGrowthRate: percentValue(formData, "automationProductivityGrowthRate", {
      min: -100,
      max: 100,
    })!,
    industry,
    productsAndServices,
    brands: textList(formData, "brands"),
    productionFacilities: textList(formData, "productionFacilities"),
    researchFacilities: textList(formData, "researchFacilities"),
    overseasBases: textList(formData, "overseasBases"),
    majorMarkets: textList(formData, "majorMarkets"),
    competitors: textList(formData, "competitors"),
    isListed: formData.get("isListed") === "true",
    stockExchange: optionalText(formData, "stockExchange", 100),
    tickerSymbol: optionalText(formData, "tickerSymbol", 100),
    sharesOutstanding: decimalValue(formData, "sharesOutstanding", { min: 0 }),
    sharePrice: decimalValue(formData, "sharePrice", { min: 0 }),
    dividendYield: percentValue(formData, "dividendYield"),
    stateOwned: formData.get("stateOwned") === "true",
    sizeIndex: z.coerce.number().int().min(0).max(100).parse(formData.get("sizeIndex")),
    systemicImportance: z.coerce
      .number()
      .int()
      .min(0)
      .max(100)
      .parse(formData.get("systemicImportance")),
    health: z.coerce.number().int().min(0).max(100).parse(formData.get("health")),
    industryTags: [industry],
    updatedAt: new Date(),
  };

  await db.transaction(async (tx) => {
    const [saved] = existing
      ? await tx
          .update(majorCompanies)
          .set(values)
          .where(eq(majorCompanies.id, existing.id))
          .returning()
      : await tx
          .insert(majorCompanies)
          .values({ countryId, ...values })
          .returning();
    await tx.insert(auditLogs).values({
      campaignId: country.campaignId,
      actorId: session.user.id,
      action: existing ? "UPDATE_MAJOR_COMPANY" : "CREATE_MAJOR_COMPANY",
      targetType: "MAJOR_COMPANY",
      targetId: saved.id,
      beforeSummary: existing ? { name: existing.name, industry: existing.industry } : null,
      afterSummary: { name: saved.name, industry: saved.industry },
      reason: "관리자 주요 기업 설정",
    });
  });

  revalidatePath("/admin/companies");
  revalidatePath("/admin/economy");
  revalidatePath("/country/economy");
}

export async function saveCompanyScaleStatisticsAction(formData: FormData) {
  const session = await requireRole("ADMIN");
  const countryId = z.string().uuid().parse(formData.get("countryId"));
  const country = await db.query.countries.findFirst({ where: eq(countries.id, countryId) });
  if (!country) throw new Error("국가를 찾을 수 없습니다.");

  const scaleValues = {
    largeEnterpriseCount: String(
      z.coerce.number().int().nonnegative().parse(formData.get("largeEnterpriseCount")),
    ),
    mediumEnterpriseCount: String(
      z.coerce.number().int().nonnegative().parse(formData.get("mediumEnterpriseCount")),
    ),
    smallEnterpriseCount: String(
      z.coerce.number().int().nonnegative().parse(formData.get("smallEnterpriseCount")),
    ),
    updatedAt: new Date(),
  };

  const financialRows = AGGREGATE_COMPANY_CLASSES.map((companyClass) => {
    const totals = Object.fromEntries(
      COMPANY_AGGREGATE_METRICS.map(({ key, kind }) => [
        key,
        decimalValue(formData, companyClassFieldName(companyClass, key), {
          required: true,
          min:
            kind === "people" ||
            !["totalGrossProfit", "totalOperatingProfit", "totalNetIncome"].includes(key)
              ? 0
              : undefined,
        })!,
      ]),
    ) as CompanyAggregateTotals;
    return {
      countryId,
      companyClass,
      ...totals,
      automationProductivityGrowthRate: percentValue(
        formData,
        companyAutomationFieldName(companyClass),
        { min: -100, max: 100 },
      )!,
      updatedAt: new Date(),
    };
  });

  await db.transaction(async (tx) => {
    await tx
      .insert(companyScaleStatistics)
      .values({ countryId, ...scaleValues })
      .onConflictDoUpdate({ target: companyScaleStatistics.countryId, set: scaleValues });
    for (const row of financialRows) {
      const totals = Object.fromEntries(
        COMPANY_AGGREGATE_METRICS.map(({ key }) => [key, row[key]]),
      );
      await tx
        .insert(companyClassFinancials)
        .values(row)
        .onConflictDoUpdate({
          target: [companyClassFinancials.countryId, companyClassFinancials.companyClass],
          set: {
            ...totals,
            automationProductivityGrowthRate: row.automationProductivityGrowthRate,
            updatedAt: row.updatedAt,
          },
        });
    }
    await tx.insert(auditLogs).values({
      campaignId: country.campaignId,
      actorId: session.user.id,
      action: "UPDATE_COMPANY_CLASS_STATISTICS",
      targetType: "COUNTRY_COMPANY_STRUCTURE",
      targetId: countryId,
      afterSummary: { scale: scaleValues, financials: financialRows },
      reason: "관리자 기업 분류별 통계 설정",
    });
  });
  revalidatePath("/admin/companies");
  revalidatePath("/country/economy");
}
