import { describe, expect, it } from "vitest";
import { layoutCountryLabels } from "@/src/domain/map/country-labels";

const WIDTH = 60;
const HEIGHT = 30;

function buildRaster(paint: (x: number, y: number) => [number, number, number] | null) {
  const data = new Uint8Array(WIDTH * HEIGHT * 4);
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const offset = (y * WIDTH + x) * 4;
      const color = paint(x, y);
      if (!color) continue;
      data[offset] = color[0];
      data[offset + 1] = color[1];
      data[offset + 2] = color[2];
      data[offset + 3] = 255;
    }
  }
  return data;
}

describe("layoutCountryLabels", () => {
  it("places a country name along its territory", () => {
    const data = buildRaster((x, y) =>
      x >= 6 && x < 54 && y >= 10 && y < 20 ? [0x10, 0x20, 0x30] : null,
    );
    const layout = layoutCountryLabels({
      data,
      width: WIDTH,
      height: HEIGHT,
      assignments: [{ colorHex: "#102030", countryId: "country-a" }],
      countries: [{ id: "country-a", name: "가나다", entityType: "STATE" }],
    });

    expect(layout.labels).toHaveLength(1);
    const label = layout.labels[0];
    expect(label.glyphs.map((glyph) => glyph.char).join("")).toBe("가나다");
    for (const glyph of label.glyphs) {
      expect(glyph.x).toBeGreaterThan(6);
      expect(glyph.x).toBeLessThan(54);
      expect(glyph.y).toBeGreaterThan(9);
      expect(glyph.y).toBeLessThan(21);
      expect(Math.abs(glyph.angle)).toBeLessThan(20);
    }
  });

  it("skips guerrilla groups and territories too small for the name", () => {
    const data = buildRaster((x, y) => {
      if (x >= 6 && x < 54 && y >= 10 && y < 20) return [0x10, 0x20, 0x30];
      if (x >= 1 && x < 3 && y >= 1 && y < 3) return [0x40, 0x50, 0x60];
      return null;
    });
    const layout = layoutCountryLabels({
      data,
      width: WIDTH,
      height: HEIGHT,
      assignments: [
        { colorHex: "#102030", countryId: "country-a" },
        { colorHex: "#405060", countryId: "group-b" },
      ],
      countries: [
        { id: "country-a", name: "가나다", entityType: "GUERRILLA_GROUP" },
        { id: "group-b", name: "아주 긴 이름의 단체", entityType: "STATE" },
      ],
    });

    expect(layout.labels).toHaveLength(0);
  });

  it("follows the curve of a bent territory", () => {
    const data = buildRaster((x, y) => {
      const center = 8 + Math.round(((x - 30) * (x - 30)) / 60);
      return y >= center - 3 && y <= center + 3 && x >= 6 && x < 54 ? [0x10, 0x20, 0x30] : null;
    });
    const layout = layoutCountryLabels({
      data,
      width: WIDTH,
      height: HEIGHT,
      assignments: [{ colorHex: "#102030", countryId: "country-a" }],
      countries: [{ id: "country-a", name: "가나다라마", entityType: "STATE" }],
    });

    expect(layout.labels).toHaveLength(1);
    const angles = layout.labels[0].glyphs.map((glyph) => glyph.angle);
    expect(Math.max(...angles) - Math.min(...angles)).toBeGreaterThan(5);
  });
});
