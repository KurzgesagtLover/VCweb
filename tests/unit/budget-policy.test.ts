import { describe, expect, it } from "vitest";
import {
  BUDGET_PRESETS,
  BUDGET_PRESET_IDS,
  BUDGET_SECTORS,
  getBudgetPresetContext,
  rebalanceBudgetAllocation,
  validateBudgetAllocation,
} from "@/src/domain/economy/budget";

describe("government budget policy", () => {
  it("keeps every preset at exactly one hundred percent", () => {
    for (const presetId of BUDGET_PRESET_IDS) {
      const allocation = BUDGET_PRESETS[presetId].allocation;
      const total = BUDGET_SECTORS.reduce((sum, sector) => sum + allocation[sector.key], 0);
      expect(total, presetId).toBe(100);
      expect(validateBudgetAllocation(presetId, allocation)).toBe(true);
    }
  });

  it("limits presets according to the governing ideology", () => {
    const market = getBudgetPresetContext({
      economicSystem: "FREE_MARKET",
      economicAxis: 60,
      socialAxis: -20,
    });
    const authoritarian = getBudgetPresetContext({
      economicSystem: "PLANNED",
      economicAxis: -20,
      socialAxis: 70,
    });

    expect(market.recommended).toBe("GROWTH_FIRST");
    expect(market.allowed).toContain("GROWTH_FIRST");
    expect(market.allowed).not.toContain("NATIONAL_SECURITY");
    expect(authoritarian.recommended).toBe("NATIONAL_SECURITY");
    expect(authoritarian.allowed).toContain("STATE_DEVELOPMENT");
    expect(authoritarian.allowed).not.toContain("CIVIC_INVESTMENT");
  });

  it("rebalances manual changes while preserving the total and preset bounds", () => {
    const original = { ...BUDGET_PRESETS.BALANCED.allocation };
    const changed = rebalanceBudgetAllocation(original, "BALANCED", "budgetEducation", 23);

    expect(changed.budgetEducation).toBe(23);
    expect(BUDGET_SECTORS.reduce((sum, sector) => sum + changed[sector.key], 0)).toBe(100);
    expect(validateBudgetAllocation("BALANCED", changed)).toBe(true);
    expect(original).toEqual(BUDGET_PRESETS.BALANCED.allocation);
  });

  it("rejects allocations outside a preset's manual range", () => {
    expect(
      validateBudgetAllocation("BALANCED", {
        ...BUDGET_PRESETS.BALANCED.allocation,
        budgetDefense: 30,
        budgetIndustry: 10,
      }),
    ).toBe(false);
  });
});
