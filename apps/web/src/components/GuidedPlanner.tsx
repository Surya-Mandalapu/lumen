import { useEffect, useRef, useState } from "react";
import type { Candidate, LunarFeature, PSRLayer, RegionManifest, SearchRequest, SearchResponse, TerrainData } from "../lib/types";
import { getFeatures, getPSRLayer, getRegionManifest, getSiteAnalysis, getTerrain } from "../lib/api";
import type { CoverageCatalog, CoverageOutcome } from "../lib/planning";
import { appliedConstraints, areaName, canonical, priorityName, publicLimitErrors } from "../lib/planning";
import { getCoverage, PlanningError, previewCoverage, runAnalysis } from "../lib/planning-api";
import type { AnalysisState } from "../lib/planning-api";
import { DEFAULT_REQUEST, shiftWindow } from "../lib/missions";
import { downloadJson } from "../lib/format";
import { VerifiedArea } from "./VerifiedArea";
import { PlanningMission } from "./PlanningMission";
import { CandidateResults } from "./CandidateResults";
import { CompareDialog, MissionSummary, PlanningEvidence } from "./PlanningEvidence";
import { MissionLibrary } from "./MissionStudio";
import { SearchBudget } from "./SearchBudget";
import "./guided-planner.css";

function initialRequest(): SearchRequest {
  return { ...structuredClone(DEFAULT_REQUEST), region: { selector_type: "circle", center: { latitude_deg: -89.9, longitude_deg_east: 0 }, search_radius_km: 3 },
    time_range: { start_utc: "2028-10-01T00:00:00Z", end_utc: "2028-10-08T00:00:00Z" } };
}
const phases = { timeout: "Search time limit reached", submitting: "Submitting mission", queued: "Waiting in the queue", running: "Analysis running", complete: "Analysis complete", canceled: "Analysis canceled", failed: "Analysis failed", expired: "Analysis expired", queue_full: "The queue is full", waking: "Service waking up", outside: "Outside prepared coverage" };

