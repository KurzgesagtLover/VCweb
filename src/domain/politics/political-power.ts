import Decimal from "decimal.js";
import { gameDurationInDays, type GameTimeUnit } from "@/src/domain/turn/schedule";

const REAL_DAY_SECONDS = 86_400;
const MAX_POLITICAL_POWER = new Decimal(1000);

export type PoliticalPowerClock = {
  gameTimePerRealDayValue: number;
  gameTimePerRealDayUnit: GameTimeUnit;
};

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
  const nextBalance = Decimal.max(
    0,
    Decimal.min(MAX_POLITICAL_POWER, new Decimal(balance).plus(accrued)),
  );
  return { balance: nextBalance, incomePerRealSecond };
}
