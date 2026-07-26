import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { clampPoliticalMetric, normalizePartySupport } from "../../src/domain/politics/calculator";

describe("politics rules", () => {
  it("clamps political indices to 0..100", () => {
    expect(clampPoliticalMetric(-4)).toBe(0);
    expect(clampPoliticalMetric(55.6)).toBe(56);
    expect(clampPoliticalMetric(140)).toBe(100);
  });

  it("normalizes support while preserving fixed parties and minimums", () => {
    const result = normalizePartySupport([
      { id: "fixed", support: "0.3", fixed: true },
      { id: "a", support: "0.5", minimum: "0.1" },
      { id: "b", support: "0.1", minimum: "0.05" },
    ]);
    const total = result.reduce((sum, party) => sum.plus(party.support), new Decimal(0));
    expect(total.toDecimalPlaces(7).eq(1)).toBe(true);
    expect(result[0].support).toBe("0.3");
    expect(new Decimal(result[2].support).gte("0.05")).toBe(true);
  });

  it("rejects impossible fixed shares", () => {
    expect(() =>
      normalizePartySupport([
        { id: "a", support: "0.7", fixed: true },
        { id: "b", support: "0.5", fixed: true },
      ]),
    ).toThrow(/100%/);
  });
});