export function GuidedPlanner() {
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<SearchRequest>(initialRequest);
  const [catalog, setCatalog] = useState<CoverageCatalog | null>(null);
  const [manifest, setManifest] = useState<RegionManifest | null>(null);
  const [terrain, setTerrain] = useState<TerrainData | null>(null);
  const [features, setFeatures] = useState<LunarFeature[]>([]);
  const [psr, setPsr] = useState<PSRLayer | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [coverageRefresh, setCoverageRefresh] = useState(0);
  const [coverage, setCoverage] = useState<CoverageOutcome | null>(null);
  const [coverageError, setCoverageError] = useState<string | null>(null);
  const [coveragePending, setCoveragePending] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [review, setReview] = useState(false);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [appliedCoverage, setAppliedCoverage] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [extraSite, setExtraSite] = useState<Candidate | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [pinned, setPinned] = useState<string[]>([]);
  const [modal, setModal] = useState<"site" | "compare" | "summary" | null>(null);
  const [library, setLibrary] = useState(false);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<{ phase: string; message: string; queue_position?: number } | null>(null);
  const [validation, setValidation] = useState<string[]>([]);
  const requestController = useRef<AbortController | null>(null);
  const inspectionController = useRef<AbortController | null>(null);
  const version = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const regionKey = canonical(draft.region);

  useEffect(() => {
    const abort = new AbortController(); setLoadError(null);
    Promise.all([getCoverage(abort.signal), getRegionManifest(abort.signal)]).then(([next, info]) => {
      if (abort.signal.aborted) return;
      if (!next.verified) throw new Error("The service has not verified scientific coverage.");
      setCatalog(next); setManifest(info);
    }).catch(reason => { if (!abort.signal.aborted) setLoadError(reason.message); });
    getTerrain(abort.signal).then(next => { if (!abort.signal.aborted) setTerrain(next); }).catch(() => {});
    getFeatures(abort.signal).then(next => { if (!abort.signal.aborted) setFeatures(next.features); }).catch(() => {});
    getPSRLayer(abort.signal).then(next => { if (!abort.signal.aborted) setPsr(next); }).catch(() => {});
    return () => abort.abort();
  }, [refresh]);
  useEffect(() => () => { requestController.current?.abort(); inspectionController.current?.abort(); version.current++; }, []);
  useEffect(() => { heading.current?.focus(); }, [step, review]);
  useEffect(() => {
    if (!catalog) return;
    const abort = new AbortController(); setCoverage(null); setCoverageError(null); setCoveragePending(true); setAcknowledged(false);
    const timer = setTimeout(() => {
      previewCoverage(JSON.parse(regionKey), abort.signal).then(next => {
        if (!abort.signal.aborted) { setCoverage(next); setCoveragePending(false); }
      }).catch(reason => { if (!abort.signal.aborted) { setCoverageError(reason.message); setCoveragePending(false); } });
    }, 180);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [catalog, regionKey, coverageRefresh]);

  const stale = !!result && canonical(draft) !== canonical(result.request);
  const areaReady = !!catalog && !coveragePending && coverage && coverage.status !== "outside" && (coverage.status !== "partial" || acknowledged);
  const site = result?.candidates.find(item => item.id === selected) ?? extraSite;
  function update(request: SearchRequest) {
    if (busy) { version.current++; requestController.current?.abort(); setBusy(false); setState({ phase: "canceled", message: "The request was canceled because its inputs changed. Your previous applied results are retained." }); }
    setDraft(structuredClone(request)); setReview(false); setValidation([]);
  }
  function go(next: number) { setStep(next); setReview(false); setValidation([]); }
  function reviewMission() {
    if (!catalog || !areaReady) { setValidation(["Return to Choose an area and verify coverage before submitting."]); return; }
    const errors = publicLimitErrors(draft, catalog);
    if (Date.parse(draft.time_range.start_utc) < Date.parse(manifest?.valid_time_range.start_utc ?? "2025-01-01") || Date.parse(draft.time_range.end_utc) > Date.parse(manifest?.valid_time_range.end_utc ?? "2036-01-01")) errors.push("Choose dates within the backend-advertised ephemeris range.");
    if (!catalog.layers.psr_distance && draft.hard_constraints.maximum_distance_to_psr_km != null) errors.push("The applied PSR-distance requirement is unavailable. Remove it explicitly under Advanced or load a dataset with that layer.");
    setValidation(errors); if (!errors.length) setReview(true);
  }
  async function run() {
    if (!catalog || !coverage || !areaReady) { setValidation(["Recheck scientific coverage before analysis."]); return; }
    const errors = publicLimitErrors(draft, catalog); if (errors.length) { setValidation(errors); setReview(false); return; }
    requestController.current?.abort(); inspectionController.current?.abort();
    const abort = new AbortController(); requestController.current = abort;
    const current = ++version.current;
    const applied = structuredClone({ ...draft, region: coverage.region });
    const coverageText = `${catalog.label}; ${coverage.status === "partial" ? "acknowledged supported intersection only" : "supported selection"}; ${coverage.candidate_count.toLocaleString()} prepared candidate locations.`;
    setBusy(true); setStep(3); setModal(null); setValidation([]); setState({ phase: "submitting", message: "Submitting your applied mission…" });
    try {
      const next = await runAnalysis(applied, catalog, abort.signal, (progress: AnalysisState) => { if (current === version.current && !abort.signal.aborted) setState(progress); });
      if (abort.signal.aborted || current !== version.current) return;
      if (!next.counts.region) throw new PlanningError("This area has no supported candidate locations. Choose another area; this is not a successful empty search.", "outside", 422);
      setResult(next); setDraft(structuredClone(next.request)); setAppliedCoverage(coverageText);
      setSelected(next.candidates[0]?.id ?? null); setExtraSite(null); setPinned([]);
      setState({ phase: "complete", message: next.candidates.length ? "Your shortlist is ready. Inspect a site or select two for comparison." : "The supported area was analyzed, but no sites meet every required limit." });
    } catch (reason) {
      if (abort.signal.aborted || current !== version.current) return;
      setState({ phase: reason instanceof PlanningError ? reason.code : "failed", message: reason instanceof Error ? reason.message : "Analysis failed. Inputs are retained." });
    } finally { if (current === version.current && !abort.signal.aborted) setBusy(false); }
  }
  function cancel() {
    version.current++; requestController.current?.abort(); setBusy(false);
    setState({ phase: "canceled", message: "Cancellation requested. Your mission inputs and previous results are retained." });
  }
  async function inspect(id: string) {
    if (!result) return;
    inspectionController.current?.abort();
    const known = result.candidates.find(item => item.id === id);
    if (known) { setSelected(id); setExtraSite(null); setModal("site"); return; }
    const point = result.map_candidates?.find(item => item.id === id); if (!point) return;
    const abort = new AbortController(); inspectionController.current = abort; setInspecting(true);
    try {
      const detail = await getSiteAnalysis(id, result.request, abort.signal);
      if (abort.signal.aborted) return;
      setSelected(id); setExtraSite({ ...detail.site, rank: 0, score: point.score, criteria_scores: point.criteria_scores ?? { illumination: null, earth_visibility: null, terrain_safety: null, science_proximity: null }, metrics: detail.metrics, timeline: detail.timeline, horizon: detail.horizon }); setModal("site");
    } catch (reason) { if (!abort.signal.aborted) setState({ phase: "failed", message: reason instanceof Error ? reason.message : "Inspection unavailable." }); }
    finally { if (!abort.signal.aborted) setInspecting(false); }
  }
  return <div className="guided-planner" id="explorer">
    <header className="guide-intro"><div><span className="eyebrow">EXPLORE THE SOUTHERN HEMISPHERE</span><h1>A hemisphere of possibilities.</h1></div><span className="guide-data-badge">{catalog ? `${catalog.candidate_count.toLocaleString()} detailed polar locations` : "Connecting to scientific coverage"}</span></header>
    <nav className="guide-steps" aria-label="Planning stages">{["Choose an area", "Describe the mission", "Review sites"].map((label, index) => <button key={label} aria-current={step === index + 1 ? "step" : undefined} disabled={index === 1 ? !areaReady : index === 2 ? !result && !busy && !state : false} onClick={() => go(index + 1)}><span>0{index + 1}</span>{label}</button>)}</nav>
    {result && stale && <div className="changed-notice" role="status">Inputs edited. Existing results and exports belong to the previous applied mission. Review and submit your revised mission to replace them.</div>}
    {loadError && <div className="guide-error" role="alert"><h2>Service waking up or coverage unavailable</h2><p>{loadError}</p><p>Your inputs are retained.</p><button className="secondary-button" onClick={() => setRefresh(value => value + 1)}>Retry loading coverage</button></div>}
    {!catalog && !loadError && <p role="status">Loading the verified coverage catalog…</p>}
    {catalog && step === 1 && <section className="guide-stage"><h2 className="sr-only" tabIndex={-1} ref={heading}>Choose an area</h2>
      <VerifiedArea terrain={terrain} catalog={catalog} request={draft} features={features} outcome={coverage} pending={coveragePending} error={coverageError} onChange={update} onRetry={() => setCoverageRefresh(value => value + 1)} />
      {coverage?.status === "partial" && <label className="coverage-ack"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} />I understand only the supported intersection will be analyzed.</label>}
      {(draft.region.search_radius_km ?? 0) > catalog.public_limits.maximum_radius_km && draft.region.selector_type !== "full_supported_region" && <p className="guide-error">Live detailed areas have a maximum {catalog.public_limits.maximum_radius_km} km radius. Edit the radius or choose the full-region demo.</p>}
      <div className="guide-actions"><button hidden={coverage?.status === "outside"} className="primary-button" disabled={!areaReady || (draft.region.selector_type !== "full_supported_region" && (draft.region.search_radius_km ?? 0) > catalog.public_limits.maximum_radius_km)} onClick={() => { setDraft(current => ({ ...current, region: coverage!.region })); go(2); }}>Continue to mission</button></div>
    </section>}
    {catalog && step === 2 && <section className="guide-stage"><h2 tabIndex={-1} ref={heading}>{review ? "Review before analysis" : "Describe the mission"}</h2>
      {review ? <><dl className="review-facts"><div><dt>Area</dt><dd>{areaName(draft.region)}</dd></div><div><dt>Mission window</dt><dd>{draft.time_range.start_utc} to {draft.time_range.end_utc}</dd></div><div><dt>Priorities</dt><dd>{priorityName(draft)}</dd></div><div><dt>Effective scientific coverage</dt><dd>{catalog.label} · {coverage?.candidate_count.toLocaleString()} prepared locations · {coverage?.status === "partial" ? "supported intersection, acknowledged" : "supported selection"}</dd></div></dl><h3>Required limits</h3><ul>{appliedConstraints(draft).map(text => <li key={text}>{text}</li>)}</ul><p>Prototype geometric planning indicators. No landing-safety or RF-performance guarantee.</p><div className="guide-actions"><button className="secondary-button" onClick={() => setReview(false)}>Back to mission</button><button className="primary-button" onClick={() => void run()}>Find candidate sites</button></div></> : <><PlanningMission request={draft} catalog={catalog} features={features} onChange={update} /><details className="advanced-mission"><summary>Saved missions & imports</summary><p>Load a browser-local mission or import its JSON. Public limits and coverage will be checked again.</p><button className="secondary-button" onClick={() => setLibrary(true)}>Open mission library</button></details><div className="guide-actions"><button className="secondary-button" onClick={() => go(1)}>Back to area</button><button className="primary-button" onClick={reviewMission}>Review mission</button></div></>}
      {validation.length > 0 && <div className="guide-error" role="alert"><ul>{validation.map(text => <li key={text}>{text}</li>)}</ul></div>}
    </section>}
    {step === 3 && <section className="guide-stage"><h2 className="sr-only" tabIndex={-1} ref={heading}>Review sites</h2>
      {state && <div className={`analysis-status ${state.phase}`} role="status"><strong>{phases[state.phase as keyof typeof phases] ?? "Analysis update"}</strong><p>{state.message}</p>{state.queue_position != null && <p>Queue position reported by the service: {state.queue_position}.</p>}
        {busy && <SearchBudget />}{busy ? <button className="secondary-button" onClick={cancel}>Cancel analysis</button> : state.phase !== "complete" && <button className="secondary-button" onClick={() => { setStep(2); setReview(false); }}>Review and resubmit mission</button>}</div>}
      {result && <><div className="applied-mission"><div><span className="eyebrow">APPLIED MISSION</span><p>{areaName(result.request.region)} · {priorityName(result.request)}<br />{result.common_window.start_utc} to {result.common_window.end_utc}</p></div><div className="guide-actions"><button className="secondary-button" onClick={() => setModal("summary")}>Create mission summary</button><button className="text-button" onClick={() => downloadJson(result, `lumen-${result.search_id}.json`)}>Export scientific JSON</button></div></div>
        <CandidateResults key={result.search_id} result={result} selected={selected} pinned={pinned} onSelect={id => void inspect(id)} onPin={id => setPinned(current => current.includes(id) ? current.filter(value => value !== id) : current.length < 2 ? [...current, id] : current)} onCompare={() => setModal("compare")} />
      </>}
      <div className="guide-actions"><button className="secondary-button" onClick={() => go(2)}>Edit mission</button><button className="text-button" onClick={() => go(1)}>Choose another area</button></div>
    </section>}
    {inspecting && <p role="status">Loading this location’s evidence…</p>}
    {result && modal === "site" && site && <PlanningEvidence key={`${result.search_id}-${site.id}`} site={site} result={result} terrain={terrain} manifest={manifest} psr={psr} features={features} onExplore={id => void inspect(id)} stale={stale} onDelay={hours => { update(shiftWindow(result.request, hours)); setModal(null); go(2); }} onClose={() => setModal(null)} />}
    {result && modal === "compare" && <CompareDialog result={result} sites={result.candidates.filter(item => pinned.includes(item.id))} onClose={() => setModal(null)} />}
    {result && modal === "summary" && <MissionSummary result={result} sites={pinned.length ? result.candidates.filter(item => pinned.includes(item.id)) : site ? [site] : []} coverage={appliedCoverage} stale={stale} onClose={() => setModal(null)} />}
    {library && <MissionLibrary value={draft} scienceAvailable={!!catalog?.layers.psr_distance} onLoad={request => { update(request); go(1); }} onClose={() => setLibrary(false)} />}
    <footer className="guide-footer"><span>LUMEN / Comparative mission geometry</span><span>Hemisphere exploration · verified local planning.</span></footer>
  </div>;
}
