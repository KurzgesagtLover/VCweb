import { describe, expect, it } from "vitest";
import {
  addDrifts,
  applyMonthlyDrift,
  applyMonthlyDrifts,
  formatMonthlyDrift,
  monthsInTurn,
  scaleDrift,
} from "../../src/domain/politics/drift";

describe("monthly political drift", () => {
  it("counts game months in a turn", () => {
    expect(monthsInTurn("2042-01-01", "2042-12-31")).toBeCloseTo(12, 10);
    expect(monthsInTurn("2042-01-01", "2042-01-31")).toBeCloseTo(31 / (365 / 12), 10);
  });

  it("accumulates a monthly rate over the turn", () => {
    expect(applyMonthlyDrift(50, -0.5, 12)).toBe(44);
    expect(applyMonthlyDrift(50, 0.25, 12)).toBe(53);
  });

  it("slows changes near the edges and stays inside 0 to 100", () => {
    expect(applyMonthlyDrift(95, 1, 12)).toBeCloseTo(96.2, 10);
    expect(applyMonthlyDrift(2, -1, 12)).toBeCloseTo(0.8, 10);
    expect(applyMonthlyDrift(99, 5, 12)).toBe(100);
  });

  it("applies drift to integer political snapshots", () => {
    const political: Record<string, unknown> = { stability: 60, corruption: 30, democracy: 70 };
    const changes = applyMonthlyDrifts(
      political,
      addDrifts({ stability: -0.3 }, { corruption: 0.15 }, scaleDrift({ democracy: 0.2 }, 0.5)),
      12,
    );
    expect(political).toEqual({ stability: 56, corruption: 32, democracy: 71 });
    expect(changes.map((change) => change.metric)).toEqual([
      "stability",
      "corruption",
      "democracy",
    ]);
  });

  it("formats drift for display", () => {
    expect(formatMonthlyDrift({ stateCapacity: 0.25, corruption: -0.15 })).toEqual([
      "행정 역량 월 +0.25",
      "부패 월 -0.15",
    ]);
  });
});
