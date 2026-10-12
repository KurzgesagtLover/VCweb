/**
 * 0–100 정치 지표 표시.
 * 저장값은 분기 턴의 작은 월간 변화도 남도록 소수로 두고, 화면에는 정수로 보여 준다.
 */
export function formatMetric(value: number | string | null | undefined, fallback = "—") {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return String(Math.round(number));
}

/** 정수로 반올림한 지표 값. 비교·막대 길이 계산에 쓴다. */
export function roundedMetric(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
}
