import { describe, expect, it } from "vitest";
import {
  MAP_PROJECTIONS,
  boundsFit,
  projectNormalized,
  projectToUv,
  unprojectNormalized,
  unprojectUv,
} from "@/src/domain/map/projection";

const SAMPLES: Array<{ lon: number; lat: number }> = [
  { lon: 0, lat: 0 },
  { lon: 45, lat: 30 },
  { lon: -120, lat: -55 },
  { lon: 170, lat: 78 },
  { lon: -175, lat: -82 },
  { lon: 12, lat: 84 },
];

describe("unprojectNormalized", () => {
  for (const projection of MAP_PROJECTIONS) {
    it(`${projection} 정투영과 역투영이 왕복한다`, () => {
      for (const sample of SAMPLES) {
        // 메르카토르는 극지방을 표현하지 못하므로 유효 위도만 검사한다.
        if (projection === "MERCATOR" && Math.abs(sample.lat) > 85) continue;
        const point = projectNormalized(projection, sample.lon, sample.lat);
        const back = unprojectNormalized(projection, point.x, point.y);
        expect(back.lon).toBeCloseTo(sample.lon, 3);
        expect(back.lat).toBeCloseTo(sample.lat, 3);
      }
    });
  }
});

describe("unprojectUv", () => {
  it("측정된 지도 영역 기준 UV도 왕복한다", () => {
    const fit = boundsFit({ left: 10, right: 1029, top: 4, bottom: 513 }, 1040, 520);
    for (const sample of SAMPLES) {
      const uv = projectToUv("MOLLWEIDE", sample.lon, sample.lat, fit);
      const back = unprojectUv("MOLLWEIDE", uv.u, uv.v, fit);
      expect(back.lon).toBeCloseTo(sample.lon, 3);
      expect(back.lat).toBeCloseTo(sample.lat, 3);
    }
  });
});
