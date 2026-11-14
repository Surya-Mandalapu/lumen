import { lazy, Suspense, useState } from "react";
import type { LunarFeature, SearchRequest, TerrainData } from "../lib/types";
import type { CoverageCatalog, CoverageOutcome } from "../lib/planning";
import { projectPolar, selectedCircle, unprojectPolar } from "../lib/coverage";
import { HemisphereDiscovery } from "./HemisphereDiscovery";
import { CoarseAreaPreview } from "./CoarseAreaPreview";
import { southernCoordinate } from "../lib/hemisphere";
import "./hemisphere.css";

const TerrainScene = lazy(() => import("./TerrainScene").then(module => ({ default: module.TerrainScene })));
const GlobeScene = lazy(() => import("./GlobeScene").then(module => ({ default: module.GlobeScene })));

export function VerifiedArea({ catalog, request, features, terrain, outcome, pending, error, onChange, onRetry }: {
  terrain: TerrainData | null;
  catalog: CoverageCatalog; request: SearchRequest; features: LunarFeature[];
  outcome: CoverageOutcome | null; pending: boolean; error: string | null;
  onChange: (request: SearchRequest) => void; onRetry: () => void;
}) {
  const [view, setView] = useState<"terrain" | "globe">("globe");
  const [local, setLocal] = useState(false);
  const [selectionError, setSelectionError] = useState("");
  const [editorOpen, setEditorOpen] = useState(() => window.innerWidth > 850);
  const circle = selectedCircle(request.region, features);
  const selectedFeature = request.region.selector_type === "feature_radius" ? features.find(feature => feature.id === request.region.resolved_feature_id) : undefined;
  const center = selectedFeature ? { latitude_deg: selectedFeature.latitude_deg, longitude_deg_east: selectedFeature.longitude_deg_east } : request.region.center ?? { latitude_deg: -89.9, longitude_deg_east: 0 };
  const landmarks = features.filter(feature => {
    if (feature.latitude_deg > -87) return false;
    const [x, y] = projectPolar(feature.latitude_deg, feature.longitude_deg_east);
    const [left, bottom, right, top] = catalog.geometry.extent_m;
    const radius = (request.region.search_radius_km ?? 3) * 1000;
    return x + radius >= left && x - radius <= right && y + radius >= bottom && y - radius <= top;
  });
  function selectCoordinate(coordinate: { latitude_deg: number; longitude_deg_east: number }) {
    if (!southernCoordinate(coordinate)) { setSelectionError("Choose a point in the southern hemisphere, between the equator and the south pole."); return; }
    setSelectionError(""); setLocal(true);
    onChange({ ...request, region: { selector_type: "circle", center: { latitude_deg: coordinate.latitude_deg, longitude_deg_east: coordinate.longitude_deg_east }, search_radius_km: request.region.search_radius_km ?? 3 } });
  }
  function selectArea(coordinate: { latitude_deg: number; longitude_deg_east: number }, radiusKm: number) {
    if (!southernCoordinate(coordinate)) { setSelectionError("Choose an area in the southern hemisphere."); return; }
    setSelectionError(""); setLocal(true);
    onChange({ ...request, region: { selector_type: "circle", center: coordinate, search_radius_km: radiusKm } });
  }
  function select(x: number, y: number) { selectCoordinate(unprojectPolar(x, y)); }
  return <>
  {selectionError && <p className="guide-error" role="alert">{selectionError}</p>}
  <div className="area-layout">
    <div><div className="area-view-switch" role="group" aria-label="Lunar view">{([ ["globe", "3D Moon"], ["terrain", "Prepared polar terrain"] ] as const).map(([mode, label]) => <button className="secondary-button" key={mode} aria-pressed={view === mode} onClick={() => setView(mode)}>{label}</button>)}</div>
      <div className="area-3d-preview"><Suspense fallback={<p role="status">Loading the 3D Moon…</p>}>{view === "globe" ? <GlobeScene onArea={selectArea} maximumRadiusKm={catalog.public_limits.maximum_radius_km} preparedLabel={catalog.label} selectedCenter={circle ? center : undefined} focusSelection={local} radiusKm={request.region.search_radius_km} timeRange={request.time_range} onPick={selectCoordinate} /> : terrain ? <TerrainScene terrain={terrain} candidates={[]} selected={null} onSelect={() => {}} onPick={select} mode="terrain" layer="terrain" mapCandidates={[]} psr={null} features={[]} studyArea={circle && center.latitude_deg <= -87 ? { x_m: circle.x, y_m: circle.y, radius_m: circle.radius } : undefined} /> : <div className="scene-empty"><p>3D terrain is unavailable. Use the 3D Moon or enter coordinates.</p><button className="secondary-button" onClick={() => setView("globe")}>Show 3D Moon</button></div>}</Suspense></div>
    </div>
    <details className="area-editor" open={editorOpen} onToggle={event => setEditorOpen(event.currentTarget.open)}><summary>Study area <span>{Math.abs(center.latitude_deg).toFixed(3)}°S · {center.longitude_deg_east.toFixed(3)}°E</span></summary><div className="area-editor-content">
      <HemisphereDiscovery features={features} center={center} local={local} onExplore={() => { setLocal(false); setView("globe"); }} onSelect={coordinate => { setView("globe"); selectCoordinate(coordinate); }} />
      <label className="field">Area selection<select aria-label="Area selection" value={request.region.selector_type} onChange={event => {
        const mode = event.target.value as SearchRequest["region"]["selector_type"];
        if (mode === "full_supported_region") onChange({ ...request, region: { selector_type: mode } });
        else if (mode === "feature_radius") {
          const feature = landmarks[0];
          onChange({ ...request, region: { selector_type: mode, resolved_feature_id: feature?.id, input_text: feature?.name,
            center: feature ? { latitude_deg: feature.latitude_deg, longitude_deg_east: feature.longitude_deg_east } : undefined, search_radius_km: request.region.search_radius_km ?? 3 } });
        } else onChange({ ...request, region: { selector_type: mode, center, search_radius_km: request.region.search_radius_km ?? 3 } });
      }}><option value="circle">Local area · coordinates or map</option><option value="feature_radius" disabled={!landmarks.length}>Near an approved landmark{!landmarks.length ? " · no supported landmarks" : ""}</option><option value="full_supported_region">Full prepared region · October 2028 demo</option></select></label>
      {request.region.selector_type === "feature_radius" && <label className="field">Approved landmark<select value={request.region.resolved_feature_id ?? ""} onChange={event => {
        const feature = features.find(item => item.id === event.target.value)!;
        onChange({ ...request, region: { ...request.region, resolved_feature_id: feature.id, input_text: feature.name, center: { latitude_deg: feature.latitude_deg, longitude_deg_east: feature.longitude_deg_east } } });
      }}>{features.map(feature => <option key={feature.id} value={feature.id} disabled={!landmarks.some(item => item.id === feature.id)}>{feature.name}{!landmarks.some(item => item.id === feature.id) ? " · outside coverage" : ""}</option>)}</select></label>}
      {request.region.selector_type === "circle" && <div className="guide-fields"><label className="field">Latitude ° (south is negative)<input type="number" min="-90" max="0" step="any" value={center.latitude_deg} onChange={event => selectCoordinate({ ...center, latitude_deg: Number(event.target.value) })} /></label>
        <label className="field">Longitude °E<input type="number" min="-180" max="179.999999" step="any" value={center.longitude_deg_east} onChange={event => selectCoordinate({ ...center, longitude_deg_east: Number(event.target.value) })} /></label></div>}
      {request.region.selector_type !== "full_supported_region" && <label className="field">Detailed search radius (km)<input type="number" min="1" max={catalog.public_limits.maximum_radius_km} step=".01" value={request.region.search_radius_km ?? ""} onChange={event => onChange({ ...request, region: { ...request.region, search_radius_km: event.target.value ? Number(event.target.value) : undefined } })} /><small>Keep the circle at or below {catalog.public_limits.maximum_radius_km} km to compare individual locations.</small></label>}
      <div className={`coverage-outcome ${pending ? "pending" : outcome?.status ?? "unavailable"}`} role="status">
        <strong>{pending ? "Verifying selected area…" : error ? "Coverage unavailable" : outcome?.status === "outside" ? "Coarse exploration area" : outcome?.status === "partial" ? "Partial detailed coverage — acknowledgment required" : outcome ? "Detailed sites available" : "Choose an area"}</strong>
        <p>{error ?? (outcome?.status === "outside" ? "Rank coarse locations inside this circle below, or choose a prepared polar area for detailed terrain and mission constraints." : outcome?.message) ?? "A verified overlap is required before mission setup."}</p>
        {!pending && outcome && <span>{outcome.candidate_count.toLocaleString()} prepared candidate locations in your selection.</span>}
        {error && <button className="secondary-button" onClick={onRetry}>Retry coverage check</button>}
      </div>
      {outcome?.status === "outside" && <button className="secondary-button" onClick={() => selectCoordinate({ latitude_deg: -89.9, longitude_deg_east: 0 })}>Use a supported south-pole area</button>}
      <p className="field-hint">{catalog.candidate_spacing_m} m candidate spacing · exact pole excluded. Live areas: up to {catalog.public_limits.maximum_radius_km} km radius. Broader analysis is available through the fixed full-region demo.</p>
    </div></details>
  </div>
  {request.region.selector_type !== "full_supported_region" && <div className="local-area-workspace" hidden={outcome?.status !== "outside" || !southernCoordinate(center)}><CoarseAreaPreview center={center} radiusKm={request.region.search_radius_km} /></div>}
  </>;
}
