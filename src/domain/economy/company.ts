import Decimal from "decimal.js";

export const AGGREGATE_COMPANY_CLASSES = ["LARGE", "MEDIUM", "SMALL"] as const;
export type AggregateCompanyClass = (typeof AGGREGATE_COMPANY_CLASSES)[number];
export type CompanyClass = "MAJOR" | AggregateCompanyClass;

export const COMPANY_CLASS_LABELS: Record<CompanyClass, string> = {
  MAJOR: "주요 기업",
  LARGE: "대기업",
  MEDIUM: "중견기업",
  SMALL: "중소기업",
};

export const COMPANY_AGGREGATE_METRICS = [
  { key: "totalRevenue", label: "매출", kind: "money" },
  { key: "totalGrossProfit", label: "매출총이익", kind: "money" },
  { key: "totalOperatingProfit", label: "영업이익", kind: "money" },
  { key: "totalNetIncome", label: "순이익", kind: "money" },
  { key: "totalAssets", label: "총자산", kind: "money" },
  { key: "totalDebt", label: "총부채", kind: "money" },
  { key: "totalEnterpriseValue", label: "기업가치", kind: "money" },
  { key: "totalEmployees", label: "고용인원", kind: "people" },
  { key: "totalResearchAndDevelopmentExpense", label: "연구개발비", kind: "money" },
  { key: "totalCapitalExpenditure", label: "설비투자액", kind: "money" },
] as const;

export type CompanyAggregateMetricKey = (typeof COMPANY_AGGREGATE_METRICS)[number]["key"];
export type CompanyAggregateTotals = Record<CompanyAggregateMetricKey, string>;

export type CompanyClassStatistics = CompanyAggregateTotals & {
  companyClass: CompanyClass;
  enterpriseCount: string;
  automationProductivityGrowthRate: string;
};

export function companyClassFieldName(
  companyClass: AggregateCompanyClass,
  key: CompanyAggregateMetricKey,
) {
  return `${companyClass.toLowerCase()}_${key}`;
}

export function companyAutomationFieldName(companyClass: AggregateCompanyClass) {
  return `${companyClass.toLowerCase()}_automationProductivityGrowthRate`;
}

type MajorCompanyFinancials = {
  revenue: string;
  grossProfit: string;
  operatingProfit: string;
  netIncome: string;
  totalAssets: string;
  totalDebt: string | null;
  enterpriseValue: string;
  employeeCount: string;
  researchAndDevelopmentExpense: string | null;
  capitalExpenditure: string | null;
  automationProductivityGrowthRate: string;
};

const total = (
  companies: MajorCompanyFinancials[],
  select: (company: MajorCompanyFinancials) => string | null,
) => companies.reduce((sum, company) => sum.plus(select(company) ?? 0), new Decimal(0)).toString();

const average = (
  companies: MajorCompanyFinancials[],
  select: (company: MajorCompanyFinancials) => string,
) =>
  companies.length
    ? companies
        .reduce((sum, company) => sum.plus(select(company)), new Decimal(0))
        .div(companies.length)
        .toString()
    : "0";

export function aggregateMajorCompanies(
  companies: MajorCompanyFinancials[],
): CompanyClassStatistics {
  return {
    companyClass: "MAJOR",
    enterpriseCount: String(companies.length),
    automationProductivityGrowthRate: average(
      companies,
      (company) => company.automationProductivityGrowthRate,
    ),
    totalRevenue: total(companies, (company) => company.revenue),
    totalGrossProfit: total(companies, (company) => company.grossProfit),
    totalOperatingProfit: total(companies, (company) => company.operatingProfit),
    totalNetIncome: total(companies, (company) => company.netIncome),
    totalAssets: total(companies, (company) => company.totalAssets),
    totalDebt: total(companies, (company) => company.totalDebt),
    totalEnterpriseValue: total(companies, (company) => company.enterpriseValue),
    totalEmployees: total(companies, (company) => company.employeeCount),
    totalResearchAndDevelopmentExpense: total(
      companies,
      (company) => company.researchAndDevelopmentExpense,
    ),
    totalCapitalExpenditure: total(companies, (company) => company.capitalExpenditure),
  };
}

export function companyMetricAverage(totalValue: string, enterpriseCount: string) {
  const count = new Decimal(enterpriseCount);
  return count.lte(0) ? "0" : new Decimal(totalValue).div(count).toString();
}

export function buildCompanyClassStatistics(
  companies: MajorCompanyFinancials[],
  scale: {
    largeEnterpriseCount: string;
    mediumEnterpriseCount: string;
    smallEnterpriseCount: string;
  } | null,
  financials: Array<
    CompanyAggregateTotals & { companyClass: string; automationProductivityGrowthRate: string }
  >,
): CompanyClassStatistics[] {
  const financialsByClass = new Map(financials.map((row) => [row.companyClass, row]));
  const countByClass: Record<AggregateCompanyClass, string> = {
    LARGE: scale?.largeEnterpriseCount ?? "0",
    MEDIUM: scale?.mediumEnterpriseCount ?? "0",
    SMALL: scale?.smallEnterpriseCount ?? "0",
  };
  const zeroTotals = Object.fromEntries(
    COMPANY_AGGREGATE_METRICS.map(({ key }) => [key, "0"]),
  ) as CompanyAggregateTotals;

  return [
    aggregateMajorCompanies(companies),
    ...AGGREGATE_COMPANY_CLASSES.map((companyClass) => ({
      ...zeroTotals,
      ...financialsByClass.get(companyClass),
      companyClass,
      enterpriseCount: countByClass[companyClass],
      automationProductivityGrowthRate:
        financialsByClass.get(companyClass)?.automationProductivityGrowthRate ?? "0",
    })),
  ];
}
