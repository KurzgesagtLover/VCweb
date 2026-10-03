"use client";

import { useState, type ReactNode } from "react";
import { updateCountryBudgetAction, updateCountryTaxRateAction } from "@/src/actions/economy";
import {
  BUDGET_PRESETS,
  BUDGET_SECTORS,
  getBudgetSectorRange,
  rebalanceBudgetAllocation,
  type BudgetAllocation,
  type BudgetPresetId,
  type BudgetSectorKey,
} from "@/src/domain/economy/budget";
import { TAX_BASE_WEIGHTS } from "@/src/domain/economy/tax";

export type EconomySnapshotView = {
  currency: string;
  referenceYear: number;
  rulesVersion: string;
  realGdp: number;
  nominalGdp: number;
  realGdpGrowth: number;
  nominalGdpGrowth: number | null;
  gdpDeflator: number;
  inflationRate: number;
  unemploymentRate: number;
  governmentRevenue: number;
  governmentSpending: number;
  governmentSpendingGrowth: number;
  fiscalBalance: number;
  nationalDebt: number;
  debtToGdp: number;
  policyRate: number;
  foreignReserves: number;
  currencyValue: number;
  creditRating: string;
  creditScore: number;
  incomeGini: number;
  wealthGini: number;
  currentAccountToGdp: number;
  productivityIndex: number;
  povertyRate: number;
  agriculturalProductivityIndex: number;
  foodSelfSufficiency: number;
  industrialCapitalStockIndex: number;
  researchCapacityIndex: number;
  wealth: number;
  realGni: number;
  realGnp: number;
  landPriceGrowth: number;
};

export type EconomyTrendPointView = {
  turn: number;
  label: string;
  nominalGdp: number;
  inflation: number;
  debtToGdp: number;
  realGdpGrowth: number;
  unemployment: number;
};

export type DemographicView = {
  population: number;
  medianAge: number;
  lifeExpectancy: number;
  fertilityRate: number;
  populationGrowthRate: number;
  populationDensity: number;
} | null;

export type SectorView = {
  code: string;
  name: string;
  share: number;
  growthRate: number;
  productivity: number;
};

export type CompanyView = {
  id: string;
  name: string;
  logo: string;
  slogan: string;
  abbreviation: string | null;
  founded: string;
  history: string;
  legalForm: string;
  headquarters: string;
  placeOfFoundation: string | null;
  chiefExecutiveOfficer: string;
  boardChair: string | null;
  parentCompany: string;
  largestShareholder: string | null;
  majorShareholders: string[];
  subsidiaries: string[];
  affiliates: string[];
  employeeCount: number;
  indirectEmployment: number | null;
  overseasEmployees: number | null;
  averageSalary: number | null;
  unionMembershipRate: number | null;
  revenue: number;
  grossProfit: number;
  operatingProfit: number;
  netIncome: number;
  totalAssets: number;
  totalDebt: number | null;
  enterpriseValue: number;
  marketCapitalization: number | null;
  creditRating: string | null;
  researchAndDevelopmentExpense: number | null;
  capitalExpenditure: number | null;
  cashAndEquivalents: number | null;
  dividendsPaid: number | null;
  debtRatio: number | null;
  operatingMargin: number | null;
  automationProductivityGrowthRate: number;
  industry: string;
  productsAndServices: string[];
  brands: string[];
  productionFacilities: string[];
  researchFacilities: string[];
  overseasBases: string[];
  majorMarkets: string[];
  competitors: string[];
  isListed: boolean;
  stockExchange: string | null;
  tickerSymbol: string | null;
  sharesOutstanding: number | null;
  sharePrice: number | null;
  dividendYield: number | null;
  sizeIndex: number;
  stateOwned: boolean;
  systemicImportance: number;
  health: number;
};

type CompanyClassStatisticsView = {
  companyClass: "MAJOR" | "LARGE" | "MEDIUM" | "SMALL";
  enterpriseCount: number;
  totalRevenue: number;
  totalGrossProfit: number;
  totalOperatingProfit: number;
  totalNetIncome: number;
  totalAssets: number;
  totalDebt: number;
  totalEnterpriseValue: number;
  totalEmployees: number;
  totalResearchAndDevelopmentExpense: number;
  totalCapitalExpenditure: number;
  automationProductivityGrowthRate: number;
};

const COMPANY_CLASS_LABELS: Record<CompanyClassStatisticsView["companyClass"], string> = {
  MAJOR: "주요 기업",
  LARGE: "대기업",
  MEDIUM: "중견기업",
  SMALL: "중소기업",
};

const COMPANY_CLASS_METRICS = [
  ["totalRevenue", "매출", "money"],
  ["totalGrossProfit", "매출총이익", "money"],
  ["totalOperatingProfit", "영업이익", "money"],
  ["totalNetIncome", "순이익", "money"],
  ["totalAssets", "총자산", "money"],
  ["totalDebt", "총부채", "money"],
  ["totalEnterpriseValue", "기업가치", "money"],
  ["totalEmployees", "고용인원", "people"],
  ["totalResearchAndDevelopmentExpense", "연구개발비", "money"],
  ["totalCapitalExpenditure", "설비투자액", "money"],
] as const;

const SECTOR_COLORS = ["#f2c14b", "#4bb6f2", "#a97bf2", "#f2794b", "#4bf2a5", "#f24b7b", "#8fa0ab"];

