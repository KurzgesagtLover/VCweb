import Decimal from "decimal.js";

export const TAX_RATE_MAX = 0.75;

export const TAX_BASE_WEIGHTS = {
  incomeTaxRate: 0.5,
  corporateTaxRate: 0.2,
  otherTaxRate: 0.3,
} as const;

export type TaxRates = Record<keyof typeof TAX_BASE_WEIGHTS, string>;

export function calculateEffectiveTaxRate(rates: TaxRates) {
  return Object.entries(TAX_BASE_WEIGHTS).reduce(
    (total, [key, weight]) => total.plus(new Decimal(rates[key as keyof TaxRates]).mul(weight)),
    new Decimal(0),
  );
}

export function calculateTaxRevenue(nominalGdp: Decimal.Value, rates: TaxRates) {
  return new Decimal(nominalGdp).mul(calculateEffectiveTaxRate(rates));
}

export function splitEffectiveTaxRate(taxRate: Decimal.Value): TaxRates {
  const value = new Decimal(taxRate).toFixed(6);
  return {
    incomeTaxRate: value,
    corporateTaxRate: value,
    otherTaxRate: value,
  };
}
