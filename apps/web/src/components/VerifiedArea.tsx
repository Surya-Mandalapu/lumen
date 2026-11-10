import { lazy, Suspense, useState } from "react";
import type { LunarFeature, SearchRequest, TerrainData } from "../lib/types";
import type { CoverageCatalog, CoverageOutcome } from "../lib/planning";
import { selectedCircle, unprojectPolar } from "../lib/coverage";

const TerrainScene = lazy(() => import("./TerrainScene").then(module => ({ default: module.TerrainScene })));
const GlobeScene = lazy(() => import("./GlobeScene").then(module => ({ default: module.GlobeScene })));

export function VerifiedArea({ catalog, request, features, terrain, outcome, pending, error, onChange, onRetry }: {
  terrain: TerrainData | null;
  catalog: CoverageCatalog; request: SearchRequest; features: LunarFeature[];
  outcome: CoverageOutcome | null; pending: boolean; error: string | null;
  onChange: (request: SearchRequest) => void; onRetry: () => void;
}) {
  const [view, setView] = useState<"terrain" | "globe">("terrain");
  const circle = selectedCircle(request.region, features);
  const center = request.region.center ?? { latitude_deg: -89.9, longitude_deg_east: 0 };
  function selectCoordinate(coordinate: { latitude_deg: number; longitude_deg_east: number }) {
    onChange({ ...request, region: { selector_type: "circle", center: coordinate, search_radius_km: request.region.search_radius_km ?? 3 } });
  }
  function select(x: number, y: number) { selectCoordinate(unprojectPolar(x, y)); }
  return <div className="area-layout">
    <div><div className="area-view-switch" role="group" aria-label="South-pole view">{([ ["terrain", "3D terrain"], ["globe", "3D Moon"] ] as const).map(([mode, label]) => <button className="secondary-button" key={mode} aria-pressed={view === mode} onClick={() => setView(mode)}>{label}</button>)}</div>
      <div className="area-3d-preview"><Suspense fallback={<p role="status">Loading the 3D south-pole view…</p>}>{view === "globe" ? <GlobeScene preparedLabel={catalog.label} selectedCenter={circle ? center : undefined} onPick={selectCoordinate} /> : terrain ? <TerrainScene terrain={terrain} candidates={[]} selected={null} onSelect={() => {}} onPick={select} mode="terrain" layer="terrain" mapCandidates={[]} psr={null} features={[]} studyArea={circle ? { x_m: circle.x, y_m: circle.y, radius_m: circle.radius } : undefined} /> : <div className="scene-empty"><p>3D terrain is unavailable. Use the 3D Moon or enter coordinates.</p><button className="secondary-button" onClick={() => setView("globe")}>Show 3D Moon</button></div>}</Suspense></div>
      <p className="field-hint">Click or tap the surface to choose your area’s center. Drag to rotate; scroll or pinch to zoom. Gold marks your selection. You can also enter coordinates by keyboard.</p>
      <p className="field-hint">{view === "terrain" ? "NASA elevation terrain in 3D. Display sampling is separate from scientific coverage." : "The Moon color model provides context, not landing-scale accuracy."} Every selected point is checked against verified prepared coverage. Points outside it cannot be submitted; partial coverage requires acknowledgment.</p>
    </div>
    <div className="area-editor">
      <label className="field">Area selection<select aria-label="Area selection" value={request.region.selector_type} onChange={event => {
        const mode = event.target.value as SearchRequest["region"]["selector_type"];
        if (mode === "full_supported_region") onChange({ ...request, region: { selector_type: mode } });
        else if (mode === "feature_radius") {
          const feature = features[0];
          onChange({ ...request, region: { selector_type: mode, resolved_feature_id: feature?.id, input_text: feature?.name,
            center: feature ? { latitude_deg: feature.latitude_deg, longitude_deg_east: feature.longitude_deg_east } : undefined, search_radius_km: request.region.search_radius_km ?? 3 } });
        } else onChange({ ...request, region: { selector_type: mode, center, search_radius_km: request.region.search_radius_km ?? 3 } });
      }}><option value="circle">Local area · coordinates or map</option><option value="feature_radius" disabled={!features.length}>Near an approved landmark{!features.length ? " · catalog unavailable" : ""}</option><option value="full_supported_region">Full prepared region · October 2028 demo</option></select></label>
      {request.region.selector_type === "feature_radius" && <label className="field">Approved landmark<select value={request.region.resolved_feature_id ?? ""} onChange={event => {
        const feature = features.find(item => item.id === event.target.value)!;
        onChange({ ...request, region: { ...request.region, resolved_feature_id: feature.id, input_text: feature.name, center: { latitude_deg: feature.latitude_deg, longitude_deg_east: feature.longitude_deg_east } } });
      }}>{features.map(feature => <option key={feature.id} value={feature.id}>{feature.name}</option>)}</select></label>}
      {request.region.selector_type === "circle" && <div className="guide-fields"><label className="field">Latitude °<input type="number" min="-90" max="90" step="any" value={center.latitude_deg} onChange={event => onChange({ ...request, region: { ...request.region, center: { ...center, latitude_deg: Number(event.target.value) } } })} /></label>
        <label className="field">Longitude °E<input type="number" min="-180" max="179.999999" step="any" value={center.longitude_deg_east} onChange={event => onChange({ ...request, region: { ...request.region, center: { ...center, longitude_deg_east: Number(event.target.value) } } })} /></label></div>}
      {request.region.selector_type !== "full_supported_region" && <label className="field">Radius (km)<input type="number" min="1" max="50" step=".5" value={request.region.search_radius_km ?? ""} onChange={event => onChange({ ...request, region: { ...request.region, search_radius_km: event.target.value ? Number(event.target.value) : undefined } })} /></label>}
      <div className={`coverage-outcome ${pending ? "pending" : outcome?.status ?? "unavailable"}`} role="status">
        <strong>{pending ? "Verifying selected area…" : error ? "Coverage unavailable" : outcome?.status === "outside" ? "Outside prepared coverage" : outcome?.status === "partial" ? "Partial coverage — acknowledgment required" : outcome ? "Supported area" : "Choose an area"}</strong>
        <p>{error ?? outcome?.message ?? "A verified overlap is required before mission setup."}</p>
        {!pending && outcome && <span>{outcome.candidate_count.toLocaleString()} prepared candidate locations in your selection.</span>}
        {error && <button className="secondary-button" onClick={onRetry}>Retry coverage check</button>}
      </div>
      <p className="field-hint">{catalog.candidate_spacing_m} m candidate spacing · exact pole excluded. Live areas: up to {catalog.public_limits.maximum_radius_km} km radius. Broader analysis is available through the fixed full-region demo.</p>
    </div>
  </div>;
}
