import { describe, expect, it } from "vitest";
import {
  STANDARD_ECONOMIC_SECTORS,
  standardEconomicSectorRows,
} from "../../src/domain/economy/sectors";

describe("standard economic sectors", () => {
  it("includes general manufacturing and keeps the default shares at 100%", () => {
    expect(STANDARD_ECONOMIC_SECTORS.some((sector) => sector.code === "GMF")).toBe(true);
    expect(
      STANDARD_ECONOMIC_SECTORS.reduce((sum, sector) => sum + Number(sector.defaultShare), 0),
    ).toBeCloseTo(1, 8);
  });

  it("builds an initial row for every standard sector", () => {
    const rows = standardEconomicSectorRows({ growthRate: "0.03" });
    expect(rows).toHaveLength(STANDARD_ECONOMIC_SECTORS.length);
    expect(rows.every((row) => row.growthRate === "0.03")).toBe(true);
  });
});
