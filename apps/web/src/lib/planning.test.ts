import { describe, expect, it } from "vitest";
import { canonical, publicLimitErrors, summaryHtml } from "./planning";
import type { CoverageCatalog } from "./planning";
import { DEFAULT_REQUEST } from "./missions";
import type { Candidate, SearchResponse } from "./types";

const catalog = { public_limits: { maximum_radius_km: 5, maximum_live_days: 7, full_region_start_utc: "2028-10-01T00:00:00Z", full_region_end_utc: "2028-10-31T00:00:00Z" } } as CoverageCatalog;
const request = { ...structuredClone(DEFAULT_REQUEST), region: { selector_type: "circle" as const, center: { latitude_deg: -89.9, longitude_deg_east: 0 }, search_radius_km: 3 }, time_range: { start_utc: "2028-10-01T00:00:00Z", end_utc: "2028-10-08T00:00:00Z" } };
describe("guided planning contract", () => {
  it("compares normalized JSON independently of key order and absent optional fields", () => {
    expect(canonical({ b: null, a: { z: 1, y: 2 } })).toBe(canonical({ a: { y: 2, z: 1 } }));
    expect(canonical(request)).not.toBe(canonical({ ...request, preferences: { ...request.preferences, illumination: 1 } }));
  });
  it("uses advertised limits, retains inputs and requires the explicit full-region demo window", () => {
    expect(publicLimitErrors(request, catalog)).toEqual([]);
    const edited = { ...request, region: { ...request.region, search_radius_km: 6 }, time_range: { ...request.time_range, end_utc: "2028-10-09T00:00:00Z" } };
    expect(publicLimitErrors(edited, catalog)).toHaveLength(2);
    expect(edited.region.search_radius_km).toBe(6);
    expect(publicLimitErrors({ ...request, region: { selector_type: "full_supported_region" } }, catalog)).toHaveLength(1);
  });
  it("exports applied evidence, escapes content and caps the readable summary at two sites", () => {
    const site = { id:"a", rank:1, latitude_deg:-89.9, longitude_deg_east:0, slope_deg:2, criteria_scores:{illumination:.8,earth_visibility:.7,terrain_safety:.6,science_proximity:null}, metrics:{illumination_fraction:.8, earth_visibility_fraction:.7,longest_blackout_hours:2} } as Candidate;
    const result = { search_id:'<script>bad</script>', request, common_window:{ ...request.time_range, step_minutes:5 }, normalized_preferences:request.preferences, candidates:[site], assumptions:[], warnings:['<unsafe>'], provenance:{terrain:{dataset_version:'test',candidate_spacing_m:500,horizon_azimuth_step_deg:5}} } as unknown as SearchResponse;
    const html = summaryHtml(result, [site,site,site], 'Prepared <area>');
    expect(html).toContain('2028-10-08');
    expect(html).toContain('Prepared &lt;area&gt;');
    expect(html).not.toContain('<script>');
    expect(html.match(/<section>/g)).toHaveLength(2);
    expect(html).toContain('sampled time');
    expect(html).toContain('unavailable for these sites');
  });
});