function compactMoney(millions: number, currency: string) {
  const abs = Math.abs(millions);
  if (abs >= 1_000_000) return `${(millions / 1_000_000).toFixed(2)}조 ${currency}`;
  if (abs >= 1_000) return `${(millions / 1_000).toFixed(2)}십억 ${currency}`;
  if (abs > 0 && abs < 1) return `${(millions * 1_000).toFixed(1)}천 ${currency}`;
  return `${millions.toFixed(1)}백만 ${currency}`;
}

function compactPeople(value: number) {
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(2)}억 명`;
  if (value >= 10_000) return `${(value / 10_000).toFixed(1)}만 명`;
  return `${Math.round(value).toLocaleString("ko-KR")}명`;
}

function pct(value: number, digits = 2) {
  return `${(value * 100).toFixed(digits)}%`;
}

function plainNumber(value: number | null) {
  return value === null ? "—" : value.toLocaleString("ko-KR");
}

function companyList(values: string[]) {
  return values.length ? values.join(" · ") : "—";
}

function companyMoney(value: number | null, currency: string) {
  return value === null ? "—" : compactMoney(value, currency);
}

function CompanyFacts({ title, items }: { title: string; items: Array<[string, ReactNode]> }) {
  return (
    <section className="tno-company-facts">
      <h4>{title}</h4>
      <dl>
        {items.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value === null || value === undefined || value === "" ? "—" : value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ratingTone(score: number) {
  if (score >= 80) return { label: "매우 안정", tone: "good" };
  if (score >= 60) return { label: "나쁘지 않음", tone: "fair" };
  if (score >= 40) return { label: "주의 필요", tone: "warn" };
  return { label: "위험 수준", tone: "bad" };
}

function Sparkline({
  points,
  color,
  format,
  zeroBaseline,
}: {
  points: Array<{ label: string; value: number }>;
  color: string;
  format: (value: number) => string;
  zeroBaseline?: boolean;
}) {
  if (points.length < 2) {
    return <div className="tno-chart-empty">추세 데이터가 부족합니다.</div>;
  }
  const values = points.map((point) => point.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (zeroBaseline) {
    min = Math.min(0, min);
    max = Math.max(0, max);
  }
  if (min === max) {
    const pad = Math.abs(min || 1) * 0.15;
    min -= pad;
    max += pad;
  } else {
    const pad = (max - min) * 0.12;
    min -= pad;
    max += pad;
  }
  const left = 46;
  const right = 244;
  const top = 8;
  const bottom = 78;
  const x = (index: number) => left + (index * (right - left)) / (points.length - 1);
  const y = (value: number) => bottom - ((value - min) / (max - min)) * (bottom - top);
  const line = points
    .map(
      (point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`,
    )
    .join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${bottom} L${left},${bottom} Z`;
  const labelStep = Math.max(1, Math.ceil(points.length / 4));

  return (
    <svg className="tno-spark" viewBox="0 0 252 96" role="img" aria-hidden="true">
      {[0, 1, 2, 3].map((tick) => {
        const ratio = tick / 3;
        const gridY = top + (bottom - top) * ratio;
        return (
          <g key={tick}>
            <line className="tno-spark-grid" x1={left} x2={right} y1={gridY} y2={gridY} />
            <text className="tno-spark-axis" x={left - 5} y={gridY + 3} textAnchor="end">
              {format(max - (max - min) * ratio)}
            </text>
          </g>
        );
      })}
      {[0, 1, 2, 3, 4, 5].map((tick) => (
        <line
          key={`v${tick}`}
          className="tno-spark-grid"
          x1={left + ((right - left) * tick) / 5}
          x2={left + ((right - left) * tick) / 5}
          y1={top}
          y2={bottom}
        />
      ))}
      <path className="tno-spark-area" d={area} fill={color} />
      <path className="tno-spark-line" d={line} stroke={color} />
      {points.map((point, index) =>
        index % labelStep === 0 || index === points.length - 1 ? (
          <text
            className="tno-spark-axis"
            key={point.label + index}
            x={x(index)}
            y={92}
            textAnchor="middle"
          >
            {point.label}
          </text>
        ) : null,
      )}
    </svg>
  );
}

function Donut({
  slices,
  caption,
}: {
  slices: Array<{ label: string; value: number; color: string }>;
  caption: string;
}) {
  const total = slices.reduce((sum, slice) => sum + Math.max(0, slice.value), 0);
  let cursor = 0;
  const stops = total
    ? slices
        .filter((slice) => slice.value > 0)
        .map((slice) => {
          const start = (cursor / total) * 100;
          cursor += slice.value;
          const end = (cursor / total) * 100;
          return `${slice.color} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
        })
    : [];

  return (
    <div className="tno-donut-block">
      <div
        className="tno-donut"
        style={
          stops.length
            ? { background: `conic-gradient(from -90deg, ${stops.join(", ")})` }
            : undefined
        }
      >
        {!stops.length && <span>데이터 없음</span>}
      </div>
      <span className="tno-donut-caption">{caption}</span>
    </div>
  );
}

