import { describe, expect, it } from "vitest";
import {
  ELEVATION_DETAIL_MIN_ZOOM,
  elevationDetailWindow,
  elevationVisibleWindow,
  elevationWindowContains,
  elevationWindowStride,
  packElevationSamples,
} from "@/src/domain/map/elevation-detail";

describe("elevation detail", () => {
  it("줌인했을 때만 현재 시점 주변 창을 만든다", () => {
    expect(elevationDetailWindow({ lon: 0, lat: 0, zoom: ELEVATION_DETAIL_MIN_ZOOM - 0.01 })).toBe(
      null,
    );
    const detail = elevationDetailWindow({ lon: 127, lat: 36, zoom: 4 });
    expect(detail).not.toBeNull();
    expect(detail!.width).toBeLessThan(0.25);
    expect(detail!.height).toBeLessThan(0.25);
  });

  it("날짜변경선 바깥 창을 0..1 범위의 순환 좌표로 유지한다", () => {
    const detail = elevationDetailWindow({ lon: 179, lat: 0, zoom: 3 });
    expect(detail).not.toBeNull();
    expect(detail!.left).toBeGreaterThanOrEqual(0);
    expect(detail!.left).toBeLessThan(1);
    expect(detail!.left + detail!.width).toBeGreaterThan(1);
  });

  it("현재 시야가 여유 상세 창 안에 있는 동안 기존 지형을 유지한다", () => {
    const detail = elevationDetailWindow({ lon: 127, lat: 36, zoom: 3 })!;
    const nearby = elevationVisibleWindow({ lon: 128, lat: 36, zoom: 3 })!;
    const far = elevationVisibleWindow({ lon: -40, lat: 36, zoom: 3 })!;
    expect(elevationWindowContains(detail, nearby)).toBe(true);
    expect(elevationWindowContains(detail, far)).toBe(false);
    expect(elevationWindowStride(detail, 2048)).toBeGreaterThanOrEqual(1);
  });

  it("남쪽부터 들어온 고도를 북쪽 우선 RG 바이트로 뒤집어 인코딩한다", () => {
    const packed = packElevationSamples([-11_000, 0, 9_000, 1_000], 2, 2);
    expect([...packed.slice(0, 4)]).toEqual([255, 255, 255, 255]);
    expect(packed[6]).toBe(255);
    expect([...packed.slice(8, 12)]).toEqual([0, 0, 0, 255]);
    expect(packed[14]).toBe(0);
  });
});
