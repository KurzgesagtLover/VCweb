"use client";

import Decimal from "decimal.js";
import { useMemo, useState, type FormEvent } from "react";
import type { EconomyInput, EconomyRules } from "@/src/domain/economy/calculator";
import {
  defaultEconomyProjectionSettings,
  runEconomyProjection,
  type EconomyProjectionPoint,
} from "@/src/domain/economy/simulator";

type MetricKey =
  | "realGdpIndex"
  | "realGdpGrowth"
  | "inflationRate"
  | "unemploymentRate"
  | "debtToGdp"
  | "governmentSpendingToGdp";

const metrics: Record<
  MetricKey,
  { label: string; unit: string; zeroBaseline?: boolean; digits?: number }
> = {
  realGdpIndex: { label: "실질 GDP 지수", unit: "", digits: 1 },
  realGdpGrowth: { label: "실질 GDP 성장률", unit: "%", zeroBaseline: true },
  inflationRate: { label: "물가상승률", unit: "%", zeroBaseline: true },
  unemploymentRate: { label: "실업률", unit: "%", zeroBaseline: true },
  debtToGdp: { label: "GDP 대비 국가부채", unit: "%", zeroBaseline: true },
  governmentSpendingToGdp: { label: "GDP 대비 정부지출", unit: "%", zeroBaseline: true },
};

function percentValue(value: string) {
  return new Decimal(value || 0).mul(100).toDecimalPlaces(3).toString();
}

function decimalPercent(form: FormData, name: string, fallback: string) {
  const value = Number(form.get(name));
  return Number.isFinite(value) ? new Decimal(value).div(100).toString() : fallback;
}

function numericValue(form: FormData, name: string, fallback: string) {
  const value = Number(form.get(name));
  return Number.isFinite(value) ? String(value) : fallback;
}

function integerValue(form: FormData, name: string, fallback: number) {
  const value = Number(form.get(name));
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

function formatValue(value: number, metric: MetricKey) {
  const spec = metrics[metric];
  return `${new Intl.NumberFormat("ko-KR", {
    maximumFractionDigits: spec.digits ?? 2,
  }).format(value)}${spec.unit}`;
}

function formatDelta(value: number, unit = "%p") {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}${unit}`;
}

function metricDomain(
  baseline: EconomyProjectionPoint[],
  scenario: EconomyProjectionPoint[],
  metric: MetricKey,
) {
  const values = [...baseline, ...scenario]
    .map((point) => point[metric])
    .filter((value) => Number.isFinite(value));
  let min = Math.min(...values);
  const max = Math.max(...values);
  if (!values.length) return { min: 0, max: 1 };
  if (metrics[metric].zeroBaseline) min = Math.min(0, min);
  if (min === max) {
    const padding = Math.abs(min || 1) * 0.12;
    return { min: min - padding, max: max + padding };
  }
  const padding = (max - min) * 0.08;
  return { min: min - padding, max: max + padding };
}

function ProjectionChart({
  baseline,
  scenario,
  metric,
}: {
  baseline: EconomyProjectionPoint[];
  scenario: EconomyProjectionPoint[];
  metric: MetricKey;
}) {
  const width = 800;
  const height = 280;
  const left = 68;
  const right = 782;
  const top = 18;
  const bottom = 238;
  const domain = metricDomain(baseline, scenario, metric);
  const x = (index: number) => left + (index * (right - left)) / Math.max(scenario.length - 1, 1);
  const y = (value: number) =>
    bottom -
    ((value - domain.min) / Math.max(domain.max - domain.min, Number.EPSILON)) * (bottom - top);
  const path = (points: EconomyProjectionPoint[]) =>
    points
      .map(
        (point, index) =>
          `${index ? "L" : "M"}${x(index).toFixed(2)},${y(point[metric]).toFixed(2)}`,
      )
      .join(" ");
  const labelStep = Math.max(1, Math.ceil((scenario.length - 1) / 6));
  const pointStep = Math.max(1, Math.ceil(scenario.length / 28));

  return (
    <div className="economy-chart-wrap">
      <svg
        className="economy-chart economy-simulation-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${metrics[metric].label} 기준선과 모의 시나리오 비교`}
      >
        <title>{metrics[metric].label} 모의 경로</title>
        <desc>점선은 현 상태 유지, 실선은 입력한 시나리오입니다.</desc>
        {[0, 1, 2, 3, 4].map((tick) => {
          const ratio = tick / 4;
          const value = domain.max - (domain.max - domain.min) * ratio;
          const tickY = top + (bottom - top) * ratio;
          return (
            <g key={tick}>
              <line className="chart-gridline" x1={left} x2={right} y1={tickY} y2={tickY} />
              <text className="chart-axis-label" x={left - 10} y={tickY + 4} textAnchor="end">
                {formatValue(value, metric)}
              </text>
            </g>
          );
        })}
        {scenario.map((point, index) =>
          index % labelStep === 0 || index === scenario.length - 1 ? (
            <text
              className="chart-axis-label"
              key={`turn-${point.turn}`}
              x={x(index)}
              y="263"
              textAnchor="middle"
            >
              T{point.turn}
            </text>
          ) : null,
        )}
        <path className="simulation-line baseline" d={path(baseline)} />
        <path className="simulation-line scenario" d={path(scenario)} />
        {scenario.map((point, index) =>
          index % pointStep === 0 || index === scenario.length - 1 ? (
            <circle
              className="simulation-point"
              key={`scenario-${point.turn}`}
              cx={x(index)}
              cy={y(point[metric])}
              r="3"
            >
              <title>
                T{point.turn} · {formatValue(point[metric], metric)}
              </title>
            </circle>
          ) : null,
        )}
      </svg>
    </div>
  );
}

