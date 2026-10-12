/**
 * 턴 길이 계산.
 *
 * 경제·정치 계산의 계수는 연간 기준이고, 실제 변화는 턴 길이(연)만큼 비례해서 적용한다.
 * 월 경계에 맞춘 턴(예: 1월 1일~3월 31일)은 달력 개월 수로 정확히 계산하고,
 * 그 밖의 구간은 일수를 게임 1년(365일)으로 나눈다.
 */

const DAY_MS = 86_400_000;
export const PERIOD_DAYS_PER_YEAR = 365;

export type GamePeriod = {
  /** 구간 일수 */
  days: number;
  /** 구간 개월 수 */
  months: number;
  /** 구간 연수 */
  years: number;
};

const DEFAULT_PERIOD: GamePeriod = { days: PERIOD_DAYS_PER_YEAR, months: 12, years: 1 };

function parseDate(value: string) {
  return Date.parse(`${value}T00:00:00.000Z`);
}

/** 시작일(포함)부터 끝 날짜(미포함)까지의 기간. */
export function periodBetween(startInclusive: string, endExclusive: string): GamePeriod | null {
  const start = parseDate(startInclusive);
  const end = parseDate(endExclusive);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const days = (end - start) / DAY_MS;
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (startDate.getUTCDate() === endDate.getUTCDate()) {
    const months =
      (endDate.getUTCFullYear() - startDate.getUTCFullYear()) * 12 +
      endDate.getUTCMonth() -
      startDate.getUTCMonth();
    if (months > 0) return { days, months, years: months / 12 };
  }
  const years = days / PERIOD_DAYS_PER_YEAR;
  return { days, months: years * 12, years };
}

function nextDay(value: string) {
  const time = parseDate(value);
  if (!Number.isFinite(time)) return value;
  return new Date(time + DAY_MS).toISOString().slice(0, 10);
}

/** 턴 구간의 길이. 게임 날짜는 양 끝을 포함한다. */
export function turnPeriod(gameDateStart: string, gameDateEnd: string): GamePeriod {
  return periodBetween(gameDateStart, nextDay(gameDateEnd)) ?? DEFAULT_PERIOD;
}

/** 앞 턴이 끝난 뒤부터 뒤 턴이 시작하기 전까지 지난 개월 수. 겹치거나 순서가 바뀌면 0. */
export function monthsAfterTurnEnd(previousTurnGameDateEnd: string, laterGameDateStart: string) {
  return periodBetween(nextDay(previousTurnGameDateEnd), laterGameDateStart)?.months ?? 0;
}

/** 두 턴의 끝 날짜 사이 연수. 같은 날이거나 순서가 바뀌면 0. */
export function yearsBetweenTurnEnds(earlierGameDateEnd: string, laterGameDateEnd: string) {
  return periodBetween(nextDay(earlierGameDateEnd), nextDay(laterGameDateEnd))?.years ?? 0;
}
