export const TURN_TIME_ZONE = "Asia/Seoul";
export const TURN_CLOSE_HOUR = 23;
export const TURN_CLOSE_MINUTE = 55;
export const JUDGMENT_WINDOW_MS = 10 * 60 * 1000;

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const REAL_DAY_MS = 24 * 60 * 60 * 1000;
export const GAME_TIME_UNITS = ["DAY", "MONTH", "YEAR"] as const;
export type GameTimeUnit = (typeof GAME_TIME_UNITS)[number];

const GAME_DAYS_PER_UNIT: Record<GameTimeUnit, number> = {
  DAY: 1,
  MONTH: 365 / 12,
  YEAR: 365,
};

export function gameDurationInDays(value: number, unit: GameTimeUnit = "DAY") {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value * GAME_DAYS_PER_UNIT[unit];
}

export function adjudicationRealDayInterval(
  gameTimePerRealDayValue: number,
  adjudicationIntervalValue: number,
  gameTimePerRealDayUnit: GameTimeUnit = "DAY",
  adjudicationIntervalUnit: GameTimeUnit = "DAY",
) {
  const progressedGameDays = gameDurationInDays(gameTimePerRealDayValue, gameTimePerRealDayUnit);
  const intervalGameDays = gameDurationInDays(adjudicationIntervalValue, adjudicationIntervalUnit);
  if (!progressedGameDays || !intervalGameDays) return 1;
  return intervalGameDays / progressedGameDays;
}

export function addGameDuration(date: Date, value: number, unit: GameTimeUnit) {
  const result = new Date(date);
  if (unit === "DAY") {
    result.setUTCDate(result.getUTCDate() + value);
    return result;
  }

  const originalDay = result.getUTCDate();
  result.setUTCDate(1);
  if (unit === "MONTH") result.setUTCMonth(result.getUTCMonth() + value);
  else result.setUTCFullYear(result.getUTCFullYear() + value);
  const lastDayOfTargetMonth = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(originalDay, lastDayOfTargetMonth));
  return result;
}

export function advanceTurnDeadline(deadline: Date, intervalRealDays: number) {
  const normalizedInterval =
    Number.isFinite(intervalRealDays) && intervalRealDays > 0 ? intervalRealDays : 1;
  const intervalMs = normalizedInterval * REAL_DAY_MS;
  return new Date(deadline.getTime() + intervalMs);
}

export function nextTurnDeadline(
  now = new Date(),
  intervalRealDays = 1,
  closeHour = TURN_CLOSE_HOUR,
  closeMinute = TURN_CLOSE_MINUTE,
) {
  const seoul = new Date(now.getTime() + KST_OFFSET_MS);
  const anchor = new Date(
    Date.UTC(
      seoul.getUTCFullYear(),
      seoul.getUTCMonth(),
      seoul.getUTCDate(),
      closeHour - 9,
      closeMinute,
    ),
  );

  const normalizedInterval =
    Number.isFinite(intervalRealDays) && intervalRealDays > 0 ? intervalRealDays : 1;
  if (normalizedInterval < 1) {
    const intervalMs = normalizedInterval * REAL_DAY_MS;
    const elapsedIntervals = Math.floor((now.getTime() - anchor.getTime()) / intervalMs) + 1;
    return new Date(anchor.getTime() + elapsedIntervals * intervalMs);
  }

  if (anchor.getTime() > now.getTime()) return anchor;
  return advanceTurnDeadline(anchor, normalizedInterval);
}

export function judgmentEndsAt(deadline: Date) {
  return new Date(deadline.getTime() + JUDGMENT_WINDOW_MS);
}

function clockLabel(totalMinutes: number) {
  const normalizedMinutes = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const hour = Math.floor(normalizedMinutes / 60);
  const minute = normalizedMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function intervalLabel(intervalRealDays: number) {
  const totalMinutes = Math.max(1, Math.round(intervalRealDays * 1440));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  return [days ? `${days}일` : "", hours ? `${hours}시간` : "", minutes ? `${minutes}분` : ""]
    .filter(Boolean)
    .join(" ");
}

export function formatAdjudicationCadence(
  intervalRealDays: number,
  closeHour = TURN_CLOSE_HOUR,
  closeMinute = TURN_CLOSE_MINUTE,
) {
  const normalizedInterval =
    Number.isFinite(intervalRealDays) && intervalRealDays > 0 ? intervalRealDays : 1;
  const baseMinutes = closeHour * 60 + closeMinute;
  const adjudicationsPerDay = 1 / normalizedInterval;
  const roundedPerDay = Math.round(adjudicationsPerDay);

  if (
    roundedPerDay > 1 &&
    roundedPerDay <= 100 &&
    Math.abs(adjudicationsPerDay - roundedPerDay) < 1e-9
  ) {
    const intervalMinutes = 1440 / roundedPerDay;
    const times = Array.from({ length: roundedPerDay }, (_, index) =>
      clockLabel(baseMinutes - index * intervalMinutes),
    ).sort();
    return `하루 ${roundedPerDay}회 · ${times.join(" · ")}`;
  }

  const baseTime = clockLabel(baseMinutes);
  if (Math.abs(normalizedInterval - 1) < 1e-9) return `매일 ${baseTime}`;
  return `${intervalLabel(normalizedInterval)}마다 · 기준 ${baseTime}`;
}

export function formatSeoulSchedule(date: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: TURN_TIME_ZONE,
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
