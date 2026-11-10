import type { CoverageCatalog } from "../lib/planning";
import { appliedConstraints, constraintLabels, presetNames, priorityName } from "../lib/planning";
import type { LunarFeature, SearchRequest } from "../lib/types";
import { MISSION_PRESETS } from "../lib/missions";
import { normalizePreferences } from "../lib/weights";
import { MissionBrief } from "./MissionStudio";

export function PlanningMission({ request, catalog, features, onChange }: {
  request: SearchRequest; catalog: CoverageCatalog; features: LunarFeature[]; onChange: (request: SearchRequest) => void;
}) {
  const weights = normalizePreferences(request.preferences);
  return <>
    <div className="guide-fields"><label className="field">Mission start (UTC)<input required type="datetime-local" value={request.time_range.start_utc.slice(0, 16)} onChange={event => onChange({ ...request, time_range: { ...request.time_range, start_utc: event.target.value ? `${event.target.value}:00Z` : "" } })} /></label>
      <label className="field">Mission end (UTC, exclusive)<input required type="datetime-local" value={request.time_range.end_utc.slice(0, 16)} onChange={event => onChange({ ...request, time_range: { ...request.time_range, end_utc: event.target.value ? `${event.target.value}:00Z` : "" } })} /></label></div>
    <p className="field-hint">{request.region.selector_type === "full_supported_region" ? "Full-region searches use the prepared October 1–31, 2028 demonstration window." : `Live detailed missions: up to ${catalog.public_limits.maximum_live_days} days. Dates are checked against the service’s advertised ephemeris range.`}</p>
    {request.region.selector_type === "full_supported_region" && <button className="secondary-button" onClick={() => onChange({ ...request, time_range: { start_utc: catalog.public_limits.full_region_start_utc, end_utc: catalog.public_limits.full_region_end_utc } })}>Apply October 2028 demo window</button>}
    <fieldset className="preset-fieldset"><legend>What would you like to prioritize?</legend><div className="preset-grid">{MISSION_PRESETS.slice(0, 3).map((preset, index) => <button type="button" key={preset.id} aria-pressed={priorityName(request) === presetNames[index]}
      onClick={() => onChange({ ...request, preferences: structuredClone(preset.request.preferences), hard_constraints: structuredClone(preset.request.hard_constraints) })}>
      <strong>{presetNames[index]}</strong><span>{index === 0 ? "Balance sunlight, Earth view and terrain." : index === 1 ? "Give sunlight more influence in ranking." : "Give Earth visibility more influence in ranking."}</span>
    </button>)}</div></fieldset>
    <p className="priority-readout">Applied priorities: {Math.round(weights.illumination * 100)}% sunlight · {Math.round(weights.earth_visibility * 100)}% Earth view · {Math.round(weights.terrain_safety * 100)}% terrain · {Math.round(weights.science_proximity * 100)}% science proximity.</p>
    <p className="field-hint">Required limits from this configuration: {appliedConstraints(request).join("; ") || "none"}. A preset replaces priorities and limits; it keeps your area and dates.</p>
    <details className="advanced-mission"><summary>Advanced · required limits and custom priorities</summary>
      <h3>Required limits</h3><p>Locations must meet every applied limit before ranking. Leave a field blank to remove that requirement.</p>
      <div className="guide-fields">{Object.entries(constraintLabels).map(([key, label]) => {
        const field = key as keyof SearchRequest["hard_constraints"];
        const value = request.hard_constraints[field];
        const factor = key.endsWith("_fraction") ? 100 : 1;
        const unavailable = key === "maximum_distance_to_psr_km" && !catalog.layers.psr_distance;
        const missingFeature = key === "maximum_distance_to_science_feature_km" && !request.hard_constraints.science_feature_ids?.length;
        return <label className="field" key={key}>{label}<input type="number" step="any" min={key.includes("elevation") ? undefined : 0} max={factor === 100 ? 100 : undefined} value={typeof value === "number" ? value * factor : ""} disabled={unavailable || missingFeature}
          onChange={event => { const hard_constraints = { ...request.hard_constraints }; if (event.target.value === "") delete hard_constraints[field]; else Object.assign(hard_constraints, { [key]: Number(event.target.value) / factor }); onChange({ ...request, hard_constraints }); }} />
          {(unavailable || missingFeature) && value != null && <button type="button" className="text-button" onClick={() => { const hard_constraints = { ...request.hard_constraints }; delete hard_constraints[field]; onChange({ ...request, hard_constraints }); }}>Remove unavailable requirement</button>}{unavailable && <small>Unavailable: this verified dataset has no PSR-distance layer.</small>}{missingFeature && <small>Select an approved science feature below to enable this limit.</small>}</label>;
      })}</div>
      <label className="field">Science feature centers<select multiple value={request.hard_constraints.science_feature_ids ?? []} onChange={event => onChange({ ...request, hard_constraints: { ...request.hard_constraints, science_feature_ids: Array.from(event.target.selectedOptions, option => option.value) } })}>
        {features.map(feature => <option key={feature.id} value={feature.id}>{feature.name}</option>)}</select></label>
      <h3>Ranking preferences</h3><p>Preferences change the score among eligible sites. They do not override required limits.</p>
      <div className="guide-fields">{Object.keys(request.preferences).map(key => <label className="field" key={key}>{key.replaceAll("_", " ")} weight<input type="number" min="0" step="1" value={request.preferences[key as keyof typeof request.preferences]} onChange={event => onChange({ ...request, preferences: { ...request.preferences, [key]: Number(event.target.value) } })} /></label>)}</div>
      <p className="field-hint">Slope/roughness are published 100 m-baseline measurements sampled on 1 km output grids. Source-pixel scale is not accuracy. PSR proximity is not evidence of accessible ice.</p>
      <MissionBrief value={request} features={features} onApply={onChange} />
    </details>
  </>;
}
