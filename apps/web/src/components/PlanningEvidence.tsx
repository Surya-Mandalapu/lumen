import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Candidate, LunarFeature, MapLayer, PSRLayer, RegionManifest, SearchResponse, TerrainData, TimeSample } from "../lib/types";
import { Comparison } from "./CandidateResults";
import { SiteAnalysis } from "./SiteAnalysis";
import { RefinedInspection } from "./RefinedInspection";
import { ScenarioLab } from "./ScenarioLab";
import { ResultExplanation } from "./ResultExplanation";
import { downloadJson, downloadTimelineCsv } from "../lib/format";
import { downloadHtml, summaryHtml } from "../lib/planning";

const TerrainScene = lazy(() => import("./TerrainScene").then(module => ({ default: module.TerrainScene })));
const GlobeScene = lazy(() => import("./GlobeScene").then(module => ({ default: module.GlobeScene })));
const SkyScene = lazy(() => import("./SkyScene").then(module => ({ default: module.SkyScene })));

export function PlanningDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => { dialog.current?.close(); previous?.focus(); };
  }, []);
  return <dialog className="planning-dialog" ref={dialog} aria-labelledby="planning-dialog-title" onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="planning-dialog-header"><h2 id="planning-dialog-title">{title}</h2><button className="secondary-button" autoFocus onClick={onClose}>Close panel</button></div>{children}
  </dialog>;
}

export function MissionSummary({ result, sites, coverage, onClose, stale }: { result: SearchResponse; sites: Candidate[]; coverage: string; onClose: () => void; stale: boolean }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const html = summaryHtml(result, sites, coverage);
  return <PlanningDialog title="Readable mission summary" onClose={onClose}>
    {stale && <p className="changed-notice">This summary records the previous applied analysis. Edited inputs have not been analyzed.</p>}
    <p>Uses the applied mission and up to two selected sites. Scientific JSON remains a separate export.</p>
    <div className="guide-actions"><button className="primary-button" onClick={() => frame.current?.contentWindow?.print()}>Print / Save as PDF</button><button className="secondary-button" onClick={() => downloadHtml(html, `lumen-summary-${result.search_id}.html`)}>Download HTML summary</button><button className="text-button" onClick={() => downloadJson(result, `lumen-${result.search_id}.json`)}>Scientific JSON</button></div>
    <iframe className="mission-summary-frame" ref={frame} srcDoc={html} sandbox="allow-same-origin allow-modals" title="Printable applied mission summary" />
  </PlanningDialog>;
}
export function CompareDialog({ sites, result, onClose }: { sites: Candidate[]; result: SearchResponse; onClose: () => void }) {
  return <PlanningDialog title="Compare two sites in the same mission window" onClose={onClose}><Comparison sites={sites} result={result} onClose={onClose} /></PlanningDialog>;
}

