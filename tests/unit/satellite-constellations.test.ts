import { describe, expect, it } from "vitest";
import { SATELLITE_NETWORKS } from "@/src/ui/globe-satellites";

describe("satellite constellations", () => {
  it("provides the three communication networks", () => {
    expect(SATELLITE_NETWORKS.map((network) => network.id)).toEqual([
      "starlink",
      "europe",
      "china",
    ]);
  });

  it("keeps point density subordinate to the orbital mesh", () => {
    const counts = Object.fromEntries(
      SATELLITE_NETWORKS.map((network) => [
        network.id,
        network.planes.reduce((total, plane) => total + plane.count, 0),
      ]),
    );
    expect(counts.starlink).toBeLessThan(5_000);
    expect(counts.china).toBeLessThan(2_000);
    expect(counts.europe).toBeLessThan(200);
  });

  it("uses distinct multi-plane layouts with high-latitude convergence", () => {
    const layouts = SATELLITE_NETWORKS.map((network) =>
      [...new Set(network.planes.map((plane) => plane.inclination))].join(","),
    );
    expect(new Set(layouts).size).toBe(SATELLITE_NETWORKS.length);
    expect(SATELLITE_NETWORKS.find((network) => network.id === "starlink")?.planes).toHaveLength(
      540,
    );
    expect(SATELLITE_NETWORKS.find((network) => network.id === "china")?.planes).toHaveLength(224);
    expect(
      SATELLITE_NETWORKS.every((network) =>
        network.planes.some((plane) => plane.inclination >= 70),
      ),
    ).toBe(true);
    expect(SATELLITE_NETWORKS.reduce((total, network) => total + network.planes.length, 0)).toBe(
      784,
    );
  });
});
