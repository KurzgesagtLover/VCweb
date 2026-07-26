import { updateCountryTaxRateAction } from "@/src/actions/economy";
import { requireSession } from "@/src/auth/session";
import { getCountryLedger } from "@/src/db/queries/country";
import { getViewerContext } from "@/src/db/queries/viewer";
import { contributionGroupLabel, metricLabel } from "@/src/domain/display-labels";
import { RememberedDisclosure } from "@/src/ui/disclosure";
import { formatDecimal, formatMoney, formatPercent } from "@/src/ui/format";
import { DataList, MetricCard } from "@/src/ui/metric-card";
import { PageHead } from "@/src/ui/page-head";
import { TrendBars } from "@/src/ui/trend-bars";

export const metadata = { title: "경제" };

export default async function EconomyPage() {
  const session = await requireSession();
  const context = await getViewerContext(session.user.id);
  if (!context.country) return null;
  const ledger = await getCountryLedger(context.country.id);
  if (!ledger) return null;
  const e = ledger.economic;
  const d = ledger.demographic;
  const perCapita = e && d ? (Number(e.realGdp) * 1_000_000) / Number(d.population) : null;
  const currentTaxRate = ledger.fiscalPolicy
    ? Number(ledger.fiscalPolicy.taxRate) * 100
    : e && Number(e.nominalGdp) > 0
      ? (Number(e.governmentRevenue) / Number(e.nominalGdp)) * 100
      : 0;
  const details: Array<[string, React.ReactNode]> = e
    ? [
        ["명목 GDP", formatMoney(e.nominalGdp, e.currencyCode)],
        ["GDP 디플레이터", formatDecimal(e.gdpDeflator, 3)],
        ["실질 GNI", formatMoney(e.realGni, e.currencyCode)],
        ["실질 GNP", formatMoney(e.realGnp, e.currencyCode)],
        ["국부", formatMoney(e.wealth, e.currencyCode)],
        ["소득 지니계수", formatDecimal(e.incomeGini, 3)],
        ["자산 지니계수", formatDecimal(e.wealthGini, 3)],
        ["토지가 변동률", formatPercent(e.landPriceGrowth)],
        ["정부지출 증가율", formatPercent(e.governmentSpendingGrowth)],
        ["재정수지", formatMoney(e.fiscalBalance, e.currencyCode)],
        ["국가채무", formatMoney(e.nationalDebt, e.currencyCode)],
        ["기준금리", formatPercent(e.policyRate)],
        ["경상수지/GDP", formatPercent(e.currentAccountToGdp)],
        ["생산성 지수", formatDecimal(e.productivityIndex, 1)],
        ["계산 규칙", e.rulesVersion],
      ]
    : [];
  return (
    <div className="section-stack">
      <PageHead
        eyebrow="COUNTRY LEDGER / ECONOMY"
        title="경제 원장"
        description="금액은 백만 단위이며, 실질 값은 표기된 기준연도 가격을 사용합니다."
        aside={<span className="status-pill">기준연도 {e?.referenceYear ?? "—"}</span>}
      />
      <section className="metric-grid">
        <MetricCard label="실질 GDP" value={formatMoney(e?.realGdp, e?.currencyCode)} />
        <MetricCard
          label="1인당 GDP"
          value={perCapita ? `${formatDecimal(perCapita, 0)} ${e?.currencyCode}` : "—"}
        />
        <MetricCard label="실질 GDP 성장률" value={formatPercent(e?.realGdpGrowth)} />
        <MetricCard label="소비자물가 변동률" value={formatPercent(e?.inflationRate)} />
        <MetricCard label="실업률" value={formatPercent(e?.unemploymentRate)} />
        <MetricCard label="정부지출" value={formatMoney(e?.governmentSpending, e?.currencyCode)} />
        <MetricCard label="GDP 대비 부채율" value={formatPercent(e?.debtToGdp)} />
        <MetricCard label="외환보유고" value={formatMoney(e?.foreignReserves, e?.currencyCode)} />
        <MetricCard
          label="화폐가치"
          value={e ? formatDecimal(e.currencyValue, 4) : "—"}
          meta={e?.currencyCode}
        />
        <MetricCard
          label="국가신용등급"
          value={e?.creditRating}
          meta={`환산 점수 ${e?.creditScore ?? "—"}`}
        />
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>최근 8턴 성장률</h2>
          <span className="eyebrow">REAL / YOY</span>
        </div>
        <TrendBars
          rows={ledger.economicTrend.map((row) => ({
            label: `T${row.turnSequence}`,
            value: row.snapshot.realGdpGrowth,
          }))}
        />
      </section>
      <section className="panel settings-panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">FISCAL POLICY</span>
            <h2>세율</h2>
          </div>
          <span className="status-pill">{currentTaxRate.toFixed(1)}%</span>
        </div>
        <form action={updateCountryTaxRateAction} className="inline-setting-form">
          <label>
            세율 (%)
            <input
              type="number"
              name="taxRate"
              min="0"
              max="75"
              step="0.1"
              defaultValue={currentTaxRate.toFixed(1)}
              required
            />
          </label>
          <button type="submit">세율 저장</button>
        </form>
      </section>
      <RememberedDisclosure storageKey="country-economy-details" title="세부 지표 보기">
        <DataList items={details} />
      </RememberedDisclosure>
      <RememberedDisclosure storageKey="country-economy-basis" title="계산 근거 보기">
        {e && Object.keys(e.contributions).length ? (
          <div className="section-stack">
            {Object.entries(e.contributions).map(([output, items]) => (
              <article key={output}>
                <h3>{contributionGroupLabel(output)}</h3>
                <DataList
                  items={items.map((item) => [
                    metricLabel(item.source),
                    `${item.value} · ${item.explanation}`,
                  ])}
                />
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            현재 스냅샷에는 기여도 기록이 없습니다. 다음 계산 턴부터 규칙 버전과 함께 저장됩니다.
          </div>
        )}
      </RememberedDisclosure>
    </div>
  );
}