export function TnoEconomyWindow({
  snapshot,
  trend,
  demographic,
  sectors,
  institutions,
  companies,
  companyClassStatistics,
  taxRatesPercent,
  economicSystem,
  budgetPolicy,
  perCapitaGdp,
  contributions,
}: {
  snapshot: EconomySnapshotView | null;
  trend: EconomyTrendPointView[];
  demographic: DemographicView;
  sectors: SectorView[];
  institutions: Array<{ id: string; name: string; health: number; systemicImportance: number }>;
  companies: CompanyView[];
  companyClassStatistics: CompanyClassStatisticsView[];
  taxRatesPercent: {
    incomeTaxRate: number;
    corporateTaxRate: number;
    otherTaxRate: number;
  };
  economicSystem: string;
  budgetPolicy: {
    ideologyLabel: string;
    allowedPresets: BudgetPresetId[];
    preset: BudgetPresetId;
    allocation: BudgetAllocation;
  };
  perCapitaGdp: number | null;
  contributions: Array<{ group: string; items: Array<{ source: string; detail: string }> }>;
}) {
  const [tab, setTab] = useState<"OVERVIEW" | "FISCAL" | "SOCIETY">("OVERVIEW");
  const [taxRates, setTaxRates] = useState(taxRatesPercent);
  const [budgetPreset, setBudgetPreset] = useState<BudgetPresetId>(budgetPolicy.preset);
  const [budgetAllocation, setBudgetAllocation] = useState<BudgetAllocation>(
    budgetPolicy.allocation,
  );
  const effectiveTaxRate =
    taxRates.incomeTaxRate * TAX_BASE_WEIGHTS.incomeTaxRate +
    taxRates.corporateTaxRate * TAX_BASE_WEIGHTS.corporateTaxRate +
    taxRates.otherTaxRate * TAX_BASE_WEIGHTS.otherTaxRate;

  function selectBudgetPreset(preset: BudgetPresetId) {
    setBudgetPreset(preset);
    setBudgetAllocation({ ...BUDGET_PRESETS[preset].allocation });
  }

  function updateBudgetSector(key: BudgetSectorKey, value: number) {
    setBudgetAllocation((current) => rebalanceBudgetAllocation(current, budgetPreset, key, value));
  }

  function resetBudgetPolicy() {
    setBudgetPreset(budgetPolicy.preset);
    setBudgetAllocation(budgetPolicy.allocation);
  }

  if (!snapshot) {
    return (
      <section className="tno-econ-window">
        <header className="tno-titlebar">
          <h2>경제</h2>
        </header>
        <div className="tno-loading">아직 계산된 경제 스냅샷이 없습니다.</div>
      </section>
    );
  }

  const currency = snapshot.currency;
  const rating = ratingTone(snapshot.creditScore);
  const deficit = snapshot.fiscalBalance < 0;
  const balanceToGdp = snapshot.nominalGdp ? snapshot.fiscalBalance / snapshot.nominalGdp : 0;
  const interestBurden = snapshot.nationalDebt * snapshot.policyRate;

  const budgetSlices = deficit
    ? [
        { label: "세입 충당", value: snapshot.governmentRevenue, color: "#4bb6f2" },
        { label: "적자 조달", value: -snapshot.fiscalBalance, color: "#f2794b" },
      ]
    : [
        { label: "지출 집행", value: snapshot.governmentSpending, color: "#4bb6f2" },
        { label: "재정 흑자", value: snapshot.fiscalBalance, color: "#4bf2a5" },
      ];

  const topSectors = sectors.slice(0, 6);
  const otherShare = sectors.slice(6).reduce((sum, sector) => sum + sector.share, 0);
  const sectorSlices = [
    ...topSectors.map((sector, index) => ({
      label: sector.name,
      value: sector.share,
      color: SECTOR_COLORS[index % SECTOR_COLORS.length],
    })),
    ...(otherShare > 0
      ? [{ label: "기타", value: otherShare, color: SECTOR_COLORS[SECTOR_COLORS.length - 1] }]
      : []),
  ];

  const signals = [
    { label: "경기 역성장", icon: "↘", active: snapshot.realGdpGrowth < 0 },
    { label: "치명적 인플레이션", icon: "▲", active: snapshot.inflationRate > 0.08 },
    { label: "디플레이션", icon: "▼", active: snapshot.inflationRate < 0 },
    { label: "대량 실업", icon: "☰", active: snapshot.unemploymentRate > 0.08 },
    { label: "극도로 높은 적자", icon: "⌁", active: balanceToGdp < -0.05 },
    { label: "치명적인 부채", icon: "☗", active: snapshot.debtToGdp > 0.9 },
    {
      label: "외환 부족",
      icon: "⇵",
      active: snapshot.foreignReserves < snapshot.nominalGdp * 0.03,
    },
    { label: "극심한 불평등", icon: "≠", active: snapshot.incomeGini > 0.5 },
  ];
  const activeSignals = signals.filter((signal) => signal.active).length;

  return (
    <section className="tno-econ-window">
      <header className="tno-titlebar">
        <h2>경제</h2>
        <div className="tno-title-readout">
          <span className="tno-title-metric">
            <em>통화</em>
            {currency}
          </span>
          <span className="tno-title-metric">
            <em>기준연도</em>
            {snapshot.referenceYear}
          </span>
          <span className="tno-title-metric">
            <em>규칙</em>
            {snapshot.rulesVersion}
          </span>
          <span className={`tno-econ-alarm ${activeSignals ? "on" : ""}`}>
            경보 {activeSignals}
          </span>
        </div>
      </header>

      <nav className="tno-tabs tno-tabs-3">
        <button
          type="button"
          className={tab === "OVERVIEW" ? "active" : ""}
          onClick={() => setTab("OVERVIEW")}
        >
          개요
        </button>
        <button
          type="button"
          className={tab === "FISCAL" ? "active" : ""}
          onClick={() => setTab("FISCAL")}
        >
          재정
        </button>
        <button
          type="button"
          className={tab === "SOCIETY" ? "active" : ""}
          onClick={() => setTab("SOCIETY")}
        >
          사회·산업
        </button>
      </nav>

      <div className="tno-econ-strip">
        <div className="tno-econ-system">
          <i>{economicSystem === "PLANNED" ? "☭" : "＄"}</i>
          <div>
            <strong>{economicSystem === "PLANNED" ? "계획 경제" : "자유 시장 경제"}</strong>
            <div className="tno-econ-scale" aria-hidden="true">
              <span style={{ left: `${Math.min(100, (effectiveTaxRate / 75) * 100)}%` }} />
            </div>
            <small>실효 조세 부담 {effectiveTaxRate.toFixed(1)}%</small>
          </div>
        </div>
        <div className="tno-econ-counters">
          <span>
            <em>실질 성장</em>
            <b className={snapshot.realGdpGrowth < 0 ? "bad" : "good"}>
              {pct(snapshot.realGdpGrowth)}
            </b>
          </span>
          <span>
            <em>물가</em>
            <b className={snapshot.inflationRate > 0.05 ? "bad" : ""}>
              {pct(snapshot.inflationRate)}
            </b>
          </span>
          <span>
            <em>실업</em>
            <b className={snapshot.unemploymentRate > 0.07 ? "bad" : ""}>
              {pct(snapshot.unemploymentRate)}
            </b>
          </span>
        </div>
        <div className={`tno-credit-badge ${rating.tone}`}>
          <em>신용 등급</em>
          <strong>{snapshot.creditRating}</strong>
          <small>{rating.label}</small>
        </div>
      </div>

      {tab === "OVERVIEW" && (
        <>
          <div className="tno-chart-row">
            <article className="tno-chart-card">
              <header>
                <h3>인플레이션</h3>
                <strong className={snapshot.inflationRate > 0.05 ? "bad" : ""}>
                  {pct(snapshot.inflationRate, 3)}
                </strong>
              </header>
              <Sparkline
                points={trend.map((point) => ({
                  label: point.label,
                  value: point.inflation * 100,
                }))}
                color="#f2794b"
                format={(value) => `${value.toFixed(1)}%`}
              />
              <dl className="tno-chart-legend">
                <div>
                  <dt>명목 성장률</dt>
                  <dd>
                    {snapshot.nominalGdpGrowth === null ? "—" : pct(snapshot.nominalGdpGrowth)}
                  </dd>
                </div>
                <div>
                  <dt>실질 성장률</dt>
                  <dd>{pct(snapshot.realGdpGrowth)}</dd>
                </div>
                <div>
                  <dt>디플레이터</dt>
                  <dd>{snapshot.gdpDeflator.toFixed(2)}</dd>
                </div>
              </dl>
            </article>

            <article className="tno-chart-card">
              <header>
                <h3>명목 GDP</h3>
                <strong>{compactMoney(snapshot.nominalGdp, currency)}</strong>
              </header>
              <Sparkline
                points={trend.map((point) => ({ label: point.label, value: point.nominalGdp }))}
                color="#4bf2a5"
                format={(value) =>
                  Math.abs(value) >= 1_000_000
                    ? `${(value / 1_000_000).toFixed(1)}조`
                    : `${(value / 1_000).toFixed(0)}십억`
                }
                zeroBaseline
              />
              <dl className="tno-chart-legend">
                <div>
                  <dt>실질 GDP</dt>
                  <dd>{compactMoney(snapshot.realGdp, "")}</dd>
                </div>
                <div>
                  <dt>1인당 GDP</dt>
                  <dd>
                    {perCapitaGdp
                      ? `${Math.round(perCapitaGdp).toLocaleString("ko-KR")} ${currency}`
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt>생산성 지수</dt>
                  <dd>{snapshot.productivityIndex.toFixed(1)}</dd>
                </div>
              </dl>
            </article>

            <article className="tno-chart-card">
              <header>
                <h3>GDP 대비 부채</h3>
                <strong className={snapshot.debtToGdp > 0.9 ? "bad" : ""}>
                  {pct(snapshot.debtToGdp, 1)}
                </strong>
              </header>
              <Sparkline
                points={trend.map((point) => ({
                  label: point.label,
                  value: point.debtToGdp * 100,
                }))}
                color="#f2c14b"
                format={(value) => `${value.toFixed(0)}%`}
                zeroBaseline
              />
              <dl className="tno-chart-legend">
                <div>
                  <dt>국가채무</dt>
                  <dd>{compactMoney(snapshot.nationalDebt, "")}</dd>
                </div>
                <div>
                  <dt>기준금리</dt>
                  <dd>{pct(snapshot.policyRate, 3)}</dd>
                </div>
                <div>
                  <dt>이자 부담(추정)</dt>
                  <dd>{compactMoney(interestBurden, "")}</dd>
                </div>
              </dl>
            </article>
          </div>

          <div className="tno-econ-lower">
            <section className="tno-budget-panel">
              <h3 className="tno-section-tab">연간 재정</h3>
              <div className="tno-budget-head">
                <span className={deficit ? "bad" : "good"}>
                  {deficit ? "연간 적자" : "연간 흑자"}{" "}
                  {compactMoney(Math.abs(snapshot.fiscalBalance), currency)}
                </span>
                <small>GDP의 {pct(balanceToGdp, 3)}</small>
              </div>
              <div className="tno-budget-body">
                <div className="tno-budget-side">
                  <Donut
                    slices={budgetSlices}
                    caption={`${deficit ? "지출" : "수입"} ${compactMoney(
                      deficit ? snapshot.governmentSpending : snapshot.governmentRevenue,
                      "",
                    )}`}
                  />
                  <ul className="tno-legend-list">
                    {budgetSlices.map((slice) => (
                      <li key={slice.label}>
                        <i style={{ background: slice.color }} />
                        <span>{slice.label}</span>
                        <b>{compactMoney(Math.abs(slice.value), "")}</b>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="tno-budget-side">
                  <Donut slices={sectorSlices} caption="산업 구성" />
                  <ul className="tno-legend-list">
                    {sectorSlices.length ? (
                      sectorSlices.map((slice) => (
                        <li key={slice.label}>
                          <i style={{ background: slice.color }} />
                          <span>{slice.label}</span>
                          <b>{pct(slice.value, 1)}</b>
                        </li>
                      ))
                    ) : (
                      <li className="empty">산업 구성 데이터가 없습니다.</li>
                    )}
                  </ul>
                </div>
              </div>
              <div className="tno-budget-bars">
                <div>
                  <span>정부 수입</span>
                  <div className="tno-bar">
                    <i
                      style={{
                        width: `${Math.min(
                          100,
                          (snapshot.governmentRevenue /
                            Math.max(snapshot.governmentSpending, snapshot.governmentRevenue, 1)) *
                            100,
                        )}%`,
                        background: "#4bb6f2",
                      }}
                    />
                  </div>
                  <b>{compactMoney(snapshot.governmentRevenue, "")}</b>
                </div>
                <div>
                  <span>정부 지출</span>
                  <div className="tno-bar">
                    <i
                      style={{
                        width: `${Math.min(
                          100,
                          (snapshot.governmentSpending /
                            Math.max(snapshot.governmentSpending, snapshot.governmentRevenue, 1)) *
                            100,
                        )}%`,
                        background: "#f2794b",
                      }}
                    />
                  </div>
                  <b>{compactMoney(snapshot.governmentSpending, "")}</b>
                </div>
                <div>
                  <span>지출 증가율</span>
                  <div className="tno-bar">
                    <i
                      style={{
                        width: `${Math.min(100, Math.abs(snapshot.governmentSpendingGrowth) * 500)}%`,
                        background: "#f2c14b",
                      }}
                    />
                  </div>
                  <b>{pct(snapshot.governmentSpendingGrowth)}</b>
                </div>
              </div>
            </section>

            <aside className="tno-econ-side">
              <section className="tno-plate">
                <h3>통화·대외</h3>
                <div className="tno-stat-grid tno-stat-grid-2">
                  <div>
                    <span>외환보유고</span>
                    <strong>{compactMoney(snapshot.foreignReserves, "")}</strong>
                  </div>
                  <div>
                    <span>화폐가치</span>
                    <strong>{snapshot.currencyValue.toFixed(4)}</strong>
                  </div>
                  <div>
                    <span>경상수지/GDP</span>
                    <strong>{pct(snapshot.currentAccountToGdp)}</strong>
                  </div>
                  <div>
                    <span>국부</span>
                    <strong>{compactMoney(snapshot.wealth, "")}</strong>
                  </div>
                </div>
              </section>

              <form action={updateCountryTaxRateAction} className="tno-tax-panel">
                <h3 className="tno-section-tab">조세 정책</h3>
                <div className="tno-tax-readout">
                  <strong>{effectiveTaxRate.toFixed(1)}%</strong>
                  <small>명목 GDP 대비 실효 조세 부담</small>
                </div>
                {(
                  [
                    ["incomeTaxRate", "소득세"],
                    ["corporateTaxRate", "법인세"],
                    ["otherTaxRate", "기타세"],
                  ] as const
                ).map(([key, label]) => (
                  <label className="tno-tax-control" key={key}>
                    <span>
                      {label}
                      <strong>{taxRates[key].toFixed(1)}%</strong>
                    </span>
                    <input
                      type="range"
                      name={key}
                      min={0}
                      max={75}
                      step={0.1}
                      value={taxRates[key]}
                      onChange={(event) =>
                        setTaxRates((current) => ({
                          ...current,
                          [key]: Number(event.target.value),
                        }))
                      }
                    />
                  </label>
                ))}
                <div className="tno-tax-actions">
                  <button type="button" onClick={() => setTaxRates(taxRatesPercent)}>
                    초기화
                  </button>
                  <button type="submit">시행</button>
                </div>
              </form>

              <section className="tno-signal-panel">
                <h3 className="tno-section-tab">경제 위기 신호</h3>
                <div className="tno-signal-grid">
                  {signals.map((signal) => (
                    <span
                      key={signal.label}
                      className={`tno-signal ${signal.active ? "on" : ""}`}
                      title={signal.active ? "경보 발생" : "정상 범위"}
                    >
                      <i>{signal.icon}</i>
                      {signal.label}
                    </span>
                  ))}
                </div>
              </section>
            </aside>
          </div>
        </>
      )}

      {tab === "FISCAL" && (
        <div className="tno-econ-detail">
          <form
            action={updateCountryBudgetAction}
            className="tno-plate tno-plate-wide tno-budget-allocation-panel"
          >
            <header className="tno-budget-allocation-head">
              <h3>정부 예산 배분</h3>
              <span>{budgetPolicy.ideologyLabel}</span>
            </header>
            <label className="tno-budget-preset-select">
              <span>예산 프리셋</span>
              <select
                name="budgetPreset"
                value={budgetPreset}
                onChange={(event) => selectBudgetPreset(event.target.value as BudgetPresetId)}
              >
                {budgetPolicy.allowedPresets.map((presetId) => (
                  <option key={presetId} value={presetId}>
                    {BUDGET_PRESETS[presetId].label}
                  </option>
                ))}
              </select>
            </label>
            <div className="tno-budget-allocation-strip" aria-hidden="true">
              {BUDGET_SECTORS.map((sector) => (
                <i
                  key={sector.key}
                  style={{
                    width: `${budgetAllocation[sector.key]}%`,
                    background: sector.color,
                  }}
                />
              ))}
            </div>
            <div className="tno-budget-sector-grid">
              {BUDGET_SECTORS.map((sector) => {
                const range = getBudgetSectorRange(budgetPreset, sector.key);
                const share = budgetAllocation[sector.key];
                return (
                  <label className="tno-budget-sector-control" key={sector.key}>
                    <span>
                      <i style={{ background: sector.color }} />
                      {sector.label}
                    </span>
                    <strong>
                      {share}%
                      <small>{compactMoney((snapshot.governmentSpending * share) / 100, "")}</small>
                    </strong>
                    <input
                      type="range"
                      name={sector.key}
                      min={range.min}
                      max={range.max}
                      step={1}
                      value={share}
                      onChange={(event) =>
                        updateBudgetSector(sector.key, Number(event.target.value))
                      }
                    />
                  </label>
                );
              })}
            </div>
            <footer className="tno-budget-allocation-actions">
              <span>총 100% · 프리셋 기준 각 부문 ±6%p</span>
              <div>
                <button type="button" onClick={resetBudgetPolicy}>
                  초기화
                </button>
                <button type="submit">예산 시행</button>
              </div>
            </footer>
          </form>
          <section className="tno-plate">
            <h3>재정</h3>
            <div className="tno-stat-grid">
              <div>
                <span>정부 수입</span>
                <strong>{compactMoney(snapshot.governmentRevenue, "")}</strong>
              </div>
              <div>
                <span>정부 지출</span>
                <strong>{compactMoney(snapshot.governmentSpending, "")}</strong>
              </div>
              <div>
                <span>재정수지</span>
                <strong>{compactMoney(snapshot.fiscalBalance, "")}</strong>
              </div>
              <div>
                <span>국가채무</span>
                <strong>{compactMoney(snapshot.nationalDebt, "")}</strong>
              </div>
              <div>
                <span>부채/GDP</span>
                <strong>{pct(snapshot.debtToGdp, 1)}</strong>
              </div>
              <div>
                <span>기준금리</span>
                <strong>{pct(snapshot.policyRate, 3)}</strong>
              </div>
              <div>
                <span>지출 증가율</span>
                <strong>{pct(snapshot.governmentSpendingGrowth)}</strong>
              </div>
              <div>
                <span>토지가 변동</span>
                <strong>{pct(snapshot.landPriceGrowth)}</strong>
              </div>
            </div>
          </section>
          <section className="tno-plate">
            <h3>생산·소득</h3>
            <div className="tno-stat-grid">
              <div>
                <span>실질 GDP</span>
                <strong>{compactMoney(snapshot.realGdp, "")}</strong>
              </div>
              <div>
                <span>명목 GDP</span>
                <strong>{compactMoney(snapshot.nominalGdp, "")}</strong>
              </div>
              <div>
                <span>실질 GNI</span>
                <strong>{compactMoney(snapshot.realGni, "")}</strong>
              </div>
              <div>
                <span>실질 GNP</span>
                <strong>{compactMoney(snapshot.realGnp, "")}</strong>
              </div>
              <div>
                <span>소득 지니</span>
                <strong>{snapshot.incomeGini.toFixed(3)}</strong>
              </div>
              <div>
                <span>자산 지니</span>
                <strong>{snapshot.wealthGini.toFixed(3)}</strong>
              </div>
              <div>
                <span>신용 점수</span>
                <strong>{snapshot.creditScore}</strong>
              </div>
              <div>
                <span>생산성</span>
                <strong>{snapshot.productivityIndex.toFixed(1)}</strong>
              </div>
              <div>
                <span>빈곤율</span>
                <strong>{pct(snapshot.povertyRate)}</strong>
              </div>
              <div>
                <span>농업 생산성</span>
                <strong>{snapshot.agriculturalProductivityIndex.toFixed(1)}</strong>
              </div>
              <div>
                <span>식량 자급률</span>
                <strong>{pct(snapshot.foodSelfSufficiency, 1)}</strong>
              </div>
              <div>
                <span>산업 자본</span>
                <strong>{snapshot.industrialCapitalStockIndex.toFixed(1)}</strong>
              </div>
              <div>
                <span>연구 역량</span>
                <strong>{snapshot.researchCapacityIndex.toFixed(1)}</strong>
              </div>
            </div>
          </section>
          <section className="tno-plate">
            <h3>계산 근거</h3>
            {contributions.length ? (
              <div className="tno-basis-list">
                {contributions.map((group) => (
                  <details key={group.group}>
                    <summary>{group.group}</summary>
                    <ul>
                      {group.items.map((item, index) => (
                        <li key={`${group.group}-${index}`}>
                          <b>{item.source}</b>
                          <span>{item.detail}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
              </div>
            ) : (
              <p>현재 스냅샷에는 기여도 기록이 없습니다.</p>
            )}
          </section>
        </div>
      )}

      {tab === "SOCIETY" && (
        <div className="tno-econ-detail">
          <section className="tno-plate">
            <h3>인구</h3>
            {demographic ? (
              <div className="tno-stat-grid">
                <div>
                  <span>총인구</span>
                  <strong>{compactPeople(demographic.population)}</strong>
                </div>
                <div>
                  <span>인구 증가율</span>
                  <strong>{pct(demographic.populationGrowthRate)}</strong>
                </div>
                <div>
                  <span>중위 연령</span>
                  <strong>{demographic.medianAge.toFixed(1)}세</strong>
                </div>
                <div>
                  <span>기대 수명</span>
                  <strong>{demographic.lifeExpectancy.toFixed(1)}세</strong>
                </div>
                <div>
                  <span>합계출산율</span>
                  <strong>{demographic.fertilityRate.toFixed(2)}</strong>
                </div>
                <div>
                  <span>인구 밀도</span>
                  <strong>{demographic.populationDensity.toFixed(1)}/km²</strong>
                </div>
                <div>
                  <span>실업률</span>
                  <strong>{pct(snapshot.unemploymentRate)}</strong>
                </div>
                <div>
                  <span>빈곤율</span>
                  <strong>{pct(snapshot.povertyRate)}</strong>
                </div>
                <div>
                  <span>1인당 GDP</span>
                  <strong>
                    {perCapitaGdp ? Math.round(perCapitaGdp).toLocaleString("ko-KR") : "—"}
                  </strong>
                </div>
              </div>
            ) : (
              <p>인구 스냅샷이 없습니다.</p>
            )}
          </section>

          <section className="tno-plate">
            <h3>산업 구성</h3>
            {sectors.length ? (
              <ul className="tno-sector-list">
                {sectors.map((sector, index) => (
                  <li key={sector.code}>
                    <span>{sector.name}</span>
                    <div className="tno-bar">
                      <i
                        style={{
                          width: `${Math.min(100, sector.share * 100)}%`,
                          background: SECTOR_COLORS[index % SECTOR_COLORS.length],
                        }}
                      />
                    </div>
                    <b>{pct(sector.share, 1)}</b>
                    <em className={sector.growthRate < 0 ? "bad" : "good"}>
                      {pct(sector.growthRate)}
                    </em>
                  </li>
                ))}
              </ul>
            ) : (
              <p>산업 구성 데이터가 없습니다.</p>
            )}
          </section>

          <section className="tno-plate">
            <h3>금융 기관</h3>
            {institutions.length ? (
              <ul className="tno-entity-list">
                {institutions.map((institution) => (
                  <li key={institution.id}>
                    <span>{institution.name}</span>
                    <em>건전성 {institution.health}</em>
                    <b>중요도 {institution.systemicImportance}</b>
                  </li>
                ))}
              </ul>
            ) : (
              <p>등록된 금융 기관이 없습니다.</p>
            )}
          </section>

          <section className="tno-plate">
            <h3>기업 구조</h3>
            <div className="tno-company-class-grid">
              {companyClassStatistics.map((row) => (
                <article key={row.companyClass}>
                  <header>
                    <strong>{COMPANY_CLASS_LABELS[row.companyClass]}</strong>
                    <span>{row.enterpriseCount.toLocaleString("ko-KR")}개</span>
                  </header>
                  <div className="tno-company-automation">
                    <span>자동화 생산성 증가율</span>
                    <strong>{pct(row.automationProductivityGrowthRate, 1)} / 연</strong>
                  </div>
                  <dl>
                    {COMPANY_CLASS_METRICS.map(([key, label, kind]) => {
                      const total = row[key];
                      const average = row.enterpriseCount > 0 ? total / row.enterpriseCount : 0;
                      const formatValue = (value: number) =>
                        kind === "people"
                          ? `${Math.round(value).toLocaleString("ko-KR")}명`
                          : compactMoney(value, currency);
                      return (
                        <div key={key}>
                          <dt>{label}</dt>
                          <dd>
                            <span>총 {formatValue(total)}</span>
                            <span>평균 {formatValue(average)}</span>
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                </article>
              ))}
            </div>
          </section>

          <section className="tno-plate tno-company-directory">
            <h3>주요 기업</h3>
            {companies.length ? (
              <div className="tno-company-list">
                {companies.map((company) => (
                  <details className="tno-company-card" key={company.id}>
                    <summary>
                      <span className="tno-company-logo">
                        {company.logo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={company.logo} alt={`${company.name} 로고`} />
                        ) : (
                          company.name.slice(0, 1)
                        )}
                      </span>
                      <span className="tno-company-name">
                        <strong>{company.name}</strong>
                        <small>{company.abbreviation || company.slogan}</small>
                      </span>
                      <em>{company.industry}</em>
                      <b>{company.stateOwned ? "국영" : company.legalForm || "민간"}</b>
                    </summary>
                    <div className="tno-company-profile">
                      <header>
                        <strong>{company.slogan || company.name}</strong>
                        <span>
                          규모 {company.sizeIndex} · 중요도 {company.systemicImportance} · 건전성{" "}
                          {company.health}
                        </span>
                      </header>
                      {company.history && <p className="tno-company-history">{company.history}</p>}
                      <div className="tno-company-fact-grid">
                        <CompanyFacts
                          title="기본정보"
                          items={[
                            ["기업형태", company.legalForm],
                            ["설립", company.founded],
                            ["본사", company.headquarters],
                            ["설립지", company.placeOfFoundation],
                            ["최고경영자", company.chiefExecutiveOfficer],
                            ["이사회 의장", company.boardChair],
                            ["모기업", company.parentCompany],
                            ["최대주주", company.largestShareholder],
                            ["주요주주", companyList(company.majorShareholders)],
                            ["주요 자회사", companyList(company.subsidiaries)],
                            ["주요 계열사", companyList(company.affiliates)],
                          ]}
                        />
                        <CompanyFacts
                          title="인적환경"
                          items={[
                            ["직원 수", `${plainNumber(company.employeeCount)}명`],
                            [
                              "간접고용 인구",
                              company.indirectEmployment === null
                                ? "—"
                                : `${plainNumber(company.indirectEmployment)}명`,
                            ],
                            [
                              "해외근무 인원",
                              company.overseasEmployees === null
                                ? "—"
                                : `${plainNumber(company.overseasEmployees)}명`,
                            ],
                            [
                              "평균 연봉",
                              company.averageSalary === null
                                ? "—"
                                : `${plainNumber(company.averageSalary)} ${currency}`,
                            ],
                            [
                              "노조 가입률",
                              company.unionMembershipRate === null
                                ? "—"
                                : pct(company.unionMembershipRate, 1),
                            ],
                          ]}
                        />
                        <CompanyFacts
                          title="경제"
                          items={[
                            ["매출액", companyMoney(company.revenue, currency)],
                            ["매출총이익", companyMoney(company.grossProfit, currency)],
                            ["영업이익", companyMoney(company.operatingProfit, currency)],
                            ["순이익", companyMoney(company.netIncome, currency)],
                            ["총자산", companyMoney(company.totalAssets, currency)],
                            ["총부채", companyMoney(company.totalDebt, currency)],
                            ["기업가치", companyMoney(company.enterpriseValue, currency)],
                            ["시가총액", companyMoney(company.marketCapitalization, currency)],
                            ["신용등급", company.creditRating],
                            [
                              "연구개발비",
                              companyMoney(company.researchAndDevelopmentExpense, currency),
                            ],
                            ["설비투자액", companyMoney(company.capitalExpenditure, currency)],
                            ["현금성자산", companyMoney(company.cashAndEquivalents, currency)],
                            ["배당액", companyMoney(company.dividendsPaid, currency)],
                            [
                              "부채비율",
                              company.debtRatio === null ? "—" : pct(company.debtRatio, 1),
                            ],
                            [
                              "영업이익률",
                              company.operatingMargin === null
                                ? "—"
                                : pct(company.operatingMargin, 1),
                            ],
                            [
                              "자동화 생산성 증가율",
                              `${pct(company.automationProductivityGrowthRate, 1)} / 연`,
                            ],
                          ]}
                        />
                        <CompanyFacts
                          title="사업"
                          items={[
                            ["주요 산업", company.industry],
                            ["주요 제품·서비스", companyList(company.productsAndServices)],
                            ["주요 브랜드", companyList(company.brands)],
                            ["주요 생산시설", companyList(company.productionFacilities)],
                            ["주요 연구시설", companyList(company.researchFacilities)],
                            ["주요 해외거점", companyList(company.overseasBases)],
                            ["주요 시장", companyList(company.majorMarkets)],
                            ["주요 경쟁사", companyList(company.competitors)],
                          ]}
                        />
                        <CompanyFacts
                          title="주식"
                          items={[
                            ["상장 여부", company.isListed ? "상장" : "비상장"],
                            ["상장 거래소", company.stockExchange],
                            ["종목코드", company.tickerSymbol],
                            ["발행주식수", plainNumber(company.sharesOutstanding)],
                            [
                              "주가",
                              company.sharePrice === null
                                ? "—"
                                : `${plainNumber(company.sharePrice)} ${currency}`,
                            ],
                            [
                              "배당수익률",
                              company.dividendYield === null ? "—" : pct(company.dividendYield, 1),
                            ],
                          ]}
                        />
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            ) : (
              <p>등록된 기업이 없습니다.</p>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
