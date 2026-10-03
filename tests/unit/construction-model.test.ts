import { describe, expect, it } from "vitest";
import { summarizeCitySlots } from "@/src/domain/construction/model";

const definitions = [
  { id: "civilian_factory", maxLevel: 20, slotCostPerLevel: 1 },
  { id: "infrastructure", maxLevel: 10, slotCostPerLevel: 0 },
];

describe("city construction foundation", () => {
  it("counts slot-using buildings by city instead of administrative region", () => {
    expect(
      summarizeCitySlots(
        8,
        [
          { buildingType: "civilian_factory", level: 3, damagedLevels: 1 },
          { buildingType: "infrastructure", level: 6, damagedLevels: 0 },
        ],
        definitions,
      ),
    ).toEqual({ capacity: 8, used: 3, available: 5 });
  });

  it("keeps over-capacity state explicit for later queue validation", () => {
    expect(
      summarizeCitySlots(
        2,
        [{ buildingType: "civilian_factory", level: 3, damagedLevels: 0 }],
        definitions,
      ),
    ).toEqual({ capacity: 2, used: 3, available: 0 });
  });

  it("rejects building state without a registered definition", () => {
    expect(() =>
      summarizeCitySlots(5, [{ buildingType: "unknown", level: 1, damagedLevels: 0 }], definitions),
    ).toThrow("unknown building type");
  });
});
