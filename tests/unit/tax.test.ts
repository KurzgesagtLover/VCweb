import { describe, expect, it } from "vitest";
import {
  calculateEffectiveTaxRate,
  calculateTaxRevenue,
  splitEffectiveTaxRate,
} from "../../src/domain/economy/tax";

describe("tax policy", () => {
  it("calculates revenue from the three weighted tax rates", () => {
    const rates = {
      incomeTaxRate: "0.3",
      corporateTaxRate: "0.2",
      otherTaxRate: "0.1",
    };

    expect(calculateEffectiveTaxRate(rates).toString()).toBe("0.22");
    expect(calculateTaxRevenue("1000", rates).toString()).toBe("220");
  });

  it("preserves a legacy effective rate when splitting it", () => {
    const rates = splitEffectiveTaxRate("0.25");
    expect(calculateEffectiveTaxRate(rates).toString()).toBe("0.25");
  });
});
