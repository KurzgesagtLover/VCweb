"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { MapMode } from "@/src/domain/map/map-mode";
import { formatMetric } from "./metric-format";

export type PoliticalStatusMetrics = {
  stability: number;
  legitimacy: number;
  governmentApproval: number;
  policySupport: number;
  stateCapacity: number;
  democracy: number;
  unrest: number;
  corruption: number;
};

type MetricKey = keyof PoliticalStatusMetrics;

export type PoliticalMetricDetails = Record<
  MetricKey,
  { ratePerGameDay: number | null; causes: string[] }
>;

const METRICS: Array<{ key: MetricKey; label: string; invert?: boolean }> = [
  { key: "stability", label: "안정도" },
  { key: "legitimacy", label: "정통성" },
  { key: "governmentApproval", label: "정권 지지" },
  { key: "policySupport", label: "정책 지지" },
  { key: "stateCapacity", label: "행정 역량" },
  { key: "democracy", label: "민주주의" },
  { key: "unrest", label: "사회 불안", invert: true },
  { key: "corruption", label: "부패", invert: true },
];

function PoliticalMetricIcon({ metric }: { metric: MetricKey }) {
  const artwork = (() => {
    switch (metric) {
      case "stability":
        return (
          <>
            <path d="M12 2.8 19 6v5.3c0 4.5-2.7 7.8-7 9.8-4.3-2-7-5.3-7-9.8V6z" />
            <path d="m8.5 12 2.2 2.2 4.8-4.8" />
          </>
        );
      case "legitimacy":
        return (
          <>
            <path d="M5 10.5 7.2 5l4.8 4 4.8-4 2.2 5.5-2 7H7z" />
            <path d="M7 14.2h10M6.5 19.5h11" />
            <circle cx="12" cy="12" r="1.2" />
          </>
        );
      case "governmentApproval":
        return (
          <>
            <circle cx="8" cy="8" r="2.5" />
            <path d="M3.8 18v-1.3c0-2.8 1.8-4.7 4.2-4.7 1.7 0 3.1.9 3.8 2.4" />
            <path d="m13.2 15.5 2.1 2.1 4.6-5" />
          </>
        );
      case "policySupport":
        return (
          <>
            <path d="M6 3.5h9l3 3V20H6zM15 3.5v3h3" />
            <path d="M9 9.5h5M9 12.5h3M9 16l1.8 1.8 4.2-4.3" />
          </>
        );
      case "stateCapacity":
        return (
          <>
            <circle cx="12" cy="12" r="3" />
            <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
          </>
        );
      case "democracy":
        return (
          <>
            <path d="M5 9h14v11H5zM8 9V5h8v4" />
            <path d="m9.2 4 2.2-1 2.7 3.5-2.2 1zM9 14h6" />
          </>
        );
      case "unrest":
        return (
          <>
            <path d="M7 20v-7.5M10 20V9M13 20V8M16 20v-7.5" />
            <path d="M7 13 5.4 9.8A1.7 1.7 0 0 1 8.5 8l1.5 2M13 10l1.5-2a1.7 1.7 0 0 1 3.1 1.8L16 13M6.5 20h10.5" />
          </>
        );
      case "corruption":
        return (
          <>
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 6.5v11M15.5 8.8c-.8-1-1.9-1.5-3.4-1.5-1.8 0-3.1.9-3.1 2.2 0 3.4 6.1 1.3 6.1 4.8 0 1.4-1.3 2.4-3.3 2.4-1.5 0-2.8-.5-3.7-1.6" />
            <path d="m15.8 4.7-7.5 14.6" />
          </>
        );
    }
  })();

  return (
    <svg
      viewBox="0 0 24 24"
      className="political-status-icon"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.55"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {artwork}
    </svg>
  );
}

