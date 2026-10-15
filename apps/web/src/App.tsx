import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { MissionForm } from "./components/MissionForm";
import { MissionBrief, MissionLibrary } from "./components/MissionStudio";
import { ScenarioLab } from "./components/ScenarioLab";
import { RefinedInspection } from "./components/RefinedInspection";
import { DEFAULT_REQUEST, shiftWindow } from "./lib/missions";
import { CandidateResults, Comparison } from "./components/CandidateResults";
import { SiteAnalysis } from "./components/SiteAnalysis";
import { SceneBoundary } from "./components/SceneBoundary";
import { Icon } from "./components/Icon";
import {
  getRegionManifest,
  getTerrain,
  getFeatures,
  getPSRLayer,
  getSiteAnalysis,
  searchCandidates,
} from "./lib/api";
import { downloadJson, utcDate } from "./lib/format";
import type {
  RegionManifest,
  SearchRequest,
  SearchResponse,
  TerrainData,
  LunarFeature,
  PSRLayer,
  MapLayer,
  Candidate,
  TimeSample,
} from "./lib/types";

const TerrainScene = lazy(() =>
  import("./components/TerrainScene").then((m) => ({
    default: m.TerrainScene,
  })),
);
const GlobeScene = lazy(() =>
  import("./components/GlobeScene").then((m) => ({ default: m.GlobeScene })),
);

const SkyScene = lazy(() =>
  import("./components/SkyScene").then((module) => ({
    default: module.SkyScene,
  })),
);

