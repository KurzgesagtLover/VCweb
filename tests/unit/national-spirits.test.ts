import { describe, expect, it } from "vitest";
import { BUDGET_PRESETS } from "../../src/domain/economy/budget";
import { evaluateBudget, type BudgetContext } from "../../src/domain/economy/budget-coverage";
import {
  combineSpiritEffects,
  customSpiritSchema,
  describeSpiritEffects,
  parseSpiritChanges,
  parseSpiritEffects,
  SPIRIT_TEMPLATES,
  spiritEffectsSchema,
  spiritEndDate,
  spiritEndsWithin,
  spiritTemplate,
} from "../../src/domain/spirits/model";

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

describe("national spirits", () => {
  it("ships valid templates with unique keys", () => {
    const keys = SPIRIT_TEMPLATES.map((template) => template.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const template of SPIRIT_TEMPLATES) {
      expect(spiritEffectsSchema.safeParse(template.effects).success).toBe(true);
      expect(describeSpiritEffects(template.effects).length).toBeGreaterThan(0);
    }
  });

  it("rejects effects outside the allowed range and unknown fields", () => {
    expect(spiritEffectsSchema.safeParse({ drift: { stability: 5 } }).success).toBe(false);
    expect(spiritEffectsSchema.safeParse({ potentialGrowth: 0.2 }).success).toBe(false);
    expect(spiritEffectsSchema.safeParse({ morale: 1 }).success).toBe(false);
    expect(spiritEffectsSchema.safeParse({ budgetNeed: { budgetSpace: 0.1 } }).success).toBe(false);
    expect(customSpiritSchema.safeParse({ key: "Bad Key", name: "x", effects: {} }).success).toBe(
      false,
    );
    expect(parseSpiritEffects({ drift: { stability: 9 } })).toEqual({ drift: {}, budgetNeed: {} });
  });

  it("combines several spirits into one effect set", () => {
    const combined = combineSpiritEffects([
      spiritTemplate("war-economy")!.effects,
      spiritTemplate("national-unity")!.effects,
      spiritTemplate("economic-crisis")!.effects,
    ]);
    expect(combined.drift.stability).toBeCloseTo(0.15, 6);
    expect(Number(combined.structural.potentialGrowth)).toBeCloseTo(-0.012, 6);
    expect(combined.politicalPowerIncome).toBe(15);
    expect(combined.budgetNeed.budgetDefense).toBe(0.3);
  });

  it("computes end dates in game months", () => {
    expect(spiritEndDate("2087-04-01", 6)).toBe("2087-09-30");
    expect(spiritEndDate("2087-01-31", 1)).toBe("2087-02-27");
    expect(spiritEndDate("2087-04-01", null)).toBeNull();
    expect(spiritEndsWithin("2087-09-30", "2087-09-30")).toBe(true);
    expect(spiritEndsWithin("2087-10-01", "2087-09-30")).toBe(false);
    expect(spiritEndsWithin(null, "2087-09-30")).toBe(false);
  });

  it("keeps only known template keys from event changes", () => {
    expect(
      parseSpiritChanges([
        { templateKey: "war-economy", durationMonths: 12 },
        { templateKey: "unknown", durationMonths: 3 },
        { action: "REMOVE", templateKey: "reform-fatigue" },
        "garbage",
      ]),
    ).toEqual([
      { action: "GRANT", templateKey: "war-economy", durationMonths: 12 },
      { action: "REMOVE", templateKey: "reform-fatigue", durationMonths: null },
    ]);
  });

  it("raises a budget line requirement through need modifiers", () => {
    const base = evaluateBudget(typical, BUDGET_PRESETS.BALANCED.allocation);
    const war = evaluateBudget(
      { ...typical, needModifiers: { budgetDefense: 0.3 } },
      BUDGET_PRESETS.BALANCED.allocation,
    );
    const defense = (result: typeof base) =>
      result.lines.find((line) => line.key === "budgetDefense")!;
    expect(Number(defense(war).requirement.budgetShare)).toBeCloseTo(
      Number(defense(base).requirement.budgetShare) * 1.3,
      5,
    );
    expect(Number(defense(war).coverage)).toBeLessThan(Number(defense(base).coverage));
  });
});
