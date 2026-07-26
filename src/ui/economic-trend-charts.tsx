"use client";

import { useState } from "react";

export type EconomicTrendPoint = {
  turn: number;
  gameDate: string;
  nominalGdpGrowth: number | null;
  gdpDeflator: number;
  realGdpGrowth: number;
  populationGrowth: number | null;
  perCapitaGdpGrowth: number | null;
  realGdp: number;
  nominalGdp: number;
  realGni: number;
  nominalGni: number;
  realGnp: number;
  unemployment: number;
  inflation: number;
  governmentSpending: number;
  governmentSpendingToGdp: number | null;
  population: number | null;
  crudeBirthRate: number | null;
  fertilityRate: number | null;
};

type MetricKey = Exclude<keyof EconomicTrendPoint, "turn" | "gameDate">;
type ValueFormat = "percent" | "index" | "money" | "population" | "perThousand" | "fertility";

type Series = {
  key: MetricKey;
  label: string;
  color: string;
  dash?: string;
  axis?: "left" | "right";
  format: ValueFormat;
  zeroBaseline?: boolean;
};

type ChartSpec = {
  title: string;
  subtitle: string;
  series: Series[];
};

const BLUE = "#00c2ff";
const GOLD = "#f2b84b";
const ORANGE = "#f47c48";

function compact(value: number, digits = 1) {
  return new Intl.NumberFormat("ko-KR", {
    notation: "compact",
    maximumFractionDigits: digits,
  }).format(value);
}

function formatValue(value: number, format: ValueFormat, currency: string, axis = false) {
  if (format === "percent") return `${value.toFixed(1)}%`;
  if (format === "index") return value.toFixed(1);
  if (format === "money") return axis ? compact(value) : `${compact(value)} 백만 ${currency}`;
  if (format === "population") return axis ? compact(value) : `${compact(value)}명`;
  if (format === "perThousand") return `${value.toFixed(1)}‰`;
  return value.toFixed(2);
}

function domain(values: number[], zeroBaseline: boolean) {
  if (!values.length) return { min: 0, max: 1 };
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (zeroBaseline) {
    min = Math.min(0, min);
    max = Math.max(0, max);
  }
  if (min === max) {
    const padding = Math.abs(min || 1) * 0.12;
    min -= padding;
    max += padding;
  } else if (!zeroBaseline) {
    const padding = (max - min) * 0.08;
    min -= padding;
    max += padding;
  } else if (max > 0) {
    max *= 1.08;
  }
  return { min, max };
}