function Methods({
  manifest,
  result,
  onClose,
}: {
  manifest: RegionManifest | null;
  result: SearchResponse | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      className="methods-dialog"
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby="methods-title"
    >
      <div className="section-heading">
        <div>
          <span className="eyebrow">DATA & METHODS</span>
          <h2 id="methods-title">Know what you’re comparing.</h2>
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close data and methods"
        >
          <Icon name="close" />
        </button>
      </div>
      <p>
        Lumen is a prototype for comparing lunar surface locations under a
        common mission window. The current dataset is a{" "}
        <strong>20 × 20 km square around the south pole</strong>. The wider
        87°S–90°S cap is planned coverage.
      </p>
      <div className="methods-facts">
        <div>
          <strong>80 m</strong>
          <span>Source terrain</span>
        </div>
        <div>
          <strong>500 m</strong>
          <span>Candidate spacing</span>
        </div>
        <div>
          <strong>2 m</strong>
          <span>Observer height</span>
        </div>
        <div>
          <strong>5 min</strong>
          <span>Time step</span>
        </div>
        <div>
          <strong>5°</strong>
          <span>Horizon azimuth bins</span>
        </div>
        <div>
          <strong>200 km</strong>
          <span>Horizon range</span>
        </div>
      </div>
      <h3>Terrain, frames, and geometry</h3>
      <p>
        Terrain comes from{" "}
        <a
          href="https://pgda.gsfc.nasa.gov/products/90"
          target="_blank"
          rel="noreferrer"
        >
          NASA PGDA’s south-pole LOLA products
        </a>
        . Slope and roughness use published 100 m baseline products on a{" "}
        <strong>1 km output grid</strong>. The display is resampled to 250 m and
        vertically exaggerated 1.5×; its lighting illustrates the terrain and
        does not predict shadows.
      </p>
      <p>
        <a
          href="https://naif.jpl.nasa.gov/naif/data_generic.html"
          target="_blank"
          rel="noreferrer"
        >
          JPL NAIF / DE440 kernels
        </a>{" "}
        supply date-specific Sun and Earth vectors in{" "}
        <code>MOON_ME_DE440_ME421</code>. Lunar curvature and a 1,737.4 km
        reference sphere are included. Sunlight availability measures time with
        any solar upper limb visible; the mean visible solar-disk fraction is
        reported separately. Earth visibility uses the outgoing Earth-center
        direction. Neither models power production or an RF link budget.
      </p>
      <p>
        PSR proximity uses the mapped 20 m NASA shadow mask, shown as 200 m area
        fractions. Approved feature centers come from the IAU/USGS gazetteer;
        center distances are approximate context, not distances to geological
        rims.
      </p>
      <h3>How the ranking works</h3>
      <p>
        Hard constraints remove candidates first. Sunlight and Earth utilities
        each combine the available fraction (50%), longest continuous
        opportunity (25%), and inverse longest interruption (25%), normalized by
        the mission duration. Terrain combines slope (45%), roughness (35%), and
        higher elevation (20%) using fixed study-area reference bounds. User
        weights combine the utilities into a comparative 0–100 indicator.
        Science utility uses fixed 10 km PSR and 50 km feature-center distance
        bounds, combined 60% / 40% when a feature is selected.
      </p>
      <h3>Limits to keep in view</h3>
      <ul>
        <li>
          The 5° horizon rays and 80 / 320 m radial samples can miss narrow
          ridges. Terrain beyond 200 km is not modeled.
        </li>
        <li>
          Search metrics use five-minute samples. The site inspector bisects
          detected state transitions to at most 60 seconds; short grazing events
          can still be missed.
        </li>
        <li>
          DEM error masks and 5 m detail tiles remain unavailable. Scenario
          tests compare a 2.5-minute time grid and nearby 500 m candidate
          locations; they do not establish a formal confidence bound.
        </li>
        <li>
          Earth line of sight does not account for antennas, ground stations,
          link margin, or relays.
        </li>
      </ul>
      <p className="methods-disclaimer">
        Comparative planning indicators only. This tool does not certify landing
        safety or communications coverage.
      </p>
      <p className="small muted">
        Terrain: Barker et al. (2023), Planetary Science Journal 4, 183. Context
        Moon model: NASA’s Goddard Space Flight Center / LRO,{" "}
        <a
          href="https://svs.gsfc.nasa.gov/14959/"
          target="_blank"
          rel="noreferrer"
        >
          SVS 14959
        </a>
        . No NASA endorsement is implied.
      </p>
      <div className="dialog-actions">
        <button
          className="secondary-button"
          disabled={!manifest}
          onClick={() => downloadJson(manifest, "lumen-dataset-manifest.json")}
        >
          <Icon name="download" size={15} />
          Dataset manifest
        </button>
        <button
          className="secondary-button"
          disabled={!result}
          onClick={() =>
            downloadJson(result, `lumen-${result?.search_id}.json`)
          }
        >
          <Icon name="download" size={15} />
          Reproducibility report
        </button>
      </div>
    </dialog>
  );
}

