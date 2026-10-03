import { afterEach, describe, expect, it, vi } from "vitest";
import { boundsFit, projectToUv } from "@/src/domain/map/projection";
import { createGlobeAdministrativeBoundaryLayer } from "@/src/ui/globe-administrative-boundaries";
import { detectMapBounds, globePointToLonLat } from "@/src/ui/globe-core";

afterEach(() => vi.unstubAllGlobals());

describe("administrative boundary alignment", () => {
  it("keeps outlined map extents in the same place at different texture sizes", () => {
    const fits = [1, 2, 4].map((scale) => {
      const width = 120 * scale;
      const height = 80 * scale;
      const data = new Uint8ClampedArray(width * height * 4);
      // Light outer padding, a black frame, then the map surface.
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const inside = x >= 10 * scale && x < 110 * scale && y >= 10 * scale && y < 70 * scale;
          const frame =
            inside && (x < 12 * scale || x >= 108 * scale || y < 12 * scale || y >= 68 * scale);
          const shade = frame ? 0 : inside ? 100 : 240;
          data.set([shade, shade, shade, 255], (y * width + x) * 4);
        }
      }
      const bounds = detectMapBounds({ data, width, height })!;
      expect(bounds).toEqual({
        left: 10 * scale,
        right: 110 * scale - 1,
        top: 10 * scale,
        bottom: 70 * scale - 1,
      });
      return boundsFit(bounds, width, height);
    });
    expect(fits[1]).toEqual(fits[0]);
    expect(fits[2]).toEqual(fits[0]);
    expect(projectToUv("ROBINSON", 180, 0, fits[0]).u).toBeCloseTo(110 / 120, 10);
  });

  for (const zoom of [0.92, 8]) {
    for (const pixelRatio of [1, 1.25, 2]) {
      it(`draws the clicked coordinates on the map surface at zoom ${zoom}, DPR ${pixelRatio}`, () => {
        vi.stubGlobal("window", { devicePixelRatio: pixelRatio });
        const drawn: number[][] = [];
        const context = {
          beginPath() {},
          stroke() {},
          clearRect() {},
          setTransform() {},
          moveTo(x: number, y: number) {
            drawn.push([x, y]);
          },
          lineTo(x: number, y: number) {
            drawn.push([x, y]);
          },
        };
        const canvas = { width: 0, height: 0, getContext: () => context };
        const layer = createGlobeAdministrativeBoundaryLayer(
          canvas as unknown as HTMLCanvasElement,
        );
        const ring = [
          [127, 35],
          [132, 35],
          [132, 40],
          [127, 40],
          [127, 35],
        ];
        layer.setBoundaries([
          { level: 1, geometry: { type: "Polygon", coordinates: [ring] } },
          { level: 2, geometry: { type: "Polygon", coordinates: [ring] } },
        ]);
        const view = { lon: 130, lat: 38, zoom };
        layer.draw({ width: 1281, height: 719, panelInset: 560, view });
        expect(drawn).toHaveLength(ring.length * 2);
        drawn.forEach(([x, y], index) => {
          const point = globePointToLonLat(
            x * pixelRatio,
            y * pixelRatio,
            canvas.width,
            canvas.height,
            560 * pixelRatio,
            view,
          )!;
          expect(point.lon).toBeCloseTo(ring[index % ring.length][0], 8);
          expect(point.lat).toBeCloseTo(ring[index % ring.length][1], 8);
        });
      });
    }
  }
});
