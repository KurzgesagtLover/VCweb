import { describe, expect, it } from "vitest";
import {
  celestialDirectionFromCamera,
  celestialPositions,
  directionToView,
} from "@/src/domain/map/celestial";

describe("celestialPositions", () => {
  it("춘분과 동지의 태양 적위를 계산한다", () => {
    const marchEquinox = celestialPositions(new Date("2024-03-20T03:06:00.000Z"));
    const juneSolstice = celestialPositions(new Date("2024-06-20T20:51:00.000Z"));
    const decemberSolstice = celestialPositions(new Date("2024-12-21T09:21:00.000Z"));

    expect(marchEquinox.sun.latitude).toBeCloseTo(0, 1);
    expect(juneSolstice.sun.latitude).toBeCloseTo(23.44, 1);
    expect(decemberSolstice.sun.latitude).toBeCloseTo(-23.44, 1);
  });

  it("일식 시각에는 태양과 달의 직하점이 거의 겹친다", () => {
    const eclipse = celestialPositions(new Date("2024-04-08T18:18:00.000Z"));
    expect(Math.abs(eclipse.sun.longitude - eclipse.moon.longitude)).toBeLessThan(0.2);
    expect(Math.abs(eclipse.sun.latitude - eclipse.moon.latitude)).toBeLessThan(0.5);
    expect(eclipse.moonIllumination).toBeLessThan(0.001);
  });

  it("천체 방향을 현재 구체 시점으로 회전한다", () => {
    expect(directionToView([1, 0, 0], 0, 0)).toEqual({ x: 0, y: 0, z: 1 });
    const east = directionToView([0, 1, 0], 0, 0);
    expect(east.x).toBeCloseTo(1, 8);
    expect(east.y).toBeCloseTo(0, 8);
    expect(east.z).toBeCloseTo(0, 8);
  });

  it("실제 거리와 각지름을 유지한 채 카메라에서 천체를 바라본다", () => {
    const positions = celestialPositions(new Date("2026-08-26T12:00:00.000Z"));
    expect(positions.sun.distanceEarthRadii).toBeGreaterThan(23_000);
    expect(positions.moon.distanceEarthRadii).toBeGreaterThan(55);
    expect(positions.moon.distanceEarthRadii).toBeLessThan(65);
    expect(positions.sun.angularRadius).toBeCloseTo(0.00465, 3);
    expect(positions.moon.angularRadius).toBeCloseTo(0.0046, 3);

    const far = celestialDirectionFromCamera(positions.sun, 0, 18, 0.7);
    const near = celestialDirectionFromCamera(positions.sun, 0, 18, 4.0);
    expect(far[0]).toBeCloseTo(near[0], 3);
    expect(far[1]).toBeCloseTo(near[1], 3);
    expect(far[2]).toBeCloseTo(near[2], 3);
  });
});
