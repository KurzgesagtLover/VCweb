import Decimal from "decimal.js";

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

export function formatMoney(value: string | null | undefined, currency = "기준화폐") {
  if (!value) return "—";
  return `${formatDecimal(value, 1)} 백만 ${currency}`;
}

export function formatPerCapita(
  value: string | null | undefined,
  population: string | null | undefined,
  currency = "기준화폐",
) {
  if (!value || !population || new Decimal(population).isZero()) return "—";
  const amount = new Decimal(value).mul(1_000_000).div(population);
  return `${new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(amount.toNumber())} ${currency}`;
}
