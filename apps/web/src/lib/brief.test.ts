import { describe, expect, it } from "vitest";
import { interpretBrief } from "./brief";
import { DEFAULT_REQUEST } from "./missions";
import type { LunarFeature } from "./types";

const feature: LunarFeature = {
  id: "test-approved",
  name: "Shackleton",
  latitude_deg: -89.8,
  longitude_deg_east: 15,
  diameter_km: 20,
  feature_type: "Crater",
  source_url: "https://planetarynames.wr.usgs.gov/Feature/5450",
  approved: true,
};
describe("reviewable mission brief grammar", () => {
  it("resolves coordinates from the supplied approved catalog and parses complete UTC month", () => {
    const result = interpretBrief(
      "Near Shackleton crater for October 2028, maximum slope 8°, minimum Earth visibility 50%, prioritize sunlight",
      DEFAULT_REQUEST,
      [feature],
    );
    expect(result.errors).toEqual([]);
    expect(result.request.region.center).toEqual({
      latitude_deg: feature.latitude_deg,
      longitude_deg_east: feature.longitude_deg_east,
    });
    expect(result.request.region.search_radius_km).toBe(10);
    expect(result.request.time_range.end_utc).toBe("2028-11-01T00:00:00.000Z");
    expect(result.request.hard_constraints.maximum_slope_deg).toBe(8);
    expect(
      result.request.hard_constraints.minimum_earth_visibility_fraction,
    ).toBe(0.5);
    expect(result.request.preferences.illumination).toBe(60);
  });
  it("never invents coordinates or treats unresolved landmarks as valid", () => {
    expect(
      interpretBrief("Near Atlantis for October 2028", DEFAULT_REQUEST, [
        feature,
      ]).errors.join(),
    ).toContain("not resolved");
    expect(
      interpretBrief("Near Shackleton for October 2028", DEFAULT_REQUEST, [])
        .errors.length,
    ).toBeGreaterThan(0);
  });
  it("distinguishes PSR distance from a landmark region radius", () => {
    const result = interpretBrief(
      "Within 20 km of Shackleton for October 2028, PSR within 2 km",
      DEFAULT_REQUEST,
      [feature],
    );
    expect(result.errors).toEqual([]);
    expect(result.request.region.search_radius_km).toBe(20);
    expect(result.request.hard_constraints.maximum_distance_to_psr_km).toBe(2);
    const psrOnly = interpretBrief(
      "October 2028, within 2 km of a PSR",
      DEFAULT_REQUEST,
      [feature],
    );
    expect(psrOnly.errors).toEqual([]);
    expect(psrOnly.request.region).toEqual(DEFAULT_REQUEST.region);
  });
  it("rejects invalid dates, out-of-range and unitless hard constraints", () => {
    for (const brief of [
      "2036-01-01 to 2036-01-02",
      "2028-02-30 to 2028-03-01",
      "October 2028, maximum slope -1",
      "October 2028, minimum sunlight 0.5",
      "October 2028, maximum slope 100",
      "October 2028, must have long sunlight",
    ])
      expect(
        interpretBrief(brief, DEFAULT_REQUEST, [feature]).errors.length,
      ).toBeGreaterThan(0);
  });
  it("preserves the input and discloses retained defaults", () => {
    const original = structuredClone(DEFAULT_REQUEST);
    const result = interpretBrief("prioritize terrain", DEFAULT_REQUEST, [
      feature,
    ]);
    expect(DEFAULT_REQUEST).toEqual(original);
    expect(result.assumptions.join()).toContain("existing mission dates");
    expect(result.assumptions.join()).toContain("existing study region");
  });
  it("rejects unsupported operational requests and unknown prose", () => {
    expect(
      interpretBrief("October 2028 relay optimization", DEFAULT_REQUEST, [])
        .errors.length,
    ).toBeGreaterThan(0);
    expect(
      interpretBrief("hello world", DEFAULT_REQUEST, []).errors.length,
    ).toBeGreaterThan(0);
  });
});
