import { describe, expect, it } from "vitest";
import {
  comparisonTradeoffs,
  constraintEvidence,
  contributions,
} from "./explanations";
import type { Candidate, SearchRequest } from "./types";
import { DEFAULT_REQUEST } from "./missions";

const site = {
  rank: 1,
  score: 63,
  slope_deg: 4,
  roughness_m: 2,
  elevation_m: -100,
  criteria_scores: {
    illumination: 0.8,
    earth_visibility: 0.6,
    terrain_safety: 0.5,
    science_proximity: null,
  },
  metrics: {
    illumination_fraction: 0.8,
    earth_visibility_fraction: 0.6,
    longest_sunlight_hours: 20,
    longest_darkness_hours: 10,
    longest_communication_hours: 12,
    longest_blackout_hours: 4,
  },
} as Candidate;

describe("evidence from returned science", () => {
  it("reconstructs score points using applied weights, including unavailable categories", () => {
    const parts = contributions(site, {
      illumination: 0.4,
      earth_visibility: 0.4,
      terrain_safety: 0.2,
      science_proximity: 0,
    });
    expect(parts.reduce((sum, part) => sum + part.points, 0)).toBeCloseTo(66);
    expect(parts[0].label).toBe("Sunlight");
    expect(
      parts.find((part) => part.key === "science_proximity")?.utility,
    ).toBeNull();
  });
  it("checks every supported numeric hard constraint, including negative elevation and zero limits", () => {
    const request: SearchRequest = {
      ...DEFAULT_REQUEST,
      hard_constraints: {
        maximum_slope_deg: 4,
        maximum_roughness_m: 2,
        minimum_elevation_m: -101,
        maximum_elevation_m: -99,
        minimum_illumination_fraction: 0.8,
        minimum_earth_visibility_fraction: 0.6,
        minimum_continuous_sunlight_hours: 20,
        maximum_continuous_darkness_hours: 10,
        minimum_continuous_communication_hours: 12,
        maximum_continuous_blackout_hours: 4,
        maximum_distance_to_psr_km: 0,
        maximum_distance_to_science_feature_km: 0,
      },
    };
    const checks = constraintEvidence(
      { ...site, distance_psr_km: 0, distance_science_feature_km: 0 },
      request,
    );
    expect(checks).toHaveLength(12);
    expect(checks.every((row) => row.passes)).toBe(true);
  });
  it("does not round away failures or turn missing distances into zero", () => {
    const checks = constraintEvidence(
      { ...site, slope_deg: 4.00001 },
      {
        ...DEFAULT_REQUEST,
        hard_constraints: {
          maximum_slope_deg: 4,
          maximum_distance_to_psr_km: 1,
        },
      },
    );
    expect(checks.map((row) => row.passes)).toEqual([false, null]);
    expect(
      constraintEvidence(site, { ...DEFAULT_REQUEST, hard_constraints: {} }),
    ).toEqual([]);
  });
  it("explains opposing tradeoffs without treating a lower blackout as worse", () => {
    const other = {
      ...site,
      rank: 2,
      metrics: {
        ...site.metrics,
        illumination_fraction: 0.9,
        longest_blackout_hours: 8,
      },
    };
    const rows = comparisonTradeoffs(site, other);
    expect(rows[0].leader?.rank).toBe(2);
    expect(rows[0].difference).toBeCloseTo(10);
    expect(rows[1].leader).toBeNull();
    expect(rows[2].leader?.rank).toBe(1);
    expect(rows[2].difference).toBe(4);
  });
});
