import { describe, expect, it } from "vitest";
import { drawAutomaticBorders } from "@/src/domain/map/automatic-borders";
import { DEFAULT_BORDER_LAYER_COLORS } from "@/src/domain/map/border-palette";
import { applyGuerrillaTerritoryOverlay } from "@/src/domain/map/guerrilla-territory";
import { parseHexColor, rgbToHex } from "@/src/domain/map/image-colors";
import { buildAutomaticMapRaster } from "@/src/services/automatic-map-raster";
import sharp from "sharp";

function pixels(...colors: string[]) {
  return new Uint8Array(colors.flatMap((color) => [...parseHexColor(color)!, 255]));
}

const state = { id: "state", entityType: "STATE" as const };
const neighbor = { id: "neighbor", entityType: "STATE" as const };
const guerrilla = { id: "guerrilla", entityType: "GUERRILLA_GROUP" as const };

describe("automatic raster borders", () => {
  it("draws an ordinary border between adjacent states on the source raster", () => {
    const result = drawAutomaticBorders({
      data: pixels("#102030", "#405060"),
      width: 2,
      height: 1,
      assignments: [
        { colorHex: "#102030", countryId: state.id },
        { colorHex: "#405060", countryId: neighbor.id },
      ],
      countries: [state, neighbor],
      relations: [],
      backgroundColors: [],
    });
    expect(Array.from(result.data.slice(0, 3))).toEqual([0, 0, 0]);
    expect(result.counts.LEGAL).toBe(1);
  });

  it("keeps a guerrilla boundary absent until a guerrilla relation is set", () => {
    const base = {
      data: pixels("#102030", "#405060"),
      width: 2,
      height: 1,
      assignments: [
        { colorHex: "#102030", countryId: state.id },
        { colorHex: "#405060", countryId: guerrilla.id },
      ],
      countries: [state, guerrilla],
      backgroundColors: [],
    };
    expect(drawAutomaticBorders({ ...base, relations: [] }).counts.GUERRILLA).toBe(0);
    const active = drawAutomaticBorders({
      ...base,
      relations: [{ fromCountryId: state.id, toCountryId: guerrilla.id, status: "GUERRILLA" }],
    });
    expect(Array.from(active.data.slice(0, 3))).toEqual([248, 184, 0]);
    expect(active.counts.GUERRILLA).toBe(1);
  });

  it("does not add another line where a source border already separates territories", () => {
    const result = drawAutomaticBorders({
      data: pixels("#102030", "#000000", "#405060"),
      width: 3,
      height: 1,
      assignments: [
        { colorHex: "#102030", countryId: state.id },
        { colorHex: "#405060", countryId: neighbor.id },
      ],
      countries: [state, neighbor],
      relations: [{ fromCountryId: state.id, toCountryId: neighbor.id, status: "WAR" }],
      backgroundColors: [],
    });
    expect(result.counts.ACTIVE).toBe(0);
    expect(result.data).toEqual(pixels("#102030", "#000000", "#405060"));
  });

  it("expands every source border pixel into one 2×2 block", async () => {
    const sourceImage = await sharp(pixels("#102030", "#405060"), {
      raw: { width: 2, height: 1, channels: 4 },
    })
      .png()
      .toBuffer();
    const built = await buildAutomaticMapRaster({
      sourceImage,
      assignments: [
        { colorHex: "#102030", countryId: state.id },
        { colorHex: "#405060", countryId: neighbor.id },
      ],
      countries: [state, neighbor],
      relations: [],
      classifications: [],
      layerColors: DEFAULT_BORDER_LAYER_COLORS,
    });
    const decoded = await sharp(built.imageData).ensureAlpha().raw().toBuffer({
      resolveWithObject: true,
    });
    expect({ width: decoded.info.width, height: decoded.info.height }).toEqual({
      width: 4,
      height: 2,
    });
    expect(Array.from(decoded.data.slice(0, 3))).toEqual([0, 0, 0]);
    expect(Array.from(decoded.data.slice(4, 7))).toEqual([0, 0, 0]);
    expect(Array.from(decoded.data.slice(16, 19))).toEqual([0, 0, 0]);
    expect(Array.from(decoded.data.slice(20, 23))).toEqual([0, 0, 0]);
  });

  it("paints guerrilla territory as target fill with guerrilla dots", () => {
    const result = applyGuerrillaTerritoryOverlay({
      data: pixels("#102030", "#405060", "#405060", "#405060"),
      width: 2,
      height: 2,
      assignments: [
        { colorHex: "#102030", countryId: state.id },
        { colorHex: "#405060", countryId: guerrilla.id },
      ],
      countries: [state, guerrilla],
      relations: [{ fromCountryId: guerrilla.id, toCountryId: state.id, status: "GUERRILLA" }],
    });
    expect(result.paintedPixels).toBe(3);
    const colors = [0, 1, 2, 3].map((index) =>
      rgbToHex([
        result.data[index * 4]!,
        result.data[index * 4 + 1]!,
        result.data[index * 4 + 2]!,
      ]),
    );
    expect(colors[0]).toBe("#102030");
    expect(colors.filter((color) => color === "#102030").length).toBeGreaterThan(0);
    expect(colors.filter((color) => color === "#405060").length).toBeGreaterThan(0);
  });
});
