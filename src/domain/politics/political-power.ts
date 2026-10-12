import Decimal from "decimal.js";
import { gameDurationInDays, type GameTimeUnit } from "@/src/domain/turn/schedule";

const REAL_DAY_SECONDS = 86_400;

/** 정치력 잔고 범위. 0 아래는 '정치적 부채'로 최저 -250까지 허용한다. */
export const POLITICAL_POWER_MIN = -250;
export const POLITICAL_POWER_MAX = 1000;

export type PoliticalPowerClock = {
  gameTimePerRealDayValue: number;
  gameTimePerRealDayUnit: GameTimeUnit;
};

export function clampPoliticalPower(value: Decimal.Value) {
  return Decimal.max(POLITICAL_POWER_MIN, Decimal.min(POLITICAL_POWER_MAX, new Decimal(value)));
}

/**
 * 실시간으로 정치력을 정산한다. incomePerGameDay는 수입에서 유지비를 뺀 순증이므로 음수일 수 있다.
 */
export function accruePoliticalPower({
  balance,
  incomePerGameDay,
  elapsedRealSeconds,
  clock,
}: {
  balance: Decimal.Value;
  incomePerGameDay: Decimal.Value;
  elapsedRealSeconds: number;
  clock: PoliticalPowerClock;
}) {
  const gameDaysPerRealDay = gameDurationInDays(
    clock.gameTimePerRealDayValue,
    clock.gameTimePerRealDayUnit,
  );
  const incomePerRealSecond = new Decimal(incomePerGameDay)
    .mul(gameDaysPerRealDay)
    .div(REAL_DAY_SECONDS);
  const accrued = incomePerRealSecond.mul(Math.max(0, elapsedRealSeconds));
  return { balance: clampPoliticalPower(new Decimal(balance).plus(accrued)), incomePerRealSecond };
}
