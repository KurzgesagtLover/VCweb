import Decimal from "decimal.js";
import Link from "next/link";
import { createEconomicChangeSetAction } from "@/src/actions/admin";
import type { getCountryLedger } from "@/src/db/queries/country";
import { contributionGroupLabel, metricLabel } from "@/src/domain/display-labels";
import type { EconomyInput, EconomyRules } from "@/src/domain/economy/calculator";
import { AdminEconomySimulator } from "./admin-economy-simulator";
import { EconomicTrendCharts, type EconomicTrendPoint } from "./economic-trend-charts";
import { formatDecimal, formatMoney, formatPercent } from "./format";

type Ledger = NonNullable<Awaited<ReturnType<typeof getCountryLedger>>>;
export type EconomyDetailTab = "overview" | "fiscal" | "industry" | "trend" | "simulate" | "edit";

const tabs: Array<[EconomyDetailTab, string]> = [
  ["overview", "핵심 지표"],
  ["fiscal", "재정·금융"],
  ["industry", "산업·기업"],
  ["trend", "상세 그래프"],
  ["simulate", "모의실험"],
  ["edit", "편집기"],
];

function DataList({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="data-list ledger-data-list">
      {rows.map(([label, value]) => (
        <div className="data-row" key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function perCapita(value: string, population: string | null | undefined, currency: string) {
  if (!population || new Decimal(population).isZero()) return "—";
  return `${formatDecimal(new Decimal(value).mul(1_000_000).div(population).toString(), 0)} ${currency}`;
}

function buildEconomicTrendPoints(ledger: Ledger): EconomicTrendPoint[] {
  return ledger.economicTrend.map((row, index, rows) => {
    const economy = row.snapshot;
    const demographic = row.demographic;
    const previous = rows[index - 1];
    const previousEconomy = previous?.snapshot;
    const previousDemographic = previous?.demographic;
    const nominalGdp = new Decimal(economy.nominalGdp);
    const realGdp = new Decimal(economy.realGdp);
    const population = demographic ? new Decimal(demographic.population) : null;
    const previousPopulation = previousDemographic
      ? new Decimal(previousDemographic.population)
      : null;
    const nominalGdpGrowth =
      previousEconomy && !new Decimal(previousEconomy.nominalGdp).isZero()
        ? nominalGdp.div(previousEconomy.nominalGdp).minus(1).mul(100).toNumber()
        : null;
    const perCapitaGdpGrowth =
      previousEconomy &&
      population &&
      previousPopulation &&
      !population.isZero() &&
      !previousPopulation.isZero() &&
      !new Decimal(previousEconomy.realGdp).isZero()
        ? realGdp
            .div(population)
            .div(new Decimal(previousEconomy.realGdp).div(previousPopulation))
            .minus(1)
            .mul(100)
            .toNumber()
        : null;
    const fertilityRate = demographic ? new Decimal(demographic.fertilityRate).toNumber() : null;

    return {
      turn: row.turnSequence,
      gameDate: row.gameDate,
      nominalGdpGrowth,
      gdpDeflator: new Decimal(economy.gdpDeflator).mul(100).toNumber(),
      realGdpGrowth: new Decimal(economy.realGdpGrowth).mul(100).toNumber(),
      populationGrowth: demographic
        ? new Decimal(demographic.populationGrowthRate).mul(100).toNumber()
        : null,
      perCapitaGdpGrowth,
      realGdp: realGdp.toNumber(),
      nominalGdp: nominalGdp.toNumber(),
      realGni: new Decimal(economy.realGni).toNumber(),
      nominalGni: new Decimal(economy.realGni).mul(economy.gdpDeflator).toNumber(),
      realGnp: new Decimal(economy.realGnp).toNumber(),
      unemployment: new Decimal(economy.unemploymentRate).mul(100).toNumber(),
      inflation: new Decimal(economy.inflationRate).mul(100).toNumber(),
      governmentSpending: new Decimal(economy.governmentSpending).toNumber(),
      governmentSpendingToGdp: nominalGdp.isZero()
        ? null
        : new Decimal(economy.governmentSpending).div(nominalGdp).mul(100).toNumber(),
      population: population?.toNumber() ?? null,
      crudeBirthRate: fertilityRate === null ? null : fertilityRate * 7.2,
      fertilityRate,
    };
  });
}

function weightedValue(
  rows: Array<{ value: Decimal.Value; weight: Decimal.Value }>,
  fallback: Decimal.Value,
) {
  const totalWeight = rows.reduce((sum, row) => sum.plus(row.weight), new Decimal(0));
  if (totalWeight.isZero()) return new Decimal(fallback).toString();
  return rows
    .reduce((sum, row) => sum.plus(new Decimal(row.value).mul(row.weight)), new Decimal(0))
    .div(totalWeight)
    .toString();
}

function buildSimulatorInput(ledger: Ledger): EconomyInput | null {
  const economy = ledger.economic;
  const demographic = ledger.demographic;
  if (!economy || !demographic) return null;
  const inputs = new Map(
    ledger.economicInputs.map((input) => [input.metric, input.value] as const),
  );
  const inputValue = (metric: string, fallback: string) => inputs.get(metric) ?? fallback;
  const previousSpending = ledger.economicTrend.at(-2)?.snapshot.governmentSpending;
  const spendingGrowth = new Decimal(economy.governmentSpendingGrowth || 0);
  const spendingDenominator = new Decimal(1).plus(spendingGrowth);
  const derivedPreviousSpending = spendingDenominator.lte(0)
    ? economy.governmentSpending
    : new Decimal(economy.governmentSpending).div(spendingDenominator).toString();

  return {
    population: demographic.population,
    fertilityRate: demographic.fertilityRate,
    populationGrowthRate: demographic.populationGrowthRate,
    medianAge: demographic.medianAge,
    lifeExpectancy: demographic.lifeExpectancy,
    migrationShock: inputValue("migrationShock", "0"),
    realGdp: economy.realGdp,
    nominalGdp: economy.nominalGdp,
    realGdpGrowth: economy.realGdpGrowth,
    gdpDeflator: economy.gdpDeflator,
    realGni: economy.realGni,
    realGnp: economy.realGnp,
    wealth: economy.wealth,
    foreignReserves: economy.foreignReserves,
    currencyValue: economy.currencyValue,
    creditScore: String(economy.creditScore),
    incomeGini: economy.incomeGini,
    wealthGini: economy.wealthGini,
    inflationRate: economy.inflationRate,
    landPriceGrowth: economy.landPriceGrowth,
    unemploymentRate: economy.unemploymentRate,
    governmentRevenue: economy.governmentRevenue,
    governmentSpending: economy.governmentSpending,
    previousGovernmentSpending: previousSpending ?? derivedPreviousSpending,
    nationalDebt: economy.nationalDebt,
    policyRate: economy.policyRate,
    currentAccountToGdp: economy.currentAccountToGdp,
    productivityIndex: economy.productivityIndex,
    educationIndex: inputValue("educationIndex", "0.7"),
    researchInvestmentRate: inputValue("researchInvestmentRate", "0.025"),
    stateCapacity: String(ledger.political?.stateCapacity ?? 50),
    structuralReform: inputValue("structuralReform", "0"),
    externalShock: inputValue("externalShock", "0"),
    sectorShareWeightedGrowth: weightedValue(
      ledger.sectors.map((sector) => ({ value: sector.growthRate, weight: sector.share })),
      economy.realGdpGrowth,
    ),
    sectorProductivity: weightedValue(
      ledger.sectors.map((sector) => ({ value: sector.productivity, weight: sector.share })),
      economy.productivityIndex,
    ),
    financialHealth: weightedValue(
      ledger.institutions.map((institution) => ({
        value: institution.health,
        weight: Math.max(institution.systemicImportance, 1),
      })),
      economy.creditScore,
    ),
    corporateHealth: weightedValue(
      ledger.companies.map((company) => ({
        value: company.health,
        weight: Math.max(company.systemicImportance, 1),
      })),
      economy.creditScore,
    ),
  };
}

function EconomicEditor({ ledger }: { ledger: Ledger }) {
  const economy = ledger.economic!;
  const groups: Array<[string, Array<keyof typeof economy>]> = [
    [
      "국민계정",
      ["realGdp", "nominalGdp", "realGdpGrowth", "gdpDeflator", "realGni", "realGnp", "wealth"],
    ],
    [
      "통화·신용",
      [
        "foreignReserves",
        "currencyCode",
        "currencyValue",
        "creditRating",
        "creditRatingAgency",
        "creditScore",
        "policyRate",
      ],
    ],
    [
      "물가·고용·분배",
      ["incomeGini", "wealthGini", "inflationRate", "landPriceGrowth", "unemploymentRate"],
    ],
    [
      "재정·대외·생산성",
      [
        "governmentRevenue",
        "governmentSpending",
        "nationalDebt",
        "currentAccountToGdp",
        "productivityIndex",
        "referenceYear",
        "priceBasis",
        "scale",
      ],
    ],
  ];
  const textFields = new Set([
    "currencyCode",
    "creditRating",
    "creditRatingAgency",
    "priceBasis",
    "scale",
  ]);
  return (
    <form action={createEconomicChangeSetAction} className="economy-editor">
      <input type="hidden" name="countryId" value={ledger.country.id} />
      {groups.map(([title, fields]) => (
        <fieldset key={title}>
          <legend>{title}</legend>
          <div className="form-grid">
            {fields.map((field) => (
              <label key={String(field)}>
                {metricLabel(String(field))}
                <input
                  name={String(field)}
                  type={textFields.has(String(field)) ? "text" : "number"}
                  step={textFields.has(String(field)) ? undefined : "any"}
                  defaultValue={String(economy[field] ?? "")}
                  required
                />
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <div className="derived-strip">
        <span>자동 계산</span>
        <strong>재정수지 {formatMoney(economy.fiscalBalance, economy.currencyCode)}</strong>
        <strong>부채비율 {formatPercent(economy.debtToGdp)}</strong>
        <strong>지출증가율 {formatPercent(economy.governmentSpendingGrowth)}</strong>
      </div>
      <label>
        변경 사유
        <textarea name="reason" minLength={10} maxLength={1000} required />
      </label>
      <button type="submit">변경안 만들기</button>
    </form>
  );
}

export function EconomicLedgerDetail({
  ledger,
  tab,
  economyRules,
}: {
  ledger: Ledger;
  tab: EconomyDetailTab;
  economyRules: EconomyRules;
}) {
  const economy = ledger.economic;
  if (!economy) return <div className="empty-state">경제 스냅샷이 없습니다.</div>;
  const demographic = ledger.demographic;
  const currency = economy.currencyCode;
  const contributionGroups = Object.entries(economy.contributions ?? {});
  const trendPoints = buildEconomicTrendPoints(ledger);
  const simulatorInput = buildSimulatorInput(ledger);

  return (
    <section className="panel" id="economic-detail">
      <div className="panel-head economy-detail-head">
        <div>
          <span className="eyebrow">COUNTRY ECONOMIC LEDGER</span>
          <h2>{ledger.country.name}</h2>
        </div>
        <span className="status-pill">T{ledger.economicTrend.at(-1)?.turnSequence}</span>
      </div>
      <nav className="ledger-tabs" aria-label="경제 상세 설정" role="tablist">
        {tabs.map(([value, label]) => (
          <Link
            key={value}
            href={`/admin/economy?country=${ledger.country.id}&tab=${value}#economic-detail`}
            role="tab"
            aria-selected={tab === value}
            className={tab === value ? "active" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>

      {tab === "overview" && (
        <div className="ledger-tab-panel" role="tabpanel">
          <h3>인구·국민계정</h3>
          <DataList
            rows={[
              ["인구", demographic ? `${formatDecimal(demographic.population, 0)}명` : "—"],
              [
                "해외 국민",
                demographic ? `${formatDecimal(demographic.citizensAbroad, 0)}명` : "—",
              ],
              [
                "외국인 거주자",
                demographic ? `${formatDecimal(demographic.foreignResidents, 0)}명` : "—",
              ],
              ["재외동포", demographic ? `${formatDecimal(demographic.diaspora, 0)}명` : "—"],
              ["합계출산율", demographic ? formatDecimal(demographic.fertilityRate, 2) : "—"],
              ["인구 성장률", formatPercent(demographic?.populationGrowthRate)],
              ["중위 연령", demographic ? `${formatDecimal(demographic.medianAge, 1)}세` : "—"],
              ["기대수명", demographic ? `${formatDecimal(demographic.lifeExpectancy, 1)}세` : "—"],
              [
                "인구 밀도",
                demographic ? `${formatDecimal(demographic.populationDensity, 1)}명/㎢` : "—",
              ],
              ["실질 GDP", formatMoney(economy.realGdp, currency)],
              ["명목 GDP", formatMoney(economy.nominalGdp, currency)],
              ["1인당 실질 GDP", perCapita(economy.realGdp, demographic?.population, currency)],
              ["실질 GDP 성장률", formatPercent(economy.realGdpGrowth)],
              ["GDP 디플레이터", formatDecimal(economy.gdpDeflator, 4)],
              ["실질 GNI", formatMoney(economy.realGni, currency)],
              ["1인당 실질 GNI", perCapita(economy.realGni, demographic?.population, currency)],
              ["실질 GNP", formatMoney(economy.realGnp, currency)],
              ["국부", formatMoney(economy.wealth, currency)],
            ]}
          />
          <h3>물가·고용·분배</h3>
          <DataList
            rows={[
              ["소득 지니계수", formatDecimal(economy.incomeGini, 3)],
              ["자산 지니계수", formatDecimal(economy.wealthGini, 3)],
              ["소비자물가 상승률", formatPercent(economy.inflationRate)],
              ["토지가격 상승률", formatPercent(economy.landPriceGrowth)],
              ["실업률", formatPercent(economy.unemploymentRate)],
              ["생산성 지수", formatDecimal(economy.productivityIndex, 2)],
              ["기준 연도", economy.referenceYear],
              ["가격 기준", economy.priceBasis],
            ]}
          />
        </div>
      )}

      {tab === "fiscal" && (
        <div className="ledger-tab-panel" role="tabpanel">
          <DataList
            rows={[
              ["정부 수입", formatMoney(economy.governmentRevenue, currency)],
              ["정부 지출", formatMoney(economy.governmentSpending, currency)],
              ["정부 지출 증가율", formatPercent(economy.governmentSpendingGrowth)],
              ["재정 수지", formatMoney(economy.fiscalBalance, currency)],
              ["국가 부채", formatMoney(economy.nationalDebt, currency)],
              ["GDP 대비 부채", formatPercent(economy.debtToGdp)],
              ["외환보유고", formatMoney(economy.foreignReserves, currency)],
              ["통화", currency],
              ["통화 가치 지수", formatDecimal(economy.currencyValue, 4)],
              ["기준금리", formatPercent(economy.policyRate)],
              ["GDP 대비 경상수지", formatPercent(economy.currentAccountToGdp)],
              ["신용등급", `${economy.creditRating} · ${economy.creditRatingAgency}`],
              ["신용 점수", `${economy.creditScore}/100`],
              ["금액 단위", economy.scale],
              ["계산 규칙", economy.rulesVersion],
            ]}
          />
        </div>
      )}

      {tab === "industry" && (
        <div className="ledger-tab-panel" role="tabpanel">
          <h3>산업 구조</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>산업</th>
                  <th className="numeric">비중</th>
                  <th className="numeric">생산 지수</th>
                  <th className="numeric">생산성</th>
                  <th className="numeric">성장률</th>
                </tr>
              </thead>
              <tbody>
                {ledger.sectors.map((sector) => (
                  <tr key={sector.id}>
                    <td>{sector.name}</td>
                    <td className="numeric">{formatPercent(sector.share)}</td>
                    <td className="numeric">{formatDecimal(sector.productionIndex, 2)}</td>
                    <td className="numeric">{formatDecimal(sector.productivity, 2)}</td>
                    <td className="numeric">{formatPercent(sector.growthRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="institution-grid">
            <section>
              <h3>금융기관</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>기관</th>
                      <th className="numeric">중요도</th>
                      <th className="numeric">건전성</th>
                      <th>분류</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.institutions.map((institution) => (
                      <tr key={institution.id}>
                        <td>{institution.name}</td>
                        <td className="numeric">{institution.systemicImportance}</td>
                        <td className="numeric">{institution.health}</td>
                        <td>{institution.industryTags.join(" · ") || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section>
              <h3>주요 기업</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>기업</th>
                      <th>산업</th>
                      <th className="numeric">규모</th>
                      <th className="numeric">중요도</th>
                      <th className="numeric">건전성</th>
                      <th>소유</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.companies.map((company) => (
                      <tr key={company.id}>
                        <td>{company.name}</td>
                        <td>{company.industryTags.join(" · ") || company.industry}</td>
                        <td className="numeric">{company.sizeIndex}</td>
                        <td className="numeric">{company.systemicImportance}</td>
                        <td className="numeric">{company.health}</td>
                        <td>{company.stateOwned ? "국영" : "민간"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      )}

      {tab === "trend" && (
        <div className="ledger-tab-panel" role="tabpanel">
          <EconomicTrendCharts points={trendPoints} currency={currency} />
          <h3>계산 기여도</h3>
          {contributionGroups.length ? (
            <div className="contribution-grid">
              {contributionGroups.map(([group, items]) => (
                <section key={group}>
                  <h3>{contributionGroupLabel(group)}</h3>
                  <div className="contribution-list">
                    {items.map((item, index) => (
                      <div key={`${item.source}-${index}`}>
                        <span>{metricLabel(item.source)}</span>
                        <strong>{formatDecimal(item.value, 4)}</strong>
                        <small>{item.explanation}</small>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="empty-state">계산 기여도 기록이 없습니다.</div>
          )}
          {ledger.economicInputs.length > 0 && (
            <>
              <h3>시뮬레이션 입력 근거</h3>
              <DataList
                rows={ledger.economicInputs.map((input) => [
                  metricLabel(input.metric),
                  `${formatDecimal(input.value, 4)} ${input.unit} · ${input.source}`,
                ])}
              />
            </>
          )}
        </div>
      )}

      {tab === "simulate" && (
        <div className="ledger-tab-panel" role="tabpanel">
          {simulatorInput ? (
            <AdminEconomySimulator
              countryName={ledger.country.name}
              initialInput={simulatorInput}
              rules={economyRules}
            />
          ) : (
            <div className="empty-state">모의실험에 필요한 경제·인구 자료가 없습니다.</div>
          )}
        </div>
      )}

      {tab === "edit" && (
        <div className="ledger-tab-panel" role="tabpanel">
          <EconomicEditor ledger={ledger} />
        </div>
      )}
    </section>
  );
}
