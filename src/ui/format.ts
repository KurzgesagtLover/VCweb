import Decimal from "decimal.js";
import { ECONOMY_STATISTICS_CURRENCY } from "@/src/domain/economy/currency";

export function formatDecimal(value: string | number | null | undefined, digits = 1) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("ko-KR", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(new Decimal(value).toNumber());
}

export function formatPercent(value: string | number | null | undefined, digits = 1) {
  if (value === null || value === undefined) return "—";
  return `${new Decimal(value).mul(100).toFixed(digits)}%`;
}

export function formatMoney(
  value: string | null | undefined,
  currency: string = ECONOMY_STATISTICS_CURRENCY,
) {
  if (!value) return "—";
  return `${formatDecimal(value, 1)} 백만 ${currency}`;
}

/** 연재·홍보 예산. 저장값은 $1M 단위 숫자다. */
export function formatMillionDollars(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  const amount = new Decimal(value);
  if (!amount.isFinite()) return "—";
  const digits = amount.abs().gte(10) || amount.isInteger() ? 0 : 1;
  return `$${formatDecimal(amount.toString(), digits)}M`;
}

export function formatPerCapita(
  value: string | null | undefined,
  population: string | null | undefined,
  currency: string = ECONOMY_STATISTICS_CURRENCY,
) {
  if (!value || !population || new Decimal(population).isZero()) return "—";
  const amount = new Decimal(value).mul(1_000_000).div(population);
  return `${new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(amount.toNumber())} ${currency}`;
}
