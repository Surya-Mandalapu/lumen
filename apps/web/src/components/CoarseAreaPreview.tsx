import { useEffect, useRef, useState } from "react";
import { withinSearchDeadline } from "../lib/deadline";
import { coordinateLabel, southernCoordinate } from "../lib/hemisphere";
import type { LunarCoordinate } from "../lib/hemisphere";
import { downloadJson } from "../lib/format";
import { SiteLocations } from "./SiteLocations";
import type { SceneSite } from "../lib/scene-geometry";
import { SearchBudget } from "./SearchBudget";

type Preview = { coordinate: LunarCoordinate; elevation_m: number; metrics: { illumination_fraction: number; earth_visibility_fraction: number }; warnings: string[]; time_range: { start_utc: string; end_utc: string } };
type AreaRanking = { sites: (SceneSite & { metrics: Preview["metrics"] })[]; candidate_count: number; time_range: Preview["time_range"]; warnings: string[]; request: { sunlight_weight: number; radius_km: number } };
const API = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

export function CoarseAreaPreview({ center, radiusKm = 3 }: { center: LunarCoordinate; radiusKm?: number }) {
  const [start, setStart] = useState("2028-10-01");
  const [days, setDays] = useState(7);
  const [sunWeight, setSunWeight] = useState(.5), [ranking, setRanking] = useState<AreaRanking | null>(null), [mapOpen, setMapOpen] = useState(false);
  const rankedKey = useRef("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Preview | null>(null);
  const [comparison, setComparison] = useState<Preview | null>(null);
  const controller = useRef<AbortController | null>(null);
  const key = `${center.latitude_deg},${center.longitude_deg_east},${start},${days},${radiusKm},${sunWeight}`;
  const applied = useRef("");
  useEffect(() => { controller.current?.abort(); setBusy(false); setError(""); return () => controller.current?.abort(); }, [key]);
  async function preview() {
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setError("");
    try {
      const startUtc = new Date(`${start}T00:00:00Z`);
      const next = await withinSearchDeadline(abort.signal, async signal => {
        const response = await fetch(`${API}/global/preview`, { method: "POST", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ coordinate: center, time_range: { start_utc: startUtc.toISOString(), end_utc: new Date(startUtc.getTime() + days * 86400000).toISOString() } }) });
        const body = await response.json();
        if (!response.ok) throw new Error(typeof body.detail === "string" ? body.detail : body.detail?.message ?? "Preview unavailable. Retry shortly.");
        return body as Preview;
      });
      if (!abort.signal.aborted) { applied.current = key; setResult(next); }
    } catch (reason) { if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : "Preview unavailable."); }
    finally { if (!abort.signal.aborted) setBusy(false); }
  }
  async function rankArea() {
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort; setBusy(true); setError("");
    try {
      const startUtc = new Date(`${start}T00:00:00Z`);
      const next = await withinSearchDeadline(abort.signal, async signal => {
        const response = await fetch(`${API}/global/rank-area`, { method: "POST", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ coordinate: center, radius_km: radiusKm, sunlight_weight: sunWeight, time_range: { start_utc: startUtc.toISOString(), end_utc: new Date(startUtc.getTime() + days * 86400000).toISOString() } }) });
        const body = await response.json();
        if (!response.ok) throw new Error(typeof body.detail === "string" ? body.detail : body.detail?.message ?? "Area ranking unavailable. Check the radius and dates.");
        return body as AreaRanking;
      });
      if (!abort.signal.aborted) { rankedKey.current = key; setRanking(next); }
    } catch (reason) { if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : "Area ranking unavailable."); }
    finally { if (!abort.signal.aborted) setBusy(false); }
  }
  return <section className="coarse-area-preview" aria-label="Local area ranking and point preview">
    <span className="eyebrow">COARSE PREVIEW AVAILABLE</span><h3>Explore this local area.</h3><p>Rank sampled locations inside your {radiusKm} km circle by sunlight and Earth visibility. Detailed terrain and mission-constraint rankings remain available in the prepared polar region.</p>
    <div className="guide-fields"><label className="field">Mission start (UTC)<input type="date" min="2025-01-01" max="2035-12-24" value={start} onChange={event => setStart(event.target.value)} /></label><label className="field">Duration<select value={days} onChange={event => setDays(Number(event.target.value))}><option value={1}>1 day</option><option value={3}>3 days</option><option value={7}>7 days</option></select></label></div>
    <label className="field">Coarse ranking priority<select aria-label="Coarse ranking priority" value={sunWeight} onChange={event => setSunWeight(Number(event.target.value))}><option value={.5}>Balanced sunlight & Earth view</option><option value={1}>Sunlight only</option><option value={0}>Earth visibility only</option></select></label>
    <div className="guide-actions"><button className="primary-button" disabled={busy || !start || radiusKm < 1 || radiusKm > 5 || !southernCoordinate(center)} onClick={() => void rankArea()}>Rank this area</button><button className="secondary-button" disabled={busy || !start || !southernCoordinate(center)} onClick={() => void preview()}>{busy ? "Calculating…" : "Preview this point"}</button>{busy && <button className="secondary-button" onClick={() => { controller.current?.abort(); setBusy(false); }}>Cancel preview</button>}</div>
    {busy && <SearchBudget />}
    {error && <p className="guide-error" role="alert">{error}</p>}
    {ranking && <div className="coarse-area-ranking" aria-live="polite">{rankedKey.current !== key && <p className="changed-notice">Area, dates or priorities changed. This ranking belongs to the previous applied selection.</p>}<h4>{ranking.candidate_count} local locations ranked</h4><p className="field-hint">{ranking.request.radius_km} km radius · {ranking.time_range.start_utc.slice(0, 10)} to {ranking.time_range.end_utc.slice(0, 10)} · {Math.round(ranking.request.sunlight_weight * 100)}% sunlight / {Math.round((1 - ranking.request.sunlight_weight) * 100)}% Earth view</p><ol>{ranking.sites.slice(0, 3).map(site => <li key={site.id}>{coordinateLabel(site)} · score {site.score.toFixed(1)} · Sun {(site.metrics.illumination_fraction * 100).toFixed(1)}% · Earth {(site.metrics.earth_visibility_fraction * 100).toFixed(1)}%</li>)}</ol><button className="secondary-button" onClick={() => setMapOpen(true)}>View all {ranking.sites.length} locations in 3D</button><button className="text-button" onClick={() => downloadJson(ranking, "lumen-local-coarse-ranking.json")}>Export area ranking</button><details><summary>Ranking coverage & limits</summary><ul>{ranking.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></details></div>}
    {mapOpen && ranking && <SiteLocations coarse sites={ranking.sites.map(site => ({ ...site, illumination_fraction: site.metrics.illumination_fraction, earth_visibility_fraction: site.metrics.earth_visibility_fraction }))} dates={ranking.time_range} onClose={() => setMapOpen(false)} />}
    {result && <div className="coarse-preview-result" aria-live="polite">{applied.current !== key && <p className="changed-notice">Selection changed. Results below belong to the previous point and dates.</p>}<h4>{coordinateLabel(result.coordinate)}</h4><p className="field-hint">{result.time_range.start_utc.slice(0, 10)} → {result.time_range.end_utc.slice(0, 10)} · UTC</p><PreviewMetrics preview={result} />
      <div className="guide-actions"><button className="secondary-button" onClick={() => setComparison(result)}>Keep for comparison</button><button className="text-button" onClick={() => downloadJson(result, "lumen-hemisphere-preview.json")}>Export preview</button></div>
      {comparison && <div className="coarse-comparison"><h4>Kept point · {coordinateLabel(comparison.coordinate)}</h4><p className="field-hint">{comparison.time_range.start_utc.slice(0, 10)} → {comparison.time_range.end_utc.slice(0, 10)} · UTC. Compare like dates; these are point previews, not area rankings.</p><PreviewMetrics preview={comparison} /><button className="text-button" onClick={() => setComparison(null)}>Clear comparison</button></div>}
      <details><summary>Why this is a preview</summary><ul>{result.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></details>
    </div>}
    <p className="field-hint">Global LOLA terrain · about 1.9 km north–south grid spacing. Nearby obstacles and small craters may be missed. Point preview samples only the center. Area ranking uses a 2 km lattice inside the circle; radii below 2 km may yield only the center. Equal scores are ties; numbering adds no evidence. Coarse ranking does not screen mission hard constraints or assess landing suitability.</p>
  </section>;
}
function PreviewMetrics({ preview }: { preview: Preview }) {
  return <dl className="preview-metrics"><div><dt>Sun visible</dt><dd>{(preview.metrics.illumination_fraction * 100).toFixed(1)}%</dd></div><div><dt>Earth in view</dt><dd>{(preview.metrics.earth_visibility_fraction * 100).toFixed(1)}%</dd></div><div><dt>Elevation</dt><dd>{Math.round(preview.elevation_m).toLocaleString()} m</dd></div></dl>;
}
