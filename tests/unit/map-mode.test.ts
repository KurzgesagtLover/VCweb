import { describe, expect, it } from "vitest";
import { parseMapMode, quantitativeMapColors } from "@/src/domain/map/map-mode";
import { recolorMapPixels } from "@/src/ui/globe-core";

describe("map modes", () => {
  it("creates a brighter color for a larger quantitative value", () => {
    const colors = quantitativeMapColors([
      { countryId: "small", value: 10 },
      { countryId: "large", value: 10_000 },
    ]);
    expect(colors.get("small")).not.toBe(colors.get("large"));
    expect(parseMapMode("GDP_PER_CAPITA")).toBe("GDP_PER_CAPITA");
    expect(parseMapMode("INVALID")).toBeNull();
  });

  it("recolors assigned territory without changing unassigned pixels", () => {
    const pixels = recolorMapPixels(
      { data: new Uint8ClampedArray([8, 16, 24, 255, 1, 2, 3, 255]), width: 2, height: 1 },
      new Map([["#081018", "country"]]),
      new Map([["country", "#FF8040"]]),
    );
    expect([...pixels]).toEqual([255, 128, 64, 255, 1, 2, 3, 255]);
  });
});
