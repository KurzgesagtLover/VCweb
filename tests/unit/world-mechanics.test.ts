import { describe, expect, it } from "vitest";
import {
  advanceWorldMechanic,
  evaluateWorldAction,
  KESSLER_SYNDROME,
  mechanicStage,
  worldMechanicAction,
  worldStageEffects,
  type WorldMechanicDefinition,
} from "../../src/domain/world/mechanics";

const context = {
  turnOpen: true,
  balance: 100,
  completedTechCodes: new Set<string>(),
  monthsSinceLastUse: null,
  hasPendingOrder: false,
};

describe("world mechanics", () => {
  it("grows exponentially when left alone", () => {
    const quarter = advanceWorldMechanic(KESSLER_SYNDROME, {
      progress: 40,
      years: 0.25,
      reductions: 0,
    });
    const year = advanceWorldMechanic(KESSLER_SYNDROME, { progress: 40, years: 1, reductions: 0 });
    const decade = advanceWorldMechanic(KESSLER_SYNDROME, {
      progress: 40,
      years: 10,
      reductions: 0,
    });
    expect(quarter.after).toBeGreaterThan(40);
    expect(year.natural).toBeCloseTo(40 * 0.05 + 0.5, 3);
    expect(decade.after).toBeGreaterThan(year.after * 1.5);
    expect(
      advanceWorldMechanic(KESSLER_SYNDROME, { progress: 99, years: 5, reductions: 0 }).after,
    ).toBe(100);
  });

  it("subtracts reductions after growth and never goes below the minimum", () => {
    const reduced = advanceWorldMechanic(KESSLER_SYNDROME, {
      progress: 40,
      years: 0.25,
      reductions: 3,
    });
    const untouched = advanceWorldMechanic(KESSLER_SYNDROME, {
      progress: 40,
      years: 0.25,
      reductions: 0,
    });
    expect(reduced.after).toBeCloseTo(untouched.after - 3, 4);
    expect(
      advanceWorldMechanic(KESSLER_SYNDROME, { progress: 1, years: 0.25, reductions: 50 }).after,
    ).toBe(0);
  });

  it("ignores reductions inside an irreversible range", () => {
    const locked: WorldMechanicDefinition = { ...KESSLER_SYNDROME, irreversibleAbove: 90 };
    const step = advanceWorldMechanic(locked, { progress: 92, years: 0.25, reductions: 10 });
    expect(step.locked).toBe(true);
    expect(step.reduction).toBe(0);
    expect(step.after).toBeGreaterThan(92);
  });

  it("picks the stage by progress and sums national spirit effects", () => {
    expect(mechanicStage(KESSLER_SYNDROME, 10).key).toBe("CLEAR");
    expect(mechanicStage(KESSLER_SYNDROME, 45).key).toBe("DEBRIS_ALERT");
    expect(mechanicStage(KESSLER_SYNDROME, 95).key).toBe("CASCADE");
    const effects = worldStageEffects([{ definition: KESSLER_SYNDROME, progress: 65 }]);
    expect(effects.drift.stability).toBe(-0.05);
    expect(Number(effects.structural.potentialGrowth)).toBe(-0.003);
    expect(effects.spirits[0]).toMatchObject({
      mechanicKey: "kessler",
      stageKey: "SERVICE_FAILURE",
    });
  });

  it("gates actions by turn, technology, cooldown, duplicates and political power", () => {
    const restraint = worldMechanicAction(KESSLER_SYNDROME, "launch-restraint")!;
    const tracking = worldMechanicAction(KESSLER_SYNDROME, "debris-tracking")!;
    expect(evaluateWorldAction(restraint, context).allowed).toBe(true);
    expect(evaluateWorldAction(restraint, { ...context, turnOpen: false }).allowed).toBe(false);
    expect(evaluateWorldAction(tracking, context).reason).toContain("기술");
    expect(
      evaluateWorldAction(tracking, {
        ...context,
        completedTechCodes: new Set(["orbital-debris-tracking"]),
      }).allowed,
    ).toBe(true);
    expect(evaluateWorldAction(restraint, { ...context, monthsSinceLastUse: 6 }).reason).toContain(
      "12개월",
    );
    expect(evaluateWorldAction(restraint, { ...context, hasPendingOrder: true }).allowed).toBe(
      false,
    );
    expect(evaluateWorldAction(restraint, { ...context, balance: 10 }).reason).toContain("정치력");
  });
});
