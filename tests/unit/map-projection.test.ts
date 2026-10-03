import { describe, expect, it } from "vitest";
import {
  MAP_PROJECTIONS,
  MAP_PROJECTION_ASPECT,
  boundsFit,
  projectNormalized,
  projectToUv,
  projectionFit,
  parseMapProjection,
} from "@/src/domain/map/projection";

describe("map projection", () => {
  it("정거원통 투영은 경위도를 선형으로 매핑한다", () => {
    expect(projectToUv("EQUIRECTANGULAR", 0, 0)).toEqual({ u: 0.5, v: 0.5 });
    expect(projectToUv("EQUIRECTANGULAR", 180, 90).u).toBeCloseTo(1, 6);
    expect(projectToUv("EQUIRECTANGULAR", 180, 90).v).toBeCloseTo(0, 6);
    expect(projectToUv("EQUIRECTANGULAR", -180, -90).u).toBeCloseTo(0, 6);
    expect(projectToUv("EQUIRECTANGULAR", -180, -90).v).toBeCloseTo(1, 6);
  });

  it("모든 투영이 중심을 이미지 중앙에 두고 [0,1] 범위를 벗어나지 않는다", () => {
    for (const projection of MAP_PROJECTIONS) {
      const center = projectToUv(projection, 0, 0);
      expect(center.u).toBeCloseTo(0.5, 6);
      expect(center.v).toBeCloseTo(0.5, 6);
      for (let lat = -90; lat <= 90; lat += 15) {
        for (let lon = -180; lon <= 180; lon += 15) {
          const uv = projectToUv(projection, lon, lat);
          expect(uv.u).toBeGreaterThanOrEqual(-1e-6);
          expect(uv.u).toBeLessThanOrEqual(1 + 1e-6);
          expect(uv.v).toBeGreaterThanOrEqual(-1e-6);
          expect(uv.v).toBeLessThanOrEqual(1 + 1e-6);
        }
      }
    }
  });

  it("투영별 가로세로비가 극단 좌표와 일치한다", () => {
    for (const projection of MAP_PROJECTIONS) {
      const equator = projectNormalized(projection, 180, 0);
      const pole = projectNormalized(projection, 0, 90);
      expect(equator.x).toBeCloseTo(1, 3);
      expect(pole.y).toBeCloseTo(1, 3);
      // 정규화 좌표는 ±1이므로 비율은 상수 테이블에서 온다.
      expect(MAP_PROJECTION_ASPECT[projection]).toBeGreaterThan(0.9);
    }
  });

  it("타원 투영은 극지방 경도 폭을 좁힌다", () => {
    for (const projection of ["MOLLWEIDE", "ROBINSON", "WINKEL_TRIPEL", "EQUAL_EARTH"] as const) {
      const equatorEdge = projectNormalized(projection, 180, 0).x;
      const polarEdge = projectNormalized(projection, 180, 75).x;
      expect(polarEdge).toBeLessThan(equatorEdge);
    }
  });

  it("로빈슨 투영은 PROJ 표준의 구간 다항식 좌표와 일치한다", () => {
    const samples = [
      { lon: -123.4, lat: 2.5, x: -0.6852822941912252, y: 0.03099999956958816 },
      { lon: -123.4, lat: 42.3, x: -0.6240935828926951, y: 0.5240772342443178 },
      { lon: 117.2, lat: 31.2, x: 0.6226003220533941, y: 0.38688437330727365 },
      { lon: 117.2, lat: 79.2, x: 0.40999238095432544, y: 0.9325533893101529 },
      { lon: 10, lat: 87.4, x: 0.030643120298503253, y: 0.9893639087795745 },
    ];

    for (const sample of samples) {
      const point = projectNormalized("ROBINSON", sample.lon, sample.lat);
      expect(point.x).toBeCloseTo(sample.x, 7);
      expect(point.y).toBeCloseTo(sample.y, 7);
    }
  });

  it("메르카토르는 고위도를 잘라 정사각 비율을 유지한다", () => {
    expect(projectNormalized("MERCATOR", 0, 90).y).toBeCloseTo(1, 3);
    expect(projectNormalized("MERCATOR", 0, -90).y).toBeCloseTo(-1, 3);
    expect(MAP_PROJECTION_ASPECT.MERCATOR).toBe(1);
  });

  it("가로가 남는 이미지는 좌우 여백을 잡아 지도 영역만 샘플링한다", () => {
    // 표준 로빈슨 비율보다 넓은 2:1 이미지 → 좌우가 남는다.
    const fit = projectionFit("ROBINSON", 4000, 2000);
    expect(fit.scaleV).toBe(1);
    expect(fit.scaleU).toBeCloseTo(MAP_PROJECTION_ASPECT.ROBINSON / 2, 6);
    expect(fit.offsetU).toBeCloseTo((1 - fit.scaleU) / 2, 6);
    const edge = projectToUv("ROBINSON", 180, 0, fit);
    expect(edge.u).toBeCloseTo(1 - fit.offsetU, 6);
  });

  it("측정된 지도 경계를 그대로 UV 매핑으로 쓴다", () => {
    // 오른쪽에만 여백이 있는 실제 업로드 사례.
    const fit = boundsFit({ left: 1, right: 3977, top: 0, bottom: 2012 }, 4096, 2013);
    const center = projectToUv("ROBINSON", 0, 0, fit);
    expect(center.u).toBeCloseTo((1 + 3977 / 2 + 0.5) / 4096, 3);
    expect(center.v).toBeCloseTo(0.5, 3);
    const north = projectToUv("ROBINSON", 0, 90, fit);
    expect(north.v).toBeCloseTo(0, 3);
    const east = projectToUv("ROBINSON", 180, 0, fit);
    expect(east.u).toBeCloseTo(3978 / 4096, 3);
  });

  it("경계 측정이 실패하면 이미지 전체를 쓴다", () => {
    const fit = boundsFit({ left: 0, right: 0, top: 0, bottom: 0 }, 4096, 2013);
    expect(fit).toEqual({ offsetU: 0, offsetV: 0, scaleU: 1, scaleV: 1 });
  });

  it("알 수 없는 투영 이름은 기본값으로 되돌린다", () => {
    expect(parseMapProjection("SOMETHING")).toBe("EQUIRECTANGULAR");
    expect(parseMapProjection("ROBINSON")).toBe("ROBINSON");
  });
});
