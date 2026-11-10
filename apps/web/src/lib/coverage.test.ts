import { describe, expect, it } from "vitest";
import {
  footprintOverlap,
  projectPolar,
  selectedCircle,
  unprojectPolar,
} from "./coverage";
import type { LunarFeature } from "./types";

describe("polar coverage preview", () => {
  it("preserves east-positive longitudes across the antimeridian and near the pole", () => {
    for (const latitude of [-89.99, -89.5, -87]) {
      for (const longitude of [-180, -90, 0, 90, 179.9]) {
        const result = unprojectPolar(...projectPolar(latitude, longitude));
        expect(result.latitude_deg).toBeCloseTo(latitude, 9);
        expect(result.longitude_deg_east).toBeCloseTo(longitude, 9);
      }
    }
    expect(projectPolar(-90, 0)).toEqual([0, 0]);
  });
  it("distinguishes contained, partial and outside footprints, including corner misses", () => {
    const extent: [number, number, number, number] = [
      -10000, -10000, 10000, 10000,
    ];
    expect(footprintOverlap({ x: 0, y: 0, radius: 3000 }, extent)).toBe(
      "inside",
    );
    expect(footprintOverlap({ x: 9000, y: 0, radius: 3000 }, extent)).toBe(
      "partial",
    );
    expect(footprintOverlap({ x: 13000, y: 13000, radius: 4000 }, extent)).toBe(
      "outside",
    );
  });
  it("resolves approved feature IDs instead of trusting supplied centers", () => {
    const feature = {
      id: "approved",
      latitude_deg: -89.9,
      longitude_deg_east: 45,
    } as LunarFeature;
    const region = {
      selector_type: "feature_radius" as const,
      resolved_feature_id: "approved",
      center: { latitude_deg: 0, longitude_deg_east: 0 },
      search_radius_km: 3,
    };
    const circle = selectedCircle(region, [feature])!;
    expect(unprojectPolar(circle.x, circle.y).latitude_deg).toBeCloseTo(-89.9);
    expect(selectedCircle(region, [])).toBeNull();
    expect(
      selectedCircle({ selector_type: "full_supported_region" }, []),
    ).toBeNull();
  });
});