export function PoliticalStatusRail({
  metrics,
  details,
}: {
  metrics: PoliticalStatusMetrics;
  details: PoliticalMetricDetails;
}) {
  const [openMetric, setOpenMetric] = useState<MetricKey | null>(null);
  const [mapMode, setMapMode] = useState<MapMode | null>(null);
  const [showSatellites, setShowSatellites] = useState(false);
  const [showCities, setShowCities] = useState(true);

  useEffect(() => {
    const reportMapMode = () => {
      window.dispatchEvent(
        new CustomEvent("game-map-mode-change", {
          detail: { mode: mapMode, showSatellites, showCities },
        }),
      );
    };
    window.addEventListener("game-map-mode-request", reportMapMode);
    return () => window.removeEventListener("game-map-mode-request", reportMapMode);
  }, [mapMode, showSatellites, showCities]);

  function changeMapMode(
    nextMode: MapMode | null,
    nextSatellites = showSatellites,
    nextCities = showCities,
  ) {
    setMapMode(nextMode);
    setShowSatellites(nextSatellites);
    setShowCities(nextCities);
    const detail = {
      mode: nextMode,
      showSatellites: nextSatellites,
      showCities: nextCities,
    };
    window.dispatchEvent(
      new CustomEvent("game-map-mode-change", {
        detail,
      }),
    );
  }

  return (
    <aside className="political-status-rail" aria-label="국가 정치 지표">
      {METRICS.map(({ key, label, invert }) => {
        const value = metrics[key];
        const effectiveValue = invert ? 100 - value : value;
        const tone = effectiveValue >= 60 ? "good" : effectiveValue < 40 ? "bad" : "neutral";
        const rate = details[key].ratePerGameDay;
        const moving = rate !== null && Math.abs(rate) > 0.0001;
        const flowDuration = moving
          ? Math.max(0.45, Math.min(3.2, 1.7 / Math.max(Math.abs(rate), 0.15)))
          : 0;

        const isOpen = openMetric === key;
        return (
          <div className="political-status-entry" data-open={isOpen || undefined} key={key}>
            <button
              type="button"
              className="political-status-item"
              data-tone={tone}
              aria-expanded={isOpen}
              onClick={() => setOpenMetric(isOpen ? null : key)}
              title={`${label} ${formatMetric(value)}${rate === null ? "" : ` · ${rate > 0 ? "+" : ""}${rate.toFixed(2)} /일`}`}
            >
              <PoliticalMetricIcon metric={key} />
              <span className="political-status-label">{label}</span>
              <strong>{formatMetric(value)}</strong>
              <span className="political-status-meter" aria-hidden="true">
                <i
                  data-tone={tone}
                  data-flow={moving ? (rate > 0 ? "increase" : "decrease") : undefined}
                  style={
                    {
                      "--metric-fill": `${Math.max(0, Math.min(100, value))}%`,
                      "--metric-flow-duration": `${flowDuration}s`,
                    } as CSSProperties
                  }
                />
              </span>
            </button>
            {isOpen ? <PoliticalMetricBreakdown details={details[key]} /> : null}
          </div>
        );
      })}
      <div className="map-mode-controls" aria-label="지도 모드">
        {(
          [
            ["GDP", "GDP", "M4 18h16M6 15l3-4 3 2 5-7 2 2"],
            ["GDP_PER_CAPITA", "1인당 GDP", "M5 19h14M8 16V8m4 8V5m4 11v-5"],
            ["POPULATION", "인구", "M4 19c0-3 2-5 5-5s5 2 5 5M9 14c0-2 1.2-3.5 3-3.5s3 1.5 3 3.5"],
            ["BLOC", "세력", "M5 18V8l7-4 7 4v10l-7 4zM9 10h6"],
            ["ECONOMIC_BLOC", "경제권", "M4 9h16M6 9V6h12v3M6 9v9h12V9M9 13h6"],
          ] as const
        ).map(([mode, label, path]) => (
          <button
            type="button"
            key={mode}
            className={mapMode === mode ? "active" : ""}
            aria-pressed={mapMode === mode}
            title={label}
            aria-label={`${label} 지도 모드`}
            onClick={() => changeMapMode(mapMode === mode ? null : mode)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={path} />
            </svg>
          </button>
        ))}
        <button
          type="button"
          className={showSatellites ? "active" : ""}
          aria-pressed={showSatellites}
          title={`위성통신망 ${showSatellites ? "숨기기" : "표시"}`}
          aria-label={`위성통신망 ${showSatellites ? "숨기기" : "표시"}`}
          onClick={() => changeMapMode(mapMode, !showSatellites)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M4.5 9c2-4 7-6 11-3.5S21 12 19 16s-7 5-11 2.5S3 13 4.5 9Z" />
          </svg>
        </button>
        <button
          type="button"
          className={showCities ? "active" : ""}
          aria-pressed={showCities}
          title={`도시 ${showCities ? "숨기기" : "표시"}`}
          aria-label={`도시 ${showCities ? "숨기기" : "표시"}`}
          onClick={() => changeMapMode(mapMode, showSatellites, !showCities)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="5" y="5" width="6" height="6" />
            <circle cx="17" cy="16" r="2.5" />
          </svg>
        </button>
      </div>
    </aside>
  );
}

function PoliticalMetricBreakdown({
  details,
}: {
  details: { ratePerGameDay: number | null; causes: string[] };
}) {
  const rate = details.ratePerGameDay;
  return (
    <div className="political-status-breakdown">
      <div>
        <span>변동 속도</span>
        <strong data-tone={rate !== null && rate < 0 ? "bad" : "good"}>
          {rate === null ? "자료 없음" : `${rate > 0 ? "+" : ""}${rate.toFixed(2)} /일`}
        </strong>
      </div>
      <span>변동 원인</span>
      <ul>
        {(details.causes.length ? details.causes : ["현재 적용 중인 수정자 없음"]).map((cause) => (
          <li key={cause}>{cause}</li>
        ))}
      </ul>
    </div>
  );
}
