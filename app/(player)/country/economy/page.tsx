import { requireSession } from "@/src/auth/session";
import { getCountryLedger } from "@/src/db/queries/country";
import { getViewerContext } from "@/src/db/queries/viewer";
import { contributionGroupLabel, metricLabel } from "@/src/domain/display-labels";
import {
  BUDGET_PRESETS,
  getBudgetPresetContext,
  isBudgetPresetId,
  validateBudgetAllocation,
  type BudgetAllocation,
} from "@/src/domain/economy/budget";
import { ECONOMY_STATISTICS_CURRENCY } from "@/src/domain/economy/currency";
import { buildCompanyClassStatistics } from "@/src/domain/economy/company";
import { TnoEconomyWindow } from "@/src/ui/tno-economy-window";

export const metadata = { title: "경제" };

export default async function EconomyPage() {
  const session = await requireSession();
  const context = await getViewerContext(session.user.id);
  if (!context.country) return null;
  const ledger = await getCountryLedger(context.country.id);
  if (!ledger) return null;

  const economic = ledger.economic;
  const demographic = ledger.demographic;
  const trendRows = ledger.economicTrend;
  const previousNominal =
    trendRows.length > 1 ? Number(trendRows.at(-2)!.snapshot.nominalGdp) : null;
  const nominalGdpGrowth =
    economic && previousNominal
      ? (Number(economic.nominalGdp) - previousNominal) / previousNominal
      : null;

  const snapshot = economic
    ? {
        currency: ECONOMY_STATISTICS_CURRENCY,
        referenceYear: economic.referenceYear,
        rulesVersion: economic.rulesVersion,
        realGdp: Number(economic.realGdp),
        nominalGdp: Number(economic.nominalGdp),
        realGdpGrowth: Number(economic.realGdpGrowth),
        nominalGdpGrowth,
        gdpDeflator: Number(economic.gdpDeflator),
        inflationRate: Number(economic.inflationRate),
        unemploymentRate: Number(economic.unemploymentRate),
        governmentRevenue: Number(economic.governmentRevenue),
        governmentSpending: Number(economic.governmentSpending),
        governmentSpendingGrowth: Number(economic.governmentSpendingGrowth),
        fiscalBalance: Number(economic.fiscalBalance),
        nationalDebt: Number(economic.nationalDebt),
        debtToGdp: Number(economic.debtToGdp),
        policyRate: Number(economic.policyRate),
        foreignReserves: Number(economic.foreignReserves),
        currencyValue: Number(economic.currencyValue),
        creditRating: economic.creditRating,
        creditScore: economic.creditScore,
        incomeGini: Number(economic.incomeGini),
        wealthGini: Number(economic.wealthGini),
        currentAccountToGdp: Number(economic.currentAccountToGdp),
        productivityIndex: Number(economic.productivityIndex),
        povertyRate: Number(economic.povertyRate),
        agriculturalProductivityIndex: Number(economic.agriculturalProductivityIndex),
        foodSelfSufficiency: Number(economic.foodSelfSufficiency),
        industrialCapitalStockIndex: Number(economic.industrialCapitalStockIndex),
        researchCapacityIndex: Number(economic.researchCapacityIndex),
        wealth: Number(economic.wealth),
        realGni: Number(economic.realGni),
        realGnp: Number(economic.realGnp),
        landPriceGrowth: Number(economic.landPriceGrowth),
      }
    : null;

  const perCapitaGdp =
    economic && demographic && Number(demographic.population) > 0
      ? (Number(economic.realGdp) * 1_000_000) / Number(demographic.population)
      : null;

  const fallbackTaxRatePercent =
    economic && Number(economic.nominalGdp) > 0
      ? (Number(economic.governmentRevenue) / Number(economic.nominalGdp)) * 100
      : 0;
  const taxRatesPercent = ledger.fiscalPolicy
    ? {
        incomeTaxRate: Number(ledger.fiscalPolicy.incomeTaxRate) * 100,
        corporateTaxRate: Number(ledger.fiscalPolicy.corporateTaxRate) * 100,
        otherTaxRate: Number(ledger.fiscalPolicy.otherTaxRate) * 100,
      }
    : {
        incomeTaxRate: fallbackTaxRatePercent,
        corporateTaxRate: fallbackTaxRatePercent,
        otherTaxRate: fallbackTaxRatePercent,
      };
  const governingParty =
    ledger.parties.find(({ snapshot: partySnapshot }) => partySnapshot?.isGovernment) ??
    ledger.parties[0];
  const budgetContext = getBudgetPresetContext({
    economicSystem: ledger.country.economicSystem,
    economicAxis: governingParty?.party.economicAxis ?? null,
    socialAxis: governingParty?.party.socialAxis ?? null,
  });
  const storedPreset = isBudgetPresetId(ledger.fiscalPolicy?.budgetPreset)
    ? ledger.fiscalPolicy.budgetPreset
    : null;
  const storedAllocation: BudgetAllocation | null = ledger.fiscalPolicy
    ? {
        budgetDefense: ledger.fiscalPolicy.budgetDefense,
        budgetAdministration: ledger.fiscalPolicy.budgetAdministration,
        budgetIndustry: ledger.fiscalPolicy.budgetIndustry,
        budgetEducation: ledger.fiscalPolicy.budgetEducation,
        budgetWelfare: ledger.fiscalPolicy.budgetWelfare,
        budgetDiplomacy: ledger.fiscalPolicy.budgetDiplomacy,
      }
    : null;
  const useStoredBudget =
    storedPreset !== null &&
    budgetContext.allowed.includes(storedPreset) &&
    storedAllocation !== null &&
    validateBudgetAllocation(storedPreset, storedAllocation);
  const budgetPreset = useStoredBudget ? storedPreset : budgetContext.recommended;
  const budgetAllocation = useStoredBudget
    ? storedAllocation
    : { ...BUDGET_PRESETS[budgetContext.recommended].allocation };
  const companyClassStatistics = buildCompanyClassStatistics(
    ledger.companies,
    ledger.companyScale ?? null,
    ledger.companyFinancials,
  );

  return (
    <TnoEconomyWindow
      snapshot={snapshot}
      trend={trendRows.map((row) => ({
        turn: row.turnSequence,
        label: `T${row.turnSequence}`,
        nominalGdp: Number(row.snapshot.nominalGdp),
        inflation: Number(row.snapshot.inflationRate),
        debtToGdp: Number(row.snapshot.debtToGdp),
        realGdpGrowth: Number(row.snapshot.realGdpGrowth),
        unemployment: Number(row.snapshot.unemploymentRate),
      }))}
      demographic={
        demographic
          ? {
              population: Number(demographic.population),
              medianAge: Number(demographic.medianAge),
              lifeExpectancy: Number(demographic.lifeExpectancy),
              fertilityRate: Number(demographic.fertilityRate),
              populationGrowthRate: Number(demographic.populationGrowthRate),
              populationDensity: Number(demographic.populationDensity),
            }
          : null
      }
      sectors={ledger.sectors.map((sector) => ({
        code: sector.code,
        name: sector.name,
        share: Number(sector.share),
        growthRate: Number(sector.growthRate),
        productivity: Number(sector.productivity),
      }))}
      institutions={ledger.institutions.map((institution) => ({
        id: institution.id,
        name: institution.name,
        health: institution.health,
        systemicImportance: institution.systemicImportance,
      }))}
      companies={ledger.companies.map((company) => ({
        id: company.id,
        name: company.name,
        logo: company.logo,
        slogan: company.slogan,
        abbreviation: company.abbreviation,
        founded: company.founded,
        history: company.history,
        legalForm: company.legalForm,
        headquarters: company.headquarters,
        placeOfFoundation: company.placeOfFoundation,
        chiefExecutiveOfficer: company.chiefExecutiveOfficer,
        boardChair: company.boardChair,
        parentCompany: company.parentCompany,
        largestShareholder: company.largestShareholder,
        majorShareholders: company.majorShareholders,
        subsidiaries: company.subsidiaries,
        affiliates: company.affiliates,
        employeeCount: Number(company.employeeCount),
        indirectEmployment:
          company.indirectEmployment === null ? null : Number(company.indirectEmployment),
        overseasEmployees:
          company.overseasEmployees === null ? null : Number(company.overseasEmployees),
        averageSalary: company.averageSalary === null ? null : Number(company.averageSalary),
        unionMembershipRate:
          company.unionMembershipRate === null ? null : Number(company.unionMembershipRate),
        revenue: Number(company.revenue),
        grossProfit: Number(company.grossProfit),
        operatingProfit: Number(company.operatingProfit),
        netIncome: Number(company.netIncome),
        totalAssets: Number(company.totalAssets),
        totalDebt: company.totalDebt === null ? null : Number(company.totalDebt),
        enterpriseValue: Number(company.enterpriseValue),
        marketCapitalization:
          company.marketCapitalization === null ? null : Number(company.marketCapitalization),
        creditRating: company.creditRating,
        researchAndDevelopmentExpense:
          company.researchAndDevelopmentExpense === null
            ? null
            : Number(company.researchAndDevelopmentExpense),
        capitalExpenditure:
          company.capitalExpenditure === null ? null : Number(company.capitalExpenditure),
        cashAndEquivalents:
          company.cashAndEquivalents === null ? null : Number(company.cashAndEquivalents),
        dividendsPaid: company.dividendsPaid === null ? null : Number(company.dividendsPaid),
        debtRatio: company.debtRatio === null ? null : Number(company.debtRatio),
        operatingMargin: company.operatingMargin === null ? null : Number(company.operatingMargin),
        automationProductivityGrowthRate: Number(company.automationProductivityGrowthRate),
        industry: company.industry,
        productsAndServices: company.productsAndServices,
        brands: company.brands,
        productionFacilities: company.productionFacilities,
        researchFacilities: company.researchFacilities,
        overseasBases: company.overseasBases,
        majorMarkets: company.majorMarkets,
        competitors: company.competitors,
        isListed: company.isListed,
        stockExchange: company.stockExchange,
        tickerSymbol: company.tickerSymbol,
        sharesOutstanding:
          company.sharesOutstanding === null ? null : Number(company.sharesOutstanding),
        sharePrice: company.sharePrice === null ? null : Number(company.sharePrice),
        dividendYield: company.dividendYield === null ? null : Number(company.dividendYield),
        sizeIndex: company.sizeIndex,
        stateOwned: company.stateOwned,
        systemicImportance: company.systemicImportance,
        health: company.health,
      }))}
      companyClassStatistics={companyClassStatistics.map((row) => ({
        companyClass: row.companyClass,
        enterpriseCount: Number(row.enterpriseCount),
        totalRevenue: Number(row.totalRevenue),
        totalGrossProfit: Number(row.totalGrossProfit),
        totalOperatingProfit: Number(row.totalOperatingProfit),
        totalNetIncome: Number(row.totalNetIncome),
        totalAssets: Number(row.totalAssets),
        totalDebt: Number(row.totalDebt),
        totalEnterpriseValue: Number(row.totalEnterpriseValue),
        totalEmployees: Number(row.totalEmployees),
        totalResearchAndDevelopmentExpense: Number(row.totalResearchAndDevelopmentExpense),
        totalCapitalExpenditure: Number(row.totalCapitalExpenditure),
        automationProductivityGrowthRate: Number(row.automationProductivityGrowthRate),
      }))}
      taxRatesPercent={taxRatesPercent}
      economicSystem={ledger.country.economicSystem}
      budgetPolicy={{
        ideologyLabel: budgetContext.ideologyLabel,
        allowedPresets: budgetContext.allowed,
        preset: budgetPreset,
        allocation: budgetAllocation,
      }}
      perCapitaGdp={perCapitaGdp}
      contributions={Object.entries(economic?.contributions ?? {}).map(([group, items]) => ({
        group: contributionGroupLabel(group),
        items: items.map((item) => ({
          source: metricLabel(item.source),
          detail: `${item.value} · ${item.explanation}`,
        })),
      }))}
    />
  );
}