export function AdminEconomySimulator({
  countryName,
  initialInput,
  rules,
}: {
  countryName: string;
  initialInput: EconomyInput;
  rules: EconomyRules;
}) {
  const defaults = useMemo(() => defaultEconomyProjectionSettings(initialInput), [initialInput]);
  const [settings, setSettings] = useState(defaults);
  const [metric, setMetric] = useState<MetricKey>("realGdpGrowth");
  const baselineSettings = useMemo(
    () => ({ ...defaults, turns: settings.turns }),
    [defaults, settings.turns],
  );
  const baseline = useMemo(
    () => runEconomyProjection(initialInput, baselineSettings, rules).points,
    [initialInput, baselineSettings, rules],
  );
  const scenario = useMemo(
    () => runEconomyProjection(initialInput, settings, rules).points,
    [initialInput, settings, rules],
  );
  const baseFinal = baseline.at(-1)!;
  const scenarioFinal = scenario.at(-1)!;
  const realGdpGap = baseFinal.realGdp ? (scenarioFinal.realGdp / baseFinal.realGdp - 1) * 100 : 0;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSettings({
      turns: integerValue(form, "turns", defaults.turns),
      taxRate: decimalPercent(form, "taxRate", defaults.taxRate),
      governmentSpendingGrowth: decimalPercent(
        form,
        "governmentSpendingGrowth",
        defaults.governmentSpendingGrowth,
      ),
      policyRate: decimalPercent(form, "policyRate", defaults.policyRate),
      researchInvestmentRate: decimalPercent(
        form,
        "researchInvestmentRate",
        defaults.researchInvestmentRate,
      ),
      structuralReform: decimalPercent(form, "structuralReform", defaults.structuralReform),
      externalShock: decimalPercent(form, "externalShock", defaults.externalShock),
      shockDuration: integerValue(form, "shockDuration", defaults.shockDuration),
      sectorShareWeightedGrowth: decimalPercent(
        form,
        "sectorShareWeightedGrowth",
        defaults.sectorShareWeightedGrowth,
      ),
      educationIndex: numericValue(form, "educationIndex", defaults.educationIndex),
      stateCapacity: numericValue(form, "stateCapacity", defaults.stateCapacity),
      financialHealth: numericValue(form, "financialHealth", defaults.financialHealth),
      corporateHealth: numericValue(form, "corporateHealth", defaults.corporateHealth),
    });
  };

  return (
    <div className="economy-simulator">
      <div className="simulator-heading">
        <div>
          <span className="eyebrow">ECONOMIC SANDBOX</span>
          <h3>{countryName} 모의실험</h3>
        </div>
        <span className="status-pill">원장 미반영</span>
      </div>

      <div className="economy-simulator-layout">
        <form className="economy-simulator-form" onSubmit={submit}>
          <fieldset>
            <legend>기간</legend>
            <div className="form-grid">
              <label>
                모의 기간
                <input name="turns" type="number" min="1" max="100" defaultValue={defaults.turns} />
              </label>
              <label>
                충격 지속 기간
                <input
                  name="shockDuration"
                  type="number"
                  min="0"
                  max="100"
                  defaultValue={defaults.shockDuration}
                />
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend>재정·통화</legend>
            <div className="form-grid">
              <label>
                세율
                <input
                  name="taxRate"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  defaultValue={percentValue(defaults.taxRate)}
                />
              </label>
              <label>
                정부지출 증가율
                <input
                  name="governmentSpendingGrowth"
                  type="number"
                  min="-50"
                  max="50"
                  step="0.1"
                  defaultValue={percentValue(defaults.governmentSpendingGrowth)}
                />
              </label>
              <label>
                기준금리
                <input
                  name="policyRate"
                  type="number"
                  min="-2"
                  max="35"
                  step="0.1"
                  defaultValue={percentValue(defaults.policyRate)}
                />
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend>성장·충격</legend>
            <div className="form-grid">
              <label>
                연구개발 투자율
                <input
                  name="researchInvestmentRate"
                  type="number"
                  min="0"
                  max="20"
                  step="0.1"
                  defaultValue={percentValue(defaults.researchInvestmentRate)}
                />
              </label>
              <label>
                구조개혁 강도
                <input
                  name="structuralReform"
                  type="number"
                  min="-10"
                  max="20"
                  step="0.1"
                  defaultValue={percentValue(defaults.structuralReform)}
                />
              </label>
              <label>
                외부 충격
                <input
                  name="externalShock"
                  type="number"
                  min="-200"
                  max="200"
                  step="0.1"
                  defaultValue={percentValue(defaults.externalShock)}
                />
              </label>
              <label>
                산업 성장률
                <input
                  name="sectorShareWeightedGrowth"
                  type="number"
                  min="-50"
                  max="50"
                  step="0.1"
                  defaultValue={percentValue(defaults.sectorShareWeightedGrowth)}
                />
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend>구조 지표</legend>
            <div className="form-grid">
              <label>
                교육지수
                <input
                  name="educationIndex"
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  defaultValue={defaults.educationIndex}
                />
              </label>
              <label>
                국가역량
                <input
                  name="stateCapacity"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  defaultValue={defaults.stateCapacity}
                />
              </label>
              <label>
                금융 건전성
                <input
                  name="financialHealth"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  defaultValue={defaults.financialHealth}
                />
              </label>
              <label>
                기업 건전성
                <input
                  name="corporateHealth"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  defaultValue={defaults.corporateHealth}
                />
              </label>
            </div>
          </fieldset>
          <button type="submit">모의 실행</button>
        </form>

        <div className="economy-simulator-results">
          <div className="simulation-summary">
            <article>
              <span>최종 성장률</span>
              <strong>{formatValue(scenarioFinal.realGdpGrowth, "realGdpGrowth")}</strong>
              <small>
                기준 대비 {formatDelta(scenarioFinal.realGdpGrowth - baseFinal.realGdpGrowth)}
              </small>
            </article>
            <article>
              <span>실질 GDP 격차</span>
              <strong>{formatDelta(realGdpGap, "%")}</strong>
              <small>T{scenarioFinal.turn} 기준</small>
            </article>
            <article>
              <span>최종 부채비율</span>
              <strong>{formatValue(scenarioFinal.debtToGdp, "debtToGdp")}</strong>
              <small>기준 대비 {formatDelta(scenarioFinal.debtToGdp - baseFinal.debtToGdp)}</small>
            </article>
          </div>

          <div className="simulation-chart-head">
            <div className="simulation-legend" aria-label="그래프 범례">
              <span className="baseline">현 상태 유지</span>
              <span className="scenario">모의 시나리오</span>
            </div>
            <label>
              표시 지표
              <select
                value={metric}
                onChange={(event) => setMetric(event.target.value as MetricKey)}
              >
                {(Object.keys(metrics) as MetricKey[]).map((key) => (
                  <option value={key} key={key}>
                    {metrics[key].label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <ProjectionChart baseline={baseline} scenario={scenario} metric={metric} />
        </div>
      </div>
    </div>
  );
}
