import { describe, expect, it } from "vitest";
import { assertValidTechGraph, canResearch } from "../../src/domain/research/graph";

describe("technology DAG", () => {
  it("accepts a valid directed acyclic graph", () => {
    expect(() =>
      assertValidTechGraph(
        ["A", "B", "C"],
        [
          { tech: "B", prerequisite: "A" },
          { tech: "C", prerequisite: "B" },
        ],
      ),
    ).not.toThrow();
  });

  it("rejects cycles and unknown prerequisites", () => {
    expect(() =>
      assertValidTechGraph(
        ["A", "B"],
        [
          { tech: "B", prerequisite: "A" },
          { tech: "A", prerequisite: "B" },
        ],
      ),
    ).toThrow(/순환/);
    expect(() => assertValidTechGraph(["A"], [{ tech: "A", prerequisite: "X" }])).toThrow(
      /존재하지/,
    );
  });

  it("checks completion and exclusive groups", () => {
    const edges = [{ tech: "B", prerequisite: "A" }];
    expect(canResearch({ techCode: "B", completedCodes: new Set(["A"]), edges })).toBe(true);
    expect(canResearch({ techCode: "B", completedCodes: new Set(), edges })).toBe(false);
    expect(
      canResearch({
        techCode: "B",
        completedCodes: new Set(["A"]),
        edges,
        exclusiveGroup: "path",
        completedExclusiveGroups: new Set(["path"]),
      }),
    ).toBe(false);
  });
});
