import type { Candidate, SearchRequest, SearchResponse } from "./types";
import { comparisonTradeoffs, contributions } from "./explanations";
import { MISSION_PRESETS } from "./missions";
import { coordinate } from "./format";
import { normalizePreferences } from "./weights";

export interface CoverageCatalog {
  dataset_version: string;
  verified: boolean;
  label: string;
  geometry: { type: "rectangle" | "cap" | "cap_tile"; extent_m: [number, number, number, number]; radius_m: number };
  excluded_locations: { x_m: number; y_m: number; radius_m: number; reason: string }[];
  candidate_count: number;
  candidate_spacing_m: number;
  layers: { psr_distance: boolean; approved_features: boolean };
  public_limits: { maximum_radius_km: number; maximum_live_days: number; full_region_start_utc: string; full_region_end_utc: string };
  search_service?: { mode: "synchronous" | "jobs" };
}
export interface CoverageOutcome {
  status: "inside" | "partial" | "outside";
  candidate_count: number;
  region: SearchRequest["region"];
  dataset_version: string;
  message: string;
}
export const presetNames = ["Balanced", "More sunlight", "More Earth visibility"];
export function canonical(value: unknown): string {
  function ordered(item: unknown): unknown {
    if (Array.isArray(item)) return item.map(ordered);
    if (item && typeof item === "object") return Object.fromEntries(Object.entries(item).filter(([, value]) => value != null).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, ordered(value)]));
    return item;
  }
  return JSON.stringify(ordered(value));
}
export function priorityName(request: SearchRequest) {
  const weights = normalizePreferences(request.preferences);
  const match = MISSION_PRESETS.slice(0, 3).findIndex(preset => {
    const expected = normalizePreferences(preset.request.preferences);
    return Object.keys(weights).every(key => Math.abs(weights[key as keyof typeof weights] - expected[key as keyof typeof weights]) < 1e-8);
  });
  return match >= 0 ? presetNames[match] : "Custom priorities";
}
export function areaName(region: SearchRequest["region"]) {
  if (region.selector_type === "full_supported_region") return "Full prepared region";
  const center = region.center;
  return `${region.input_text || (center ? coordinate(center.latitude_deg, center.longitude_deg_east) : "Choose a center")} · ${region.search_radius_km ?? "—"} km radius`;
}
export function publicLimitErrors(request: SearchRequest, catalog: CoverageCatalog) {
  const start = Date.parse(request.time_range.start_utc), end = Date.parse(request.time_range.end_utc);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return ["Choose an end date later than the start date."];
  const limits = catalog.public_limits;
  if (request.region.selector_type === "full_supported_region") {
    return start === Date.parse(limits.full_region_start_utc) && end === Date.parse(limits.full_region_end_utc) ? [] :
      ["Full-region searches use October 1–31, 2028. Apply the demo window, or go back and choose a local area for other dates."];
  }
  const errors = [];
  if ((request.region.search_radius_km ?? Infinity) > limits.maximum_radius_km) errors.push(`Live detailed areas have a maximum ${limits.maximum_radius_km} km radius. Edit the radius or choose the full-region demo.`);
  if (end - start > limits.maximum_live_days * 86400000) errors.push(`Live detailed missions last up to ${limits.maximum_live_days} days. Edit the dates or choose the full-region demo.`);
  return errors;
}
export const constraintLabels: Record<string, string> = {
  maximum_slope_deg: "Maximum slope (°)", maximum_roughness_m: "Maximum roughness (m)",
  minimum_elevation_m: "Minimum elevation (m)", maximum_elevation_m: "Maximum elevation (m)",
  minimum_illumination_fraction: "Minimum time with sunlight (%)", minimum_earth_visibility_fraction: "Minimum time with Earth in view (%)",
  maximum_continuous_darkness_hours: "Maximum continuous darkness (h)", maximum_continuous_blackout_hours: "Maximum Earth blackout (h)",
  minimum_continuous_sunlight_hours: "Minimum continuous sunlight (h)", minimum_continuous_communication_hours: "Minimum continuous Earth view (h)",
  maximum_distance_to_psr_km: "Maximum mapped PSR distance (km)", maximum_distance_to_science_feature_km: "Maximum feature-center distance (km)",
};
export function appliedConstraints(request: SearchRequest) {
  return Object.entries(request.hard_constraints).filter(([, value]) => value != null && (!Array.isArray(value) || value.length)).map(([key, value]) => {
    const factor = key.endsWith("_fraction") ? 100 : 1;
    return `${constraintLabels[key] ?? "Approved feature IDs"}: ${typeof value === "number" ? Number((value * factor).toFixed(4)) : value.join(", ")}`;
  });
}
export function siteTakeaway(site: Candidate, result: SearchResponse) {
  const strongest = contributions(site, result.normalized_preferences).find(part => part.points > 0);
  const peer = result.candidates.find(candidate => candidate.id !== site.id);
  const drawback = peer && comparisonTradeoffs(site, peer).find(row => row.leader?.id === peer.id);
  const peerPoints = peer && contributions(peer, result.normalized_preferences).find(part => part.points > (contributions(site, result.normalized_preferences).find(own => own.key === part.key)?.points ?? 0) + .05);
  return {
    reason: strongest ? `${strongest.label} makes the strongest weighted contribution under your applied priorities.` : "No criterion makes a positive weighted contribution under these priorities.",
    tradeoff: drawback ? `Tradeoff: Candidate ${peer!.rank} has ${drawback.difference.toFixed(1)} ${drawback.unit} ${drawback.higher ? "more" : "less"} ${drawback.label}.` :
      peerPoints ? `Tradeoff: Candidate ${peer!.rank} earns more weighted points for ${peerPoints.label.toLowerCase()} under these priorities.` :
      site.metrics.longest_blackout_hours > 0 ? `Tradeoff: the longest modeled Earth blackout is ${site.metrics.longest_blackout_hours.toFixed(1)} hours.` :
      `Tradeoff: terrain slope is ${site.slope_deg.toFixed(1)}° at the source footprint; unresolved local hazards remain.`,
  };
}
export function escapeHtml(value: unknown) {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}
export function summaryHtml(result: SearchResponse, sites: Candidate[], coverage: string) {
  const h = escapeHtml;
  const cards = sites.slice(0, 2).map(site => {
    const explanation = siteTakeaway(site, result);
    return `<section><h2>Candidate ${h(site.rank)} · ${h(coordinate(site.latitude_deg, site.longitude_deg_east))}</h2><p>Time with sunlight: ${h((site.metrics.illumination_fraction * 100).toFixed(1))}%. Time with Earth in view: ${h((site.metrics.earth_visibility_fraction * 100).toFixed(1))}%. Terrain slope: ${h(site.slope_deg.toFixed(1))}°.</p><p>${h(explanation.reason)} ${h(explanation.tradeoff)}</p></section>`;
  }).join("");
  const terrain = result.provenance.terrain as Record<string, unknown> | undefined;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lumen mission summary</title><style>body{font:16px/1.6 Georgia,serif;color:#172c24;background:#fff;max-width:850px;margin:32px auto;padding:0 24px}h1,h2{line-height:1.2}h1{font-size:32px}h2{font-size:21px;margin-top:32px;break-after:avoid-page}p,li{orphans:3;widows:3}header{border-bottom:2px solid #264c3b}small{color:#4b5e52}li{margin:6px 0}section{break-inside:avoid}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}@page{size:auto;margin:18mm}@media print{body{margin:0;padding:0;font-size:11pt}a{color:inherit}}</style></head><body><header><small>LUMEN / APPLIED MISSION RECORD</small><h1>A mission and its tradeoffs</h1><p>Analysis ${h(result.search_id)}</p></header><h2>Applied mission</h2><p>${h(areaName(result.request.region))}<br>${h(result.common_window.start_utc)} through ${h(result.common_window.end_utc)} (end exclusive).</p><p>Effective coverage: ${h(coverage)}</p><h2>Priorities and required limits</h2><p>${h(priorityName(result.request))}. ${Object.entries(result.normalized_preferences).map(([key, value]) => `${h(key.replaceAll("_", " "))}: ${h((value * 100).toFixed(1))}%`).join("; ")}.</p><ul>${appliedConstraints(result.request).map(text => `<li>${h(text)}</li>`).join("") || "<li>No numeric hard constraints applied.</li>"}</ul>${cards || "<p>No candidates pass these requirements. No limits were relaxed.</p>"}<h2>Scientific context</h2><p>Dataset: ${h(terrain?.dataset_version ?? "See scientific JSON")}. Candidate spacing: ${h(terrain?.candidate_spacing_m ?? "unavailable")} m. Mission integration: ${h(result.common_window.step_minutes)} minutes. Horizon azimuth sampling: ${h(terrain?.horizon_azimuth_step_deg ?? "unavailable")}°. Slope/roughness use 100 m baselines sampled from 1 km output grids.</p><p>PSR distance: ${sites.some(site => site.distance_psr_km != null) ? "available in selected-site evidence" : "unavailable for these sites"}. Feature-center distance: ${sites.some(site => site.distance_science_feature_km != null) ? "available" : "not selected or unavailable"}.</p><h2>How to read the percentages</h2><p>Time with sunlight counts any visible upper solar limb. Time with Earth in view counts Earth's center above the modeled terrain horizon. Percentages describe sampled time, not certainty or mission success.</p><h2>Limits</h2><p>Prototype comparative geometry only. No landing certification, local hazard assessment, usable-power prediction, or RF-link guarantee.</p><ul>${[...new Set([...result.assumptions, ...result.warnings])].map(text => `<li>${h(text)}</li>`).join("")}</ul><details><summary>Applied request</summary><pre>${h(JSON.stringify(result.request, null, 2))}</pre></details></body></html>`;
}
export function downloadHtml(html: string, filename: string) {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
