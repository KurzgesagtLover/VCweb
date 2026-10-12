/**
 * 정치 수준 지표의 월간 증감.
 *
 * 예산·법·제도 변화는 지표를 한 번에 깎거나 올리지 않고 매월 조금씩 움직인다.
 * 한 턴이 몇 개월인지에 따라 누적해서 반영하며, 0이나 100에 가까워질수록 같은 방향의 변화는 둔해진다.
 * 성장률·물가·세수처럼 흐름을 나타내는 경제 지표는 이 모듈이 아니라 경제 계산의 구조 보정으로 다룬다.
 */

import { turnPeriod } from "../turn/period";

export const POLITICAL_LEVEL_METRICS = [
  "stability",
  "legitimacy",
  "governmentApproval",
  "unrest",
  "stateCapacity",
  "corruption",
  "democracy",
] as const;

export type PoliticalLevelMetric = (typeof POLITICAL_LEVEL_METRICS)[number];
export type MonthlyDrift = Partial<Record<PoliticalLevelMetric, number>>;

export const POLITICAL_LEVEL_LABELS: Record<PoliticalLevelMetric, string> = {
  stability: "안정도",
  legitimacy: "정통성",
  governmentApproval: "정권 지지",
  unrest: "사회 불안",
  stateCapacity: "행정 역량",
  corruption: "부패",
  democracy: "민주주의",
};

export const GAME_DAYS_PER_MONTH = 365 / 12;

/** 정치 지표는 소수 넷째 자리까지 저장한다. 분기 턴에서도 월간 변화가 반올림으로 사라지지 않게 한다. */
export const roundPoliticalMetric = (value: number) => Math.round(value * 10_000) / 10_000;

/** 턴 구간의 게임 개월 수. 게임 날짜는 양 끝을 포함한다. */
export function monthsInTurn(gameDateStart: string, gameDateEnd: string) {
  return turnPeriod(gameDateStart, gameDateEnd).months;
}

const roundRate = (value: number) => Math.round(value * 10_000) / 10_000;

export function scaleDrift(drift: MonthlyDrift, factor: number): MonthlyDrift {
  if (!Number.isFinite(factor) || factor === 0) return {};
  const scaled: MonthlyDrift = {};
  for (const metric of POLITICAL_LEVEL_METRICS) {
    const value = drift[metric];
    if (!value) continue;
    const rounded = roundRate(value * factor);
    if (rounded) scaled[metric] = rounded;
  }
  return scaled;
}

export function addDrifts(...drifts: MonthlyDrift[]): MonthlyDrift {
  const total: MonthlyDrift = {};
  for (const drift of drifts) {
    for (const metric of POLITICAL_LEVEL_METRICS) {
      const value = drift[metric];
      if (!value) continue;
      total[metric] = roundRate((total[metric] ?? 0) + value);
    }
  }
  for (const metric of POLITICAL_LEVEL_METRICS) {
    if (total[metric] === 0) delete total[metric];
  }
  return total;
}

export function isEmptyDrift(drift: MonthlyDrift) {
  return POLITICAL_LEVEL_METRICS.every((metric) => !drift[metric]);
}

/** 월간 증감을 한 턴 분량만큼 적용한다. */
export function applyMonthlyDrift(value: number, ratePerMonth: number, months: number) {
  if (!Number.isFinite(value) || !ratePerMonth || !(months > 0)) return value;
  const room = ratePerMonth > 0 ? (100 - value) / 50 : value / 50;
  const saturation = Math.min(1, Math.max(0.1, room));
  return Math.min(100, Math.max(0, value + ratePerMonth * months * saturation));
}

export type DriftChange = {
  metric: PoliticalLevelMetric;
  ratePerMonth: number;
  before: number;
  after: number;
};

/** 정치 스냅샷 객체에 월간 증감을 반영한다. */
export function applyMonthlyDrifts(
  political: Record<string, unknown>,
  drift: MonthlyDrift,
  months: number,
): DriftChange[] {
  const changes: DriftChange[] = [];
  for (const metric of POLITICAL_LEVEL_METRICS) {
    const rate = drift[metric];
    if (!rate) continue;
    const before = Number(political[metric]);
    if (!Number.isFinite(before)) continue;
    const after = roundPoliticalMetric(applyMonthlyDrift(before, rate, months));
    political[metric] = after;
    changes.push({ metric, ratePerMonth: rate, before, after });
  }
  return changes;
}

export function formatMonthlyDrift(drift: MonthlyDrift) {
  return POLITICAL_LEVEL_METRICS.flatMap((metric) => {
    const value = drift[metric];
    if (!value) return [];
    const rounded = Math.round(value * 100) / 100;
    return [`${POLITICAL_LEVEL_LABELS[metric]} 월 ${rounded > 0 ? "+" : ""}${rounded}`];
  });
}
