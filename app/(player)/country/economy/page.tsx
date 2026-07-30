import { requireSession } from "@/src/auth/session";
import { getCountryLedger } from "@/src/db/queries/country";
import { getViewerContext } from "@/src/db/queries/viewer";
import { contributionGroupLabel, metricLabel } from "@/src/domain/display-labels";
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
        currency: economic.currencyCode,
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

  const taxRatePercent = ledger.fiscalPolicy
    ? Number(ledger.fiscalPolicy.taxRate) * 100
    : economic && Number(economic.nominalGdp) > 0
      ? (Number(economic.governmentRevenue) / Number(economic.nominalGdp)) * 100
      : 0;

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
        industry: company.industry,
        sizeIndex: company.sizeIndex,
        stateOwned: company.stateOwned,
        health: company.health,
      }))}
      taxRatePercent={taxRatePercent}
      economicSystem={ledger.country.economicSystem}
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