const sections = ["Overview", "Timeline", "Terrain horizon", "Events & blockers", "Scenarios", "Terrain & sky", "Sources & exports"];
export function PlanningEvidence({ site, result, terrain, manifest, psr, features, onExplore, onDelay, onClose, stale }: {
  site: Candidate; result: SearchResponse; terrain: TerrainData | null; manifest: RegionManifest | null;
  psr: PSRLayer | null; features: LunarFeature[]; onExplore: (id: string) => void; onDelay: (hours: number) => void; onClose: () => void; stale: boolean;
}) {
  const [tab, setTab] = useState(0);
  const [view, setView] = useState<"map" | "terrain" | "globe" | "sky">("terrain");
  const [layer, setLayer] = useState<MapLayer>("terrain");
  const [sample, setSample] = useState<TimeSample | null>(null);
  return <PlanningDialog title={`Inspect ${site.rank ? `Candidate ${String(site.rank).padStart(2, "0")}` : "selected location"}`} onClose={onClose}>
    <p>{result.common_window.start_utc} to {result.common_window.end_utc} · one applied mission.</p>
    {stale && <p className="changed-notice">These details belong to the previous applied request; your edited inputs have not been analyzed.</p>}
    <div className="evidence-tabs" role="tablist" aria-label="Site evidence">{sections.map((label, index) => <button key={label} id={`evidence-tab-${index}`} role="tab" aria-selected={tab === index} aria-controls="evidence-panel" tabIndex={tab === index ? 0 : -1} onClick={() => setTab(index)} onKeyDown={event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault(); const next = event.key === "Home" ? 0 : event.key === "End" ? sections.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + sections.length) % sections.length;
      setTab(next); document.getElementById(`evidence-tab-${next}`)?.focus();
    }}>{label}</button>)}</div>
    <div id="evidence-panel" role="tabpanel" aria-labelledby={`evidence-tab-${tab}`} tabIndex={0}>
      {tab === 0 && <><h3>Planning indicators and required limits</h3><p>Planning score: {site.score.toFixed(1)} / 100 under these priorities. Scores less than 2 points apart are near ties.</p><ResultExplanation site={site} result={result} /><dl className="inspection-facts"><div><dt>Terrain slope</dt><dd>{site.slope_deg.toFixed(2)}° · 100 m baseline from a 1 km output grid</dd></div><div><dt>Roughness</dt><dd>{site.roughness_m.toFixed(2)} m · same source footprint</dd></div><div><dt>PSR distance</dt><dd>{site.distance_psr_km == null ? "Unavailable in this dataset" : `${site.distance_psr_km.toFixed(3)} km`}</dd></div><div><dt>Approved-feature center distance</dt><dd>{site.distance_science_feature_km == null ? "Not selected or unavailable" : `${site.distance_science_feature_km.toFixed(3)} km`}</dd></div></dl><p>Sunlight counts any upper solar limb above the horizon. Earth visibility means the center of Earth is above modeled terrain. Neither establishes usable power, RF performance or landing safety.</p></>}
      {(tab === 1 || tab === 2) && <SiteAnalysis site={site} result={result} section={tab === 1 ? "timeline" : "horizon"} onSampleChange={setSample} />}
      {tab === 3 && <RefinedInspection site={site} result={result} />}
      {tab === 4 && <ScenarioLab site={site} result={result} onApplyDelay={onDelay} />}
      {tab === 5 && <><div className="guide-fields"><label className="field">Terrain view<select value={view} onChange={event => setView(event.target.value as typeof view)}><option value="map">2D map</option><option value="terrain">3D terrain</option><option value="globe">Moon context</option><option value="sky">Local sky</option></select></label><label className="field">Map layer<select value={layer} disabled={view === "globe" || view === "sky"} onChange={event => setLayer(event.target.value as MapLayer)}><option value="terrain">Terrain relief</option><option value="elevation">Elevation</option><option value="score">Planning score · points</option><option value="illumination">Time with sunlight · points</option><option value="earth_visibility">Time with Earth in view · points</option><option value="psr" disabled={!psr}>Mapped PSR area{!psr ? " · unavailable" : ""}</option></select></label></div>
        {!psr && <p className="field-hint">PSR overlay unavailable: the service has not supplied a verified display mask.</p>}
        <div className="evidence-terrain"><Suspense fallback={<p role="status">Loading selected view…</p>}>{view === "globe" ? <GlobeScene preparedLabel={manifest?.supported_region.label} /> : view === "sky" ? site.timeline.length ? <SkyScene site={site} sample={sample ?? site.timeline[0]} /> : <p>No timeline samples are available for this sky view.</p> : terrain ? <TerrainScene terrain={terrain} candidates={result.candidates} selected={site.id} onSelect={onExplore} mode={view} layer={layer} mapCandidates={result.map_candidates ?? []} psr={psr} features={features} /> : <p>Terrain display unavailable. Computed site metrics and tables remain available.</p>}</Suspense></div>
        <p className="field-hint">Display sampling: {terrain?.resolution_m ?? "unavailable"} m; height is exaggerated 1.5× in 3D. A display mesh does not define scientific coverage.</p></>}
      {tab === 6 && <><h3>Scientific exports</h3><div className="guide-actions"><button className="secondary-button" onClick={() => downloadJson(result, `lumen-${result.search_id}.json`)}>Download scientific JSON</button><button className="secondary-button" onClick={() => downloadTimelineCsv(site.timeline.map(row => ({ ...row })), `lumen-timeline-${site.id}.csv`)}>Download timeline CSV</button></div><h3>Assumptions, sampling and sources</h3><ul>{[...new Set([...result.assumptions, ...result.warnings])].map(text => <li key={text}>{text}</li>)}</ul><p><a href="https://pgda.gsfc.nasa.gov/products/90" target="_blank" rel="noreferrer">NASA terrain source</a> · <a href="https://naif.jpl.nasa.gov/naif/data_generic.html" target="_blank" rel="noreferrer">JPL ephemeris kernels</a></p><details><summary>Complete returned provenance</summary><pre>{JSON.stringify(result.provenance, null, 2)}</pre></details></>}
    </div>
  </PlanningDialog>;
}
