import { describe, expect, it } from "vitest";
import {
  applyBorderLayerSettings,
  borderLayerKind,
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
} as const;

describe("border layer display", () => {
  it("maps classifications to the four visible controls", () => {
    expect(borderLayerKind("COAST")).toBe("COAST");
    expect(borderLayerKind("LEGAL")).toBe("LEGAL");
    expect(borderLayerKind("ACTIVE")).toBe("ACTIVE");
    expect(borderLayerKind("GUERRILLA")).toBe("ACTIVE");
    expect(borderLayerKind("INACTIVE")).toBe("INACTIVE");
    expect(borderLayerKind("NONE")).toBeNull();
  });

  it("renders only enabled layers with their selected colors", () => {
    const source = new Uint8Array([
      8, 8, 8, 255, 248, 0, 0, 255, 248, 184, 0, 255, 248, 248, 248, 255, 120, 120, 120,
      255,
    ]);
    const rendered = applyBorderLayerSettings(
      source,
      classifications,
      ["COAST", "ACTIVE"],
      colors,
    );

    expect(Array.from(rendered)).toEqual([
      1, 2, 3, 255, 33, 34, 35, 255, 33, 34, 35, 255, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
  });
});