export default function App() {
  const [draft, setDraft] = useState<SearchRequest>(() =>
    structuredClone(DEFAULT_REQUEST),
  );
  const [features, setFeatures] = useState<LunarFeature[]>([]);
  const [psr, setPSR] = useState<PSRLayer | null>(null);
  const [library, setLibrary] = useState(false);
  const [skySample, setSkySample] = useState<TimeSample | null>(null);
  const [exploredSite, setExploredSite] = useState<Candidate | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const inspectController = useRef<AbortController | null>(null);
  const [manifest, setManifest] = useState<RegionManifest | null>(null);
  const [terrain, setTerrain] = useState<TerrainData | null>(null);
  const [initialError, setInitialError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [methods, setMethods] = useState(false);
  const [comparison, setComparison] = useState(false);
  const [view, setView] = useState<"terrain" | "map" | "globe" | "sky">(
    "terrain",
  );
  const [layer, setLayer] = useState<MapLayer>("terrain");
  const [elapsed, setElapsed] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const comparisonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const abort = new AbortController();
    Promise.all([getRegionManifest(abort.signal), getTerrain(abort.signal)])
      .then(([m, t]) => {
        setManifest(m);
        setTerrain(t);
      })
      .catch((reason: unknown) => {
        if (!abort.signal.aborted)
          setInitialError(
            reason instanceof Error
              ? reason.message
              : "Analysis service unavailable.",
          );
      });
    getFeatures(abort.signal)
      .then((collection) => setFeatures(collection.features))
      .catch(() => undefined);
    getPSRLayer(abort.signal)
      .then(setPSR)
      .catch(() => undefined);
    return () => {
      abort.abort();
      inspectController.current?.abort();
      controller.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!loading) return;
    const timer = setInterval(() => setElapsed((current) => current + 1), 1000);
    return () => clearInterval(timer);
  }, [loading]);

  async function runSearch(request: SearchRequest) {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setLoading(true);
    setElapsed(0);
    setError(null);
    // A previous shortlist belongs to its original request and must never be mixed with a rerun.
    setResult(null);
    setExploredSite(null);
    setSkySample(null);
    inspectController.current?.abort();
    setSelected(null);
    setPinned([]);
    setComparison(false);
    setDirty(false);
    try {
      const response = await searchCandidates(request, abort.signal);
      if (abort.signal.aborted) return;
      setResult(response);
      setSelected(response.candidates[0]?.id ?? null);
      setPinned(response.candidates.slice(0, 2).map((site) => site.id));
    } catch (reason) {
      if (!abort.signal.aborted)
        setError(
          reason instanceof Error
            ? reason.message
            : "Search failed. Please try again.",
        );
    } finally {
      if (!abort.signal.aborted) setLoading(false);
    }
  }

  function showComparison() {
    setComparison(true);
    setTimeout(
      () =>
        comparisonRef.current?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "instant"
            : "smooth",
          block: "start",
        }),
      50,
    );
  }
  function updateDraft(request: SearchRequest) {
    setDraft(structuredClone(request));
    if (result || loading) setDirty(true);
  }
  async function selectLocation(id: string) {
    if (!result) return;
    inspectController.current?.abort();
    if (result.candidates.some((candidate) => candidate.id === id)) {
      setExploredSite(null);
      setSelected(id);
      setInspecting(false);
      return;
    }
    const point = result.map_candidates?.find(
      (candidate) => candidate.id === id,
    );
    if (!point) return;
    const abort = new AbortController();
    inspectController.current = abort;
    setInspecting(true);
    try {
      const detail = await getSiteAnalysis(id, result.request, abort.signal);
      if (abort.signal.aborted) return;
      setExploredSite({
        ...detail.site,
        rank: 0,
        score: point.score,
        criteria_scores: point.criteria_scores ?? {
          illumination: null,
          earth_visibility: null,
          terrain_safety: null,
          science_proximity: null,
        },
        metrics: detail.metrics,
        timeline: detail.timeline,
        horizon: detail.horizon,
      });
      setSelected(id);
    } catch (reason) {
      if (!abort.signal.aborted)
        setError(
          reason instanceof Error
            ? reason.message
            : "Could not inspect this location.",
        );
    } finally {
      if (!abort.signal.aborted) setInspecting(false);
    }
  }
  const site =
    result?.candidates.find((candidate) => candidate.id === selected) ??
    (exploredSite?.id === selected ? exploredSite : undefined);
  const count =
    typeof manifest?.prepared_candidate_count === "number"
      ? manifest.prepared_candidate_count
      : null;

  return (
    <main id="top">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Lumen home">
          <img src="/lumen-mark.svg" alt="" />
          <span>
            LUMEN
            <span className="brand-caption">LUNAR EXPLORATION PLANNER</span>
          </span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#explorer" className="nav-link active">
            Explore
          </a>
          <button
            className="nav-link"
            onClick={showComparison}
            disabled={!result}
          >
            Compare<span className="nav-count">{pinned.length}</span>
          </button>
          <button className="nav-link" onClick={() => setLibrary(true)}>
            Missions
          </button>
          <button className="nav-link" onClick={() => setMethods(true)}>
            Data & methods
            <Icon name="info" size={14} />
          </button>
        </nav>
        <span className="prototype-badge">
          <span className="status-dot" />
          RESEARCH PROTOTYPE
        </span>
      </header>
      <div className="workspace" id="explorer">
        <MissionForm
          loading={loading}
          onSearch={runSearch}
          value={draft}
          onDraftChange={updateDraft}
          features={features}
          scienceAvailable={psr !== null}
        />
        <div className="main-workspace">
          <section className="workspace-intro">
            <div>
              <div className="breadcrumb">
                <span>MOON</span>
                <span>/</span>
                <span>SOUTH POLAR REGION</span>
              </div>
              <h1>A clearer view of the next frontier.</h1>
              <p>
                Explore how terrain, sunlight, and Earth visibility shape a
                mission.
              </p>
            </div>
            <div className="dataset-status">
              <span className={`status-dot ${terrain ? "" : "pending"}`} />
              {terrain
                ? "NASA terrain · prepared locally"
                : "Connecting to analysis service"}
              <span>
                {count != null
                  ? `${count.toLocaleString()} candidate locations`
                  : "20 × 20 km study area"}
              </span>
            </div>
          </section>
          <MissionBrief
            value={draft}
            features={features}
            onApply={updateDraft}
          />
          {initialError && (
            <div className="error-box" role="alert">
              <strong>Data preparation or service connection required.</strong>
              <p>{initialError}</p>
              <button
                className="text-button"
                onClick={() => window.location.reload()}
              >
                Retry connection <Icon name="reset" size={14} />
              </button>
            </div>
          )}
          <section className="map-section" aria-label="Lunar terrain explorer">
            <div className="map-toolbar">
              <div className="view-tabs" role="group" aria-label="Map view">
                <button
                  aria-pressed={view === "terrain"}
                  className={view === "terrain" ? "active" : ""}
                  onClick={() => setView("terrain")}
                >
                  <Icon name="terrain" size={15} />
                  3D terrain
                </button>
                <button
                  aria-pressed={view === "map"}
                  className={view === "map" ? "active" : ""}
                  onClick={() => setView("map")}
                >
                  2D map
                </button>
                <button
                  aria-pressed={view === "globe"}
                  className={view === "globe" ? "active" : ""}
                  onClick={() => setView("globe")}
                >
                  <Icon name="earth" size={15} />
                  Moon context
                </button>
                <button
                  aria-pressed={view === "sky"}
                  className={view === "sky" ? "active" : ""}
                  disabled={!site}
                  onClick={() => setView("sky")}
                >
                  <Icon name="sun" size={15} />
                  Local sky
                </button>
              </div>
              <label className="map-layer-select">
                <Icon name="layers" size={15} />
                <span className="sr-only">Map layer</span>
                <select
                  aria-label="Map layer"
                  value={layer}
                  disabled={view === "globe" || view === "sky"}
                  onChange={(e) => setLayer(e.target.value as MapLayer)}
                >
                  <option value="terrain">Terrain relief</option>
                  <option value="elevation">Elevation</option>
                  <option value="score" disabled={!result}>
                    Planning score · points
                  </option>
                  <option value="illumination" disabled={!result}>
                    Sunlight availability · points
                  </option>
                  <option value="earth_visibility" disabled={!result}>
                    Earth visibility · points
                  </option>
                  <option value="psr" disabled={!psr}>
                    Mapped PSR area
                  </option>
                </select>
              </label>
            </div>
            <div className="map-canvas">
              <Suspense
                fallback={
                  <div className="scene-empty">
                    <span className="spinner" />
                    Loading lunar terrain…
                  </div>
                }
              >
                {view === "sky" ? (
                  site && (skySample ?? site.timeline[0]) ? (
                    <SceneBoundary
                      fallback={
                        <div className="scene-empty">
                          Use the local horizon chart below for the same
                          geometry.
                        </div>
                      }
                    >
                      <SkyScene
                        site={site}
                        sample={skySample ?? site.timeline[0]}
                      />
                    </SceneBoundary>
                  ) : (
                    <div className="scene-empty">
                      Run a search and select a site to explore its local sky.
                    </div>
                  )
                ) : view === "globe" ? (
                  <SceneBoundary
                    fallback={
                      <div className="scene-empty">
                        Moon context could not load. Use the terrain or 2D map
                        view.
                      </div>
                    }
                  >
                    <GlobeScene />
                  </SceneBoundary>
                ) : terrain ? (
                  <TerrainScene
                    terrain={terrain}
                    candidates={result?.candidates ?? []}
                    selected={selected}
                    onSelect={(id) => void selectLocation(id)}
                    mode={view}
                    layer={layer}
                    mapCandidates={result?.map_candidates ?? []}
                    psr={psr}
                    features={features}
                  />
                ) : (
                  <div className="scene-empty">
                    <Icon name="terrain" size={40} />
                    <p>
                      {initialError
                        ? "Terrain is not available yet."
                        : "Loading prepared NASA terrain…"}
                    </p>
                  </div>
                )}
              </Suspense>
              {view !== "globe" && view !== "sky" && (
                <>
                  <div className="map-location">
                    <span className="eyebrow">SOUTH POLE STUDY AREA</span>
                    <h3>At the edge of light.</h3>
                    <span>20 × 20 km · polar stereographic</span>
                  </div>
                  <div className="map-compass">
                    <Icon name="compass" size={35} />
                    <span>+Y · 0°E</span>
                  </div>
                  {view === "terrain" && (
                    <div className="map-scale">
                      <strong>2 km ground grid</strong>
                      <small>Perspective view · projected distances</small>
                    </div>
                  )}
                  <div className="map-footnote">
                    {view === "terrain"
                      ? "Drag to orbit · scroll to zoom · height 1.5× · illustrative lighting"
                      : "Height-colored terrain · click a numbered candidate"}
                  </div>
                  {result && (
                    <div className="map-result-key">
                      <span className="status-dot" />
                      Ranked candidate locations
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="coverage-strip">
              <Icon name="info" size={14} />
              <span>
                <strong>Prepared coverage: 20 × 20 km.</strong> Full 87°S–90°S
                analysis is planned. Terrain indicators describe relative
                trade-offs.
              </span>
              <button onClick={() => setMethods(true)}>
                View assumptions
                <Icon name="arrow" size={13} />
              </button>
            </div>
          </section>
          {view !== "globe" && view !== "sky" && (
            <div className="map-legend">
              <span>
                {layer === "psr"
                  ? "Mapped PSR fraction · 200 m display cells from 20 m source"
                  : layer === "terrain" || layer === "elevation"
                    ? "Display heights resampled to 250 m"
                    : "Each point is a computed eligible candidate; click to inspect"}
              </span>
              {!["terrain", "elevation", "psr"].includes(layer) && (
                <span className={`legend-ramp ${layer}`}>
                  <i />0 → 100{layer === "score" ? " points" : "%"}
                </span>
              )}
            </div>
          )}
          {inspecting && (
            <p className="success-note" role="status">
              Loading this location’s timeline and terrain horizon…
            </p>
          )}
          <div className="search-state" aria-live="polite" aria-atomic="true">
            {loading ? (
              <div className="loading-analysis">
                <span className="spinner" />
                <div>
                  <strong>
                    Tracing the Sun and Earth across local horizons.
                  </strong>
                  <span>
                    Applying hard constraints, then ranking eligible locations.{" "}
                    {elapsed}s elapsed.
                  </span>
                </div>
              </div>
            ) : error ? (
              <div className="error-box" role="alert">
                {error}
              </div>
            ) : dirty && result ? (
              <div className="changed-notice">
                <Icon name="info" size={16} />
                Parameters changed. Run a new search to update these results.
              </div>
            ) : null}
          </div>
          {result ? (
            <>
              <div className="result-meta">
                <span>
                  <span className="status-dot" />
                  {utcDate(result.common_window.start_utc)} –{" "}
                  {utcDate(result.common_window.end_utc)}{" "}
                  <span className="muted">UTC · one common mission window</span>
                </span>
                <button
                  className="text-button"
                  onClick={() =>
                    downloadJson(result, `lumen-${result.search_id}.json`)
                  }
                >
                  <Icon name="download" size={15} />
                  Export analysis
                </button>
              </div>
              <nav className="analysis-nav" aria-label="Analysis sections">
                <a href="#results-title">Shortlist</a>
                <a href="#analysis-title">Site insights</a>
                <a href="#refined-title">Events & blockers</a>
                <a href="#scenario-lab-title">Scenario lab</a>
                <button onClick={showComparison}>Comparison</button>
              </nav>
              <CandidateResults
                result={result}
                selected={selected}
                pinned={pinned}
                onSelect={(id) => void selectLocation(id)}
                onPin={(id) =>
                  setPinned((current) =>
                    current.includes(id)
                      ? current.filter((item) => item !== id)
                      : current.length < 2
                        ? [...current, id]
                        : current,
                  )
                }
                onCompare={showComparison}
              />
              {site && (
                <>
                  <SiteAnalysis
                    key={`${result.search_id}-${site.id}`}
                    site={site}
                    result={result}
                    onSampleChange={setSkySample}
                  />
                  <RefinedInspection
                    key={`refined-${result.search_id}-${site.id}`}
                    site={site}
                    result={result}
                  />
                  <ScenarioLab
                    key={`scenario-${result.search_id}-${site.id}`}
                    site={site}
                    result={result}
                    onApplyDelay={(hours) =>
                      updateDraft(shiftWindow(result.request, hours))
                    }
                  />
                </>
              )}
              {comparison && (
                <div ref={comparisonRef} className="scroll-target">
                  <Comparison
                    sites={result.candidates.filter((candidate) =>
                      pinned.includes(candidate.id),
                    )}
                    result={result}
                    onClose={() => setComparison(false)}
                  />
                </div>
              )}
              <details className="run-notes">
                <summary>
                  Analysis assumptions & limitations{" "}
                  <span>
                    {result.warnings.length + result.assumptions.length} notes
                  </span>
                </summary>
                <ul>
                  {[
                    ...new Set([...result.assumptions, ...result.warnings]),
                  ].map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
                <button
                  className="text-button"
                  onClick={() => setMethods(true)}
                >
                  Data, scoring, and provenance
                  <Icon name="arrow" size={14} />
                </button>
              </details>
            </>
          ) : !loading && !error ? (
            <section className="welcome-panel">
              <div className="welcome-icon">
                <Icon name="compass" size={28} />
              </div>
              <div>
                <span className="eyebrow">FROM GEOGRAPHY TO TRADE-OFFS</span>
                <h2>Your mission. A transparent shortlist.</h2>
                <p>
                  Set the mission window and priorities, then find candidate
                  sites. Inspect the horizon, follow the timeline, and compare
                  the differences.
                </p>
              </div>
              <div className="welcome-metrics">
                <span>
                  <Icon name="sun" />
                  Sunlight
                </span>
                <span>
                  <Icon name="earth" />
                  Earth visibility
                </span>
                <span>
                  <Icon name="terrain" />
                  Terrain
                </span>
              </div>
            </section>
          ) : null}
          <footer>
            <span>
              LUMEN <span className="footer-divider">/</span> An early view of
              possible places.
            </span>
            <span>
              Planning indicators only · No landing-safety or RF certification
            </span>
            <button className="text-button" onClick={() => setMethods(true)}>
              Sources & limits
              <Icon name="arrow" size={12} />
            </button>
          </footer>
        </div>
      </div>
      {library && (
        <MissionLibrary
          value={draft}
          scienceAvailable={psr !== null}
          onLoad={updateDraft}
          onClose={() => setLibrary(false)}
        />
      )}
      {methods && (
        <Methods
          manifest={manifest}
          result={result}
          onClose={() => setMethods(false)}
        />
      )}
    </main>
  );
}
