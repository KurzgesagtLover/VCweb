import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { BUDGET_PRESETS, BUDGET_SECTORS } from "../../src/domain/economy/budget";
import {
  BUDGET_TIERS,
  budgetTier,
  defenseRequirement,
  diplomacyRequirement,
  educationRequirement,
  evaluateBudget,
  evaluateBudgetLine,
  industryRequirement,
  welfareRequirement,
  type BudgetContext,
} from "../../src/domain/economy/budget-coverage";

const typical: BudgetContext = {
  population: "50000000",
  populationDensity: "100",
  gdpPerCapita: "20000",
  spendingToGdp: "0.3",
  unrest: 25,
  medianAge: 40,
  povertyRate: 0.12,
  unemploymentRate: 0.05,
  atWar: false,
  threats: 0,
  conscriptionStage: 1,
  economyLawStage: 3,
};

const share = (value: { budgetShare: string }) => new Decimal(value.budgetShare);

describe("budget coverage", () => {
  it("keeps every line normal for a typical country on the balanced preset", () => {
    const result = evaluateBudget(typical, BUDGET_PRESETS.BALANCED.allocation);
    expect(result.lines.map((line) => [line.key, line.tier.key])).toEqual(
      BUDGET_SECTORS.map((sector) => [sector.key, "NORMAL"]),
    );
    expect(result.drift).toEqual({});
    expect(Number(result.totalRequiredShare)).toBeLessThan(1);
    expect(Number(result.totalRequiredShare)).toBeGreaterThan(0.85);
  });

  it("raises defense needs for war, threats and mobilization", () => {
    const base = share(defenseRequirement(typical));
    expect(share(defenseRequirement({ ...typical, atWar: true })).gt(base)).toBe(true);
    expect(share(defenseRequirement({ ...typical, threats: 3 })).gt(base)).toBe(true);
    expect(share(defenseRequirement({ ...typical, conscriptionStage: 5 })).gt(base)).toBe(true);
    // 위협 상대는 다섯까지만 센다.
    expect(defenseRequirement({ ...typical, threats: 9 }).budgetShare).toBe(
      defenseRequirement({ ...typical, threats: 5 }).budgetShare,
    );
  });

  it("follows demography, poverty and economic system", () => {
    expect(
      share(welfareRequirement({ ...typical, medianAge: 50 })).gt(
        share(welfareRequirement(typical)),
      ),
    ).toBe(true);
    expect(
      share(welfareRequirement({ ...typical, povertyRate: 0.3 })).gt(
        share(welfareRequirement(typical)),
      ),
    ).toBe(true);
    expect(
      share(educationRequirement({ ...typical, medianAge: 22 })).gt(
        share(educationRequirement(typical)),
      ),
    ).toBe(true);
    expect(
      share(industryRequirement({ ...typical, economyLawStage: 5 })).gt(
        share(industryRequirement(typical)),
      ),
    ).toBe(true);
    expect(
      share(industryRequirement({ ...typical, gdpPerCapita: "4000" })).gt(
        share(industryRequirement(typical)),
      ),
    ).toBe(true);
    expect(
      share(diplomacyRequirement({ ...typical, threats: 2 })).gt(
        share(diplomacyRequirement(typical)),
      ),
    ).toBe(true);
  });

  it("moves an underfunded welfare line through the tiers", () => {
    const tiers = [8, 13, 18, 23, 30].map(
      (percent) => evaluateBudgetLine("budgetWelfare", typical, percent).tier.key,
    );
    expect(tiers).toEqual(["PARALYSIS", "GAP", "NORMAL", "EXPANSION", "BLOAT"]);
  });

  it("sums drifts and structural effects across lines", () => {
    const result = evaluateBudget(typical, {
      budgetDefense: 8,
      budgetAdministration: 15,
      budgetIndustry: 34,
      budgetEducation: 17,
      budgetWelfare: 20,
      budgetDiplomacy: 6,
    });
    const defense = result.lines.find((line) => line.key === "budgetDefense")!;
    const industry = result.lines.find((line) => line.key === "budgetIndustry")!;
    expect(defense.tier.key).toBe("PARALYSIS");
    expect(industry.tier.key).toBe("BLOAT");
    expect(result.drift.stability).toBeLessThan(0);
    expect(result.drift.corruption).toBeGreaterThan(0);
    expect(Number(result.structural.inflationPressure)).toBeGreaterThan(0);
    expect(result.politicalPowerIncome).toBe(-3);
  });

  it("uses small monthly drifts and five tiers for every line", () => {
    for (const sector of BUDGET_SECTORS) {
      const table = BUDGET_TIERS[sector.key];
      expect(table.map((tier) => tier.key)).toEqual([
        "PARALYSIS",
        "GAP",
        "NORMAL",
        "EXPANSION",
        "BLOAT",
      ]);
      expect(table[2].drift).toEqual({});
      for (const tier of table) {
        for (const value of Object.values(tier.drift)) {
          expect(Math.abs(value ?? 0)).toBeLessThan(1);
        }
      }
    }
    expect(budgetTier("budgetDiplomacy", null).key).toBe("NORMAL");
  });
});
