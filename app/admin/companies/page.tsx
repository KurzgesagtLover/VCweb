import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { saveCompanyScaleStatisticsAction } from "@/src/actions/company";
import { requireRole } from "@/src/auth/session";
import { db } from "@/src/db";
import {
  companyClassFinancials,
  companyScaleStatistics,
  countries,
  majorCompanies,
} from "@/src/db/schema";
import { getViewerContext } from "@/src/db/queries/viewer";
import {
  AGGREGATE_COMPANY_CLASSES,
  COMPANY_AGGREGATE_METRICS,
  COMPANY_CLASS_LABELS,
  companyAutomationFieldName,
  companyClassFieldName,
} from "@/src/domain/economy/company";
import { AdminCompanyForm } from "@/src/ui/admin-company-form";
import { PageHead } from "@/src/ui/page-head";

export const metadata = { title: "기업 관리" };

export default async function AdminCompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ country?: string; company?: string }>;
}) {
  const session = await requireRole("ADMIN");
  const context = await getViewerContext(session.user.id);
  if (!context.campaign) return null;
  const params = await searchParams;
  const countryRows = await db.query.countries.findMany({
    where: eq(countries.campaignId, context.campaign.id),
    orderBy: [asc(countries.name)],
  });
  const selectedCountry =
    countryRows.find((country) => country.id === params.country) ?? countryRows[0] ?? null;
  if (!selectedCountry) {
    return (
      <PageHead
        eyebrow="ADMIN / COMPANIES"
        title="기업 관리"
        description="국가를 먼저 등록해야 합니다."
      />
    );
  }

  const [companyRows, scale, classFinancialRows] = await Promise.all([
    db.query.majorCompanies.findMany({
      where: eq(majorCompanies.countryId, selectedCountry.id),
      orderBy: [asc(majorCompanies.name)],
    }),
    db.query.companyScaleStatistics.findFirst({
      where: eq(companyScaleStatistics.countryId, selectedCountry.id),
    }),
    db.query.companyClassFinancials.findMany({
      where: eq(companyClassFinancials.countryId, selectedCountry.id),
      orderBy: [asc(companyClassFinancials.companyClass)],
    }),
  ]);
  const selectedCompany = companyRows.find((company) => company.id === params.company) ?? null;
  const financialsByClass = new Map(
    classFinancialRows.map((row) => [row.companyClass, row] as const),
  );

  return (
    <div className="section-stack">
      <PageHead
        eyebrow="ADMIN / COMPANIES"
        title="기업 관리"
        description="주요 기업과 기업 규모별 현황을 관리합니다."
        aside={<span className="status-pill">{selectedCountry.name}</span>}
      />

      <section className="panel company-country-picker">
        {countryRows.map((country) => (
          <Link
            key={country.id}
            href={`/admin/companies?country=${country.id}`}
            className={country.id === selectedCountry.id ? "active" : ""}
          >
            {country.name}
          </Link>
        ))}
      </section>

      <section className="panel settings-panel">
        <div className="panel-head">
          <h2>기업 규모별 현황</h2>
          <span className="status-pill">주요 기업 {companyRows.length}개</span>
        </div>
        <form action={saveCompanyScaleStatisticsAction} className="company-class-stat-form">
          <input type="hidden" name="countryId" value={selectedCountry.id} />
          {AGGREGATE_COMPANY_CLASSES.map((companyClass) => {
            const financials = financialsByClass.get(companyClass);
            const countName =
              companyClass === "LARGE"
                ? "largeEnterpriseCount"
                : companyClass === "MEDIUM"
                  ? "mediumEnterpriseCount"
                  : "smallEnterpriseCount";
            return (
              <fieldset key={companyClass}>
                <legend>{COMPANY_CLASS_LABELS[companyClass]}</legend>
                <div className="form-grid">
                  <label>
                    기업 수
                    <input
                      name={countName}
                      type="number"
                      min="0"
                      defaultValue={scale?.[countName] ?? "0"}
                      required
                    />
                  </label>
                  {COMPANY_AGGREGATE_METRICS.map(({ key, label, kind }) => (
                    <label key={key}>
                      총 {label}
                      {kind === "money" ? " (백만 USD)" : ""}
                      <input
                        name={companyClassFieldName(companyClass, key)}
                        type="number"
                        min={
                          kind === "people" ||
                          !["totalGrossProfit", "totalOperatingProfit", "totalNetIncome"].includes(
                            key,
                          )
                            ? 0
                            : undefined
                        }
                        step={kind === "people" ? 1 : 0.01}
                        defaultValue={financials?.[key] ?? "0"}
                        required
                      />
                    </label>
                  ))}
                  <label>
                    자동화 생산성 증가율 (%)
                    <input
                      name={companyAutomationFieldName(companyClass)}
                      type="number"
                      min="-100"
                      max="100"
                      step="0.1"
                      defaultValue={Number(financials?.automationProductivityGrowthRate ?? 0) * 100}
                      required
                    />
                  </label>
                </div>
              </fieldset>
            );
          })}
          <div className="inline-actions">
            <button type="submit">현황 저장</button>
          </div>
        </form>
      </section>

      <div className="company-admin-layout">
        <section className="panel company-admin-list">
          <div className="panel-head">
            <h2>주요 기업</h2>
            <Link href={`/admin/companies?country=${selectedCountry.id}`}>신규 등록</Link>
          </div>
          {companyRows.length ? (
            companyRows.map((company) => (
              <Link
                key={company.id}
                href={`/admin/companies?country=${selectedCountry.id}&company=${company.id}`}
                className={selectedCompany?.id === company.id ? "active" : ""}
              >
                <span className="company-admin-logo">
                  {company.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={company.logo} alt="" />
                  ) : (
                    company.name.slice(0, 1)
                  )}
                </span>
                <span>
                  <strong>{company.name}</strong>
                  <small>{company.industry}</small>
                </span>
              </Link>
            ))
          ) : (
            <div className="empty-state">등록된 주요 기업이 없습니다.</div>
          )}
        </section>

        <section className="panel company-admin-editor">
          <div className="panel-head">
            <h2>{selectedCompany ? selectedCompany.name : "주요 기업 등록"}</h2>
          </div>
          <AdminCompanyForm countryId={selectedCountry.id} company={selectedCompany} />
        </section>
      </div>
    </div>
  );
}
