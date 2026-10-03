import { describe, expect, it } from "vitest";
import {
  applyBorderClassifications,
  applyBorderClassificationsInPlace,
  applyBorderLayerSettings,
  borderLayerKind,
  inferDefaultBorderClassifications,
  type BorderClassification,
} from "@/src/domain/map/border-palette";

const classifications: BorderClassification[] = [
  { sourceColor: "#080808", kind: "COAST", displayColor: "#111827" },
  { sourceColor: "#F80000", kind: "ACTIVE", displayColor: "#F04444" },
  { sourceColor: "#F8B800", kind: "GUERRILLA", displayColor: "#F2B84B" },
  { sourceColor: "#F8F8F8", kind: "LEGAL", displayColor: "#F5F5F5" },
  { sourceColor: "#787878", kind: "INACTIVE", displayColor: "#7D8794" },
];

const colors = {
  COAST: "#010203",
  LEGAL: "#111213",
  ACTIVE: "#212223",
  INACTIVE: "#313233",
  GUERRILLA: "#414243",
} as const;

describe("border layer display", () => {
  it("maps classifications to the five visible controls", () => {
    expect(borderLayerKind("COAST")).toBe("COAST");
    expect(borderLayerKind("LEGAL")).toBe("LEGAL");
    expect(borderLayerKind("ACTIVE")).toBe("ACTIVE");
    expect(borderLayerKind("GUERRILLA")).toBe("GUERRILLA");
    expect(borderLayerKind("INACTIVE")).toBe("INACTIVE");
    expect(borderLayerKind("NONE")).toBeNull();
  });

  it("renders only enabled layers with their selected colors", () => {
    const source = new Uint8Array([
      8, 8, 8, 255, 248, 0, 0, 255, 248, 184, 0, 255, 248, 248, 248, 255, 120, 120, 120, 255,
    ]);
    const rendered = applyBorderLayerSettings(
      source,
      classifications,
      ["COAST", "ACTIVE", "GUERRILLA"],
      colors,
    );

    expect(Array.from(rendered)).toEqual([
      1, 2, 3, 255, 33, 34, 35, 255, 65, 66, 67, 255, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
  });

  it("can reuse the decoded source buffer when rendering the stored border layer", () => {
    const source = new Uint8Array([80, 100, 120, 255, 248, 0, 0, 255, 8, 8, 8, 255]);
    const borderless = new Uint8Array([80, 100, 120, 255, 60, 70, 80, 255, 90, 100, 110, 255]);
    const expected = applyBorderClassifications(source, borderless, classifications);
    const reused = new Uint8Array(source);

    expect(applyBorderClassificationsInPlace(reused, borderless, classifications)).toEqual(
      expected,
    );
  });

  it("infers the standard source colors present in a map", () => {
    const pixels = new Uint8Array([
      ...Array(16).fill([0, 0, 127, 255]).flat(),
      ...Array(16).fill([0, 0, 0, 255]).flat(),
      ...Array(16).fill([255, 255, 255, 255]).flat(),
      ...Array(16).fill([255, 0, 0, 255]).flat(),
    ]);

    expect(inferDefaultBorderClassifications(pixels, colors)).toEqual([
      { sourceColor: "#000078", kind: "COAST", displayColor: colors.COAST },
      { sourceColor: "#000000", kind: "LEGAL", displayColor: colors.LEGAL },
      { sourceColor: "#F8F8F8", kind: "ACTIVE", displayColor: colors.ACTIVE },
      { sourceColor: "#F80000", kind: "INACTIVE", displayColor: colors.INACTIVE },
    ]);
  });
});