function EconomyLineChart({
  points,
  spec,
  currency,
}: {
  points: EconomicTrendPoint[];
  spec: ChartSpec;
  currency: string;
}) {
  const [visibleKeys, setVisibleKeys] = useState<MetricKey[]>(() =>
    spec.series.map((series) => series.key),
  );
  const activeSeries = spec.series.filter((series) => visibleKeys.includes(series.key));
  const hasRightAxis = activeSeries.some((series) => series.axis === "right");
  const leftSeries = activeSeries.filter((series) => series.axis !== "right");
  const rightSeries = activeSeries.filter((series) => series.axis === "right");
  const axisDomain = (series: Series[]) =>
    domain(
      series.flatMap((item) =>
        points
          .map((point) => point[item.key])
          .filter((value): value is number => typeof value === "number" && Number.isFinite(value)),
      ),
      series.some((item) => item.zeroBaseline),
    );
  const leftDomain = axisDomain(leftSeries);
  const rightDomain = axisDomain(rightSeries);
  const plotLeft = 64;
  const plotRight = hasRightAxis ? 686 : 724;
  const plotTop = 18;
  const plotBottom = 210;
  const x = (index: number) =>
    plotLeft + (index * (plotRight - plotLeft)) / Math.max(points.length - 1, 1);
  const y = (value: number, axis: "left" | "right" = "left") => {
    const selected = axis === "right" ? rightDomain : leftDomain;
    return (
      plotBottom -
      ((value - selected.min) / Math.max(selected.max - selected.min, Number.EPSILON)) *
        (plotBottom - plotTop)
    );
  };
  const path = (series: Series) => {
    let started = false;
    return points
      .map((point, index) => {
        const value = point[series.key];
        if (typeof value !== "number" || !Number.isFinite(value)) {
          started = false;
          return "";
        }
        const command = started ? "L" : "M";
        started = true;
        return `${command}${x(index).toFixed(2)},${y(value, series.axis).toFixed(2)}`;
      })
      .filter(Boolean)
      .join(" ");
  };
  const leftFormat = leftSeries[0]?.format ?? spec.series[0].format;
  const rightFormat = rightSeries[0]?.format;
  const toggle = (key: MetricKey) => {
    setVisibleKeys((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  };
  const labelStep = Math.max(1, Math.ceil(points.length / 6));

  return (
    <section className="economy-chart-card">
      <header>
        <h3>{spec.title}</h3>
        <p>{spec.subtitle}</p>
      </header>
      {spec.series.length > 1 && (
        <div className="chart-series-toggles" aria-label={`${spec.title} 표시 지표`}>
          {spec.series.map((series) => {
            const visible = visibleKeys.includes(series.key);
            const latest = points
              .map((point) => point[series.key])
              .findLast((value): value is number => typeof value === "number");
            return (
              <button
                type="button"
                key={series.key}
                aria-pressed={visible}
                className={visible ? "active" : undefined}
                onClick={() => toggle(series.key)}
                style={{ "--series-color": series.color } as React.CSSProperties}
              >
                <i aria-hidden="true" />
                <span>{series.label}</span>
                {latest !== undefined && (
                  <strong>{formatValue(latest, series.format, currency)}</strong>
                )}
              </button>
            );
          })}
        </div>
      )}
      <div className="economy-chart-wrap">
        <svg
          className="economy-chart economy-detail-chart"
          viewBox="0 0 800 250"
          role="img"
          aria-label={`${spec.title}. ${spec.subtitle}`}
        >
          {[0, 1, 2, 3, 4].map((tick) => {
            const ratio = tick / 4;
            const leftValue = leftDomain.max - (leftDomain.max - leftDomain.min) * ratio;
            const rightValue = rightDomain.max - (rightDomain.max - rightDomain.min) * ratio;
            const tickY = plotTop + (plotBottom - plotTop) * ratio;
            return (
              <g key={tick}>
                <line
                  className="chart-gridline"
                  x1={plotLeft}
                  x2={plotRight}
                  y1={tickY}
                  y2={tickY}
                />
                <text className="chart-axis-label" x={plotLeft - 10} y={tickY + 4} textAnchor="end">
                  {formatValue(leftValue, leftFormat, currency, true)}
                </text>
                {hasRightAxis && rightFormat && (
                  <text
                    className="chart-axis-label"
                    x={plotRight + 10}
                    y={tickY + 4}
                    textAnchor="start"
                  >
                    {formatValue(rightValue, rightFormat, currency, true)}
                  </text>
                )}
              </g>
            );
          })}
          {points.map((point, index) =>
            index % labelStep === 0 || index === points.length - 1 ? (
              <text
                className="chart-axis-label"
                key={`${point.turn}-${point.gameDate}`}
                x={x(index)}
                y="235"
                textAnchor="middle"
              >
                T{point.turn}
              </text>
            ) : null,
          )}
          {activeSeries.map((series) => (
            <g key={series.key}>
              <path
                className="chart-line"
                d={path(series)}
                stroke={series.color}
                strokeDasharray={series.dash}
              />
              {points.map((point, index) => {
                const value = point[series.key];
                if (typeof value !== "number" || !Number.isFinite(value)) return null;
                return (
                  <circle
                    key={`${series.key}-${point.turn}`}
                    cx={x(index)}
                    cy={y(value, series.axis)}
                    r="3.1"
                    fill="#08080b"
                    stroke={series.color}
                    strokeWidth="2"
                  >
                    <title>
                      {point.gameDate} · {series.label}{" "}
                      {formatValue(value, series.format, currency)}
                    </title>
                  </circle>
                );
              })}
            </g>
          ))}
        </svg>
      </div>
    </section>
  );
}

export function EconomicTrendCharts({
  points,
  currency,
}: {
  points: EconomicTrendPoint[];
  currency: string;
}) {
  if (!points.length) return <div className="empty-state">표시할 경제 추세가 없습니다.</div>;

  const charts: ChartSpec[] = [
    {
      title: "GDP 성장과 디플레이터",
      subtitle: "명목·실질 성장률(좌축, %) · GDP 디플레이터(우축, 기준연도=100)",
      series: [
        {
          key: "nominalGdpGrowth",
          label: "명목 GDP 성장률",
          color: BLUE,
          format: "percent",
          zeroBaseline: true,
        },
        {
          key: "realGdpGrowth",
          label: "실질 GDP 성장률",
          color: GOLD,
          dash: "8 5",
          format: "percent",
          zeroBaseline: true,
        },
        {
          key: "gdpDeflator",
          label: "GDP 디플레이터",
          color: ORANGE,
          dash: "2 5",
          axis: "right",
          format: "index",
        },
      ],
    },
    {
      title: "성장률 구성",
      subtitle: "실질 GDP·인구·1인당 실질 GDP 성장률(%)",
      series: [
        {
          key: "realGdpGrowth",
          label: "실질 GDP 성장률",
          color: BLUE,
          format: "percent",
          zeroBaseline: true,
        },
        {
          key: "populationGrowth",
          label: "인구 성장률",
          color: GOLD,
          dash: "8 5",
          format: "percent",
          zeroBaseline: true,
        },
        {
          key: "perCapitaGdpGrowth",
          label: "1인당 GDP 성장률",
          color: ORANGE,
          dash: "2 5",
          format: "percent",
          zeroBaseline: true,
        },
      ],
    },
    {
      title: "실질 GDP",
      subtitle: `백만 ${currency} · 기준연도 가격`,
      series: [
        {
          key: "realGdp",
          label: "실질 GDP",
          color: BLUE,
          format: "money",
          zeroBaseline: true,
        },
      ],
    },
    {
      title: "명목 GDP",
      subtitle: `백만 ${currency} · 당해연도 가격`,
      series: [
        {
          key: "nominalGdp",
          label: "명목 GDP",
          color: GOLD,
          format: "money",
          zeroBaseline: true,
        },
      ],
    },
    {
      title: "국민총소득",
      subtitle: `실질·명목 GNI · 백만 ${currency}`,
      series: [
        {
          key: "realGni",
          label: "실질 GNI",
          color: BLUE,
          format: "money",
          zeroBaseline: true,
        },
        {
          key: "nominalGni",
          label: "명목 GNI",
          color: GOLD,
          dash: "8 5",
          format: "money",
          zeroBaseline: true,
        },
      ],
    },
    {
      title: "실질 GNP",
      subtitle: `백만 ${currency} · 기준연도 가격`,
      series: [
        {
          key: "realGnp",
          label: "실질 GNP",
          color: BLUE,
          format: "money",
          zeroBaseline: true,
        },
      ],
    },
    {
      title: "실업률",
      subtitle: "경제활동인구 대비 실업자 비율(%)",
      series: [
        {
          key: "unemployment",
          label: "실업률",
          color: ORANGE,
          format: "percent",
          zeroBaseline: true,
        },
      ],
    },
    {
      title: "물가상승률",
      subtitle: "소비자물가 상승률(%)",
      series: [
        {
          key: "inflation",
          label: "물가상승률",
          color: GOLD,
          format: "percent",
          zeroBaseline: true,
        },
      ],
    },
    {
      title: "정부지출 규모",
      subtitle: `명목 GDP·정부지출(좌축, 백만 ${currency}) · GDP 대비 정부지출(우축, %)`,
      series: [
        {
          key: "nominalGdp",
          label: "명목 GDP",
          color: BLUE,
          format: "money",
          zeroBaseline: true,
        },
        {
          key: "governmentSpending",
          label: "정부지출액",
          color: GOLD,
          dash: "8 5",
          format: "money",
          zeroBaseline: true,
        },
        {
          key: "governmentSpendingToGdp",
          label: "GDP 대비 정부지출",
          color: ORANGE,
          dash: "2 5",
          axis: "right",
          format: "percent",
          zeroBaseline: true,
        },
      ],
    },
    {
      title: "인구",
      subtitle: "총인구(명)",
      series: [
        {
          key: "population",
          label: "인구",
          color: BLUE,
          format: "population",
          zeroBaseline: true,
        },
      ],
    },
    {
      title: "출생 지표",
      subtitle: "조출생률(좌축, 인구 1천 명당 모형 추정) · 합계출산율(우축, 여성 1명당)",
      series: [
        {
          key: "crudeBirthRate",
          label: "조출생률",
          color: BLUE,
          format: "perThousand",
          zeroBaseline: true,
        },
        {
          key: "fertilityRate",
          label: "합계출산율",
          color: GOLD,
          dash: "8 5",
          axis: "right",
          format: "fertility",
          zeroBaseline: true,
        },
      ],
    },
  ];

  return (
    <div className="economy-chart-grid">
      {charts.map((chart) => (
        <EconomyLineChart key={chart.title} points={points} spec={chart} currency={currency} />
      ))}
    </div>
  );
}
