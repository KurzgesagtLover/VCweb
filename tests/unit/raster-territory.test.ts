import { describe, expect, it } from "vitest";
import {
  assignColorPixels,
  assignConnectedRegion,
  assignIslandBrush,
  removeBlackBorders,
} from "@/src/domain/map/raster-territory";

function raster(rows: number[][][]) {
  return new Uint8Array(rows.flat(2));
}

describe("pixel territory editing", () => {
  it("assigns every matching color or only the connected region", () => {
    const base = raster([
      [
        [10, 80, 10, 255],
        [10, 80, 10, 255],
        [0, 0, 0, 255],
        [10, 80, 10, 255],
      ],
    ]);
    const connected = new Uint8Array(base);
    expect(assignConnectedRegion(connected, 4, 1, 0, 0, [200, 20, 20])).toBe(2);
    expect(connected[12]).toBe(10);

    const all = new Uint8Array(base);
    expect(assignColorPixels(all, 4, 1, [10, 80, 10], [200, 20, 20])).toBe(3);
    expect(all[12]).toBe(200);
  });

  it("island brush preserves ocean-colored and black pixels", () => {
    const data = raster([
      [
        [30, 100, 180, 255],
        [80, 150, 60, 255],
        [0, 0, 0, 255],
      ],
    ]);
    expect(assignIslandBrush(data, 3, 1, [{ x: 1, y: 0 }], 2, [30, 100, 180], [220, 30, 30])).toBe(1);
    expect(data[0]).toBe(30);
    expect(data[4]).toBe(220);
    expect(data[8]).toBe(0);
  });

  it("fills a doubled black border from its neighboring territory colors", () => {
    const data = raster([
      [
        [200, 20, 20, 255],
        [0, 0, 0, 255],
        [0, 0, 0, 255],
        [20, 20, 200, 255],
      ],
    ]);
    const cleaned = removeBlackBorders(data, 4, 1);
    expect(cleaned[4]).not.toBe(0);
    expect(cleaned[8]).not.toBe(0);
  });
});
