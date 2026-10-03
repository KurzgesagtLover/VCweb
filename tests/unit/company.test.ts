import { describe, expect, it } from "vitest";
import {
  aggregateMajorCompanies,
  buildCompanyClassStatistics,
  companyMetricAverage,
} from "../../src/domain/economy/company";

const company = (revenue: string, netIncome: string) => ({
  revenue,
  grossProfit: "40",
  operatingProfit: "25",
  netIncome,
  totalAssets: "300",
  totalDebt: "120",
  enterpriseValue: "260",
  employeeCount: "1000",
  researchAndDevelopmentExpense: "12",
  capitalExpenditure: "18",
  automationProductivityGrowthRate: "0.04",
});

describe("company class statistics", () => {
  it("derives major-company totals and averages from registered companies", () => {
    const totals = aggregateMajorCompanies([company("100", "10"), company("200", "30")]);

    expect(totals.enterpriseCount).toBe("2");
    expect(totals.totalRevenue).toBe("300");
    expect(totals.totalNetIncome).toBe("40");
    expect(companyMetricAverage(totals.totalRevenue, totals.enterpriseCount)).toBe("150");
  });

  it("combines stored class totals with the matching company counts", () => {
    const rows = buildCompanyClassStatistics(
      [],
      {
        largeEnterpriseCount: "10",
        mediumEnterpriseCount: "20",
        smallEnterpriseCount: "30",
      },
      [
        {
          companyClass: "LARGE",
          totalRevenue: "1000",
          totalGrossProfit: "300",
          totalOperatingProfit: "200",
          totalNetIncome: "150",
          totalAssets: "2000",
          totalDebt: "800",
          totalEnterpriseValue: "1600",
          totalEmployees: "5000",
          totalResearchAndDevelopmentExpense: "80",
          totalCapitalExpenditure: "120",
          automationProductivityGrowthRate: "0.05",
        },
      ],
    );

    expect(rows.find((row) => row.companyClass === "LARGE")?.enterpriseCount).toBe("10");
    expect(rows.find((row) => row.companyClass === "LARGE")?.totalRevenue).toBe("1000");
    expect(rows.find((row) => row.companyClass === "LARGE")?.automationProductivityGrowthRate).toBe(
      "0.05",
    );
    expect(rows.find((row) => row.companyClass === "SMALL")?.totalRevenue).toBe("0");
  });
});
