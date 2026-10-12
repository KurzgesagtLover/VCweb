import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import {
  ADMINISTRATION_TIERS,
  administrationRequirement,
  administrationTier,
  evaluateAdministrationBudget,
  gdpPerCapita,
} from "../../src/domain/economy/administration";

const typical = {
  population: "50000000",
  populationDensity: "100",
  gdpPerCapita: "20000",
  unrest: 25,
  spendingToGdp: "0.3",
};

describe("administration budget requirement", () => {
  it("treats the balanced preset as normal for a typical country", () => {
    const result = evaluateAdministrationBudget({ ...typical, budgetAdministrationPercent: 15 });
    expect(result.requirement.budgetShare).toBe("0.15");
    expect(result.requirement.gdpShare).toBe("0.045");
    expect(result.coverage).toBe("1");
    expect(result.tier.key).toBe("NORMAL");
  });

  it("needs a larger share for unrest, sparse land, lower income and a small government", () => {
    const base = new Decimal(administrationRequirement(typical).budgetShare);
    expect(
      new Decimal(administrationRequirement({ ...typical, spendingToGdp: "0.2" }).budgetShare).gt(
        base,
      ),
    ).toBe(true);
    expect(
      new Decimal(administrationRequirement({ ...typical, unrest: 80 }).budgetShare).gt(base),
    ).toBe(true);
    expect(
      new Decimal(administrationRequirement({ ...typical, populationDensity: "8" }).budgetShare).gt(
        base,
      ),
    ).toBe(true);
    expect(
      new Decimal(administrationRequirement({ ...typical, gdpPerCapita: "4000" }).budgetShare).gt(
        base,
      ),
    ).toBe(true);
  });

  it("assigns tiers by coverage", () => {
    expect(administrationTier("0.5").key).toBe("PARALYSIS");
    expect(administrationTier("0.7").key).toBe("GAP");
    expect(administrationTier("1").key).toBe("NORMAL");
    expect(administrationTier("1.2").key).toBe("EXPANSION");
    expect(administrationTier("1.6").key).toBe("BLOAT");
    expect(administrationTier(null).key).toBe("NORMAL");
  });

  it("moves allocations through the tiers", () => {
    const tiers = [6, 11, 15, 19, 25].map(
      (percent) =>
        evaluateAdministrationBudget({ ...typical, budgetAdministrationPercent: percent }).tier.key,
    );
    expect(tiers).toEqual(["PARALYSIS", "GAP", "NORMAL", "EXPANSION", "BLOAT"]);
  });

  it("expresses political effects as monthly drift", () => {
    for (const tier of ADMINISTRATION_TIERS) {
      for (const value of Object.values(tier.drift)) {
        expect(Math.abs(value ?? 0)).toBeLessThan(1);
      }
    }
  });

  it("converts snapshot money to per-capita values", () => {
    expect(
      gdpPerCapita({ realGdp: "31600000", population: "1300000000", scale: "million" })
        ?.toDecimalPlaces(0)
        .toString(),
    ).toBe("24308");
    expect(gdpPerCapita({ realGdp: "1", population: "0" })).toBeNull();
  });
});
