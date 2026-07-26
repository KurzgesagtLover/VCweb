import { describe, expect, it } from "vitest";
import {
  assignColorPixels,
  assignConnectedRegion,
  assignIslandBrush,
  interpolateRasterPoints,
  removeBlackBorders,
  removeRasterBorders,
} from "@/src/domain/map/raster-territory";

function raster(rows: number[][][]) {
  return new Uint8Array(rows.flat(2));
}

describe("pixel territory editing", () => {
  it("interpolates every gap in a fast brush stroke", () => {
    const points = interpolateRasterPoints({ x: 0, y: 0 }, { x: 12, y: 0 }, 1);
    expect(points).toHaveLength(12);
    expect(points.at(0)).toEqual({ x: 1, y: 0 });
    expect(points.at(-1)).toEqual({ x: 12, y: 0 });
    for (let index = 1; index < points.length; index += 1) {
      expect(
        Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y),
      ).toBeLessThanOrEqual(Math.SQRT2);
    }
  });

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
    expect(assignIslandBrush(data, 3, 1, [{ x: 1, y: 0 }], 2, [30, 100, 180], [220, 30, 30])).toBe(
      1,
    );
    expect(data[0]).toBe(30);
    expect(data[4]).toBe(220);
    expect(data[8]).toBe(0);
  });

  it("preserves a pre-classified colored border during assignment and removes it on demand", () => {
    const border = [240, 40, 120];
    const data = raster([
      [
        [60, 150, 70, 255],
        [...border, 255],
        [60, 150, 70, 255],
      ],
    ]);

    expect(
      assignColorPixels(
        data,
        3,
        1,
        [240, 40, 120],
        [200, 20, 20],
        [border as [number, number, number]],
      ),
    ).toBe(0);

    const cleaned = removeRasterBorders(data, 3, 1, [border as [number, number, number]]);
    expect(Array.from(cleaned.slice(4, 7))).toEqual([60, 150, 70]);
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
