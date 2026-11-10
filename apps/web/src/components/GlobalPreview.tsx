import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { TerrainData, TimeSample } from "../lib/types";
import { downloadJson } from "../lib/format";
import "./global-preview.css";

const TerrainScene = lazy(() => import("./TerrainScene").then(m => ({ default: m.TerrainScene })));
type Overview = { width: number; height: number; elevations_m: number[] };
type Preview = {
  coordinate: { latitude_deg: number; longitude_deg_east: number };
  elevation_m: number;
  metrics: Record<string, number>;
  timeline: TimeSample[];
  terrain: TerrainData;
  warnings: string[];
};
const API = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

function visibilitySegments(samples: TimeSample[], key: "sun_visible" | "earth_visible") {
  if (samples.length < 2) return [];
  const first = Date.parse(samples[0].time_utc);
  const duration = Date.parse(samples[samples.length - 1].time_utc) - first;
  const segments: { x: number; width: number; visible: boolean }[] = [];
  let start = 0;
  for (let i = 1; i < samples.length; i++) {
    if (i === samples.length - 1 || samples[i][key] !== samples[start][key]) {
      const x = (Date.parse(samples[start].time_utc) - first) / duration * 1000;
      const end = (Date.parse(samples[i].time_utc) - first) / duration * 1000;
      segments.push({ x, width: end - x, visible: samples[start][key] });
      start = i;
    }
  }
  return segments;
}

async function json<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new Error(typeof body.detail === "string" ? body.detail : "Preview unavailable. Check the coordinates and dates.");
  return body as T;
}

function PointMap({ data, latitude, longitude, onSelect }: {
  data: Overview; latitude: number; longitude: number;
  onSelect: (latitude: number, longitude: number) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const image = ctx.createImageData(data.width, data.height);
    data.elevations_m.forEach((height, i) => {
      const value = Math.max(25, Math.min(215, 115 + height / 65));
      image.data.set([value * .86, value, value * .96, 255], i * 4);
    });
    ctx.putImageData(image, 0, 0);
  }, [data]);
  return <div className="global-map">
    <canvas ref={canvas} width={data.width} height={data.height}
      aria-label="Global NASA lunar elevation map. Enter coordinates below or click to select a point."
      onClick={event => {
        const bounds = event.currentTarget.getBoundingClientRect();
        const longitude = Math.max(-180, Math.min(179.999999, (event.clientX - bounds.left) / bounds.width * 360 - 180));
        const latitude = Math.max(-90, Math.min(90, 90 - (event.clientY - bounds.top) / bounds.height * 180));
        onSelect(Number(latitude.toFixed(4)), Number(longitude.toFixed(4)));
      }} />
    <span className="global-map-marker" style={{ left: `${(longitude + 180) / 360 * 100}%`, top: `${(90 - latitude) / 180 * 100}%` }} aria-hidden="true">+</span>
    <span className="global-map-north">90°N</span><span className="global-map-south">90°S</span>
  </div>;
}

export function GlobalPreview() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [latitude, setLatitude] = useState(0.6741);
  const [longitude, setLongitude] = useState(23.4729);
  const [start, setStart] = useState("2028-10-01T00:00");
  const [end, setEnd] = useState("2028-10-31T00:00");
  const [result, setResult] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [index, setIndex] = useState(0);
  const [dirty, setDirty] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    fetch(`${API}/global/terrain`, { signal: abort.signal }).then(json<Overview>).then(setOverview)
      .catch(reason => { if (!abort.signal.aborted) setError(reason.message); });
    return () => { abort.abort(); controller.current?.abort(); };
  }, []);
  function select(lat: number, lon: number) {
    setLatitude(lat); setLongitude(lon); setDirty(true);
    controller.current?.abort(); setLoading(false);
  }
  async function run(event: React.FormEvent) {
    event.preventDefault(); controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    setLoading(true); setError(null);
    try {
      const response = await fetch(`${API}/global/preview`, {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: abort.signal,
        body: JSON.stringify({ coordinate: { latitude_deg: latitude, longitude_deg_east: longitude },
          time_range: { start_utc: new Date(`${start}Z`).toISOString(), end_utc: new Date(`${end}Z`).toISOString() } }),
      });
      const next = await json<Preview>(response);
      if (!abort.signal.aborted) { setResult(next); setIndex(0); setDirty(false); }
    } catch (reason) { if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : "Preview unavailable"); }
    finally { if (!abort.signal.aborted) setLoading(false); }
  }
  const sample = result?.timeline[index];
  return <section className="global-preview" aria-labelledby="global-title">
    <div className="workspace-intro"><div><span className="eyebrow">WHOLE MOON · COARSE PREVIEW</span>
      <h1 id="global-title">Choose a point. Follow the light.</h1>
      <p>Select anywhere on the map or enter coordinates. Explore one location using global NASA LOLA terrain and JPL ephemerides.</p>
    </div></div>
    <div className="global-notice">1/16° terrain grid · about 1.9 km north–south · preliminary geometry only. Local hazards and landing suitability are unresolved.</div>
    {!overview && !error && <p role="status">Loading verified global terrain…</p>}
    {overview && <><PointMap data={overview} latitude={latitude} longitude={longitude} onSelect={select} />
      <div className="global-map-scale"><span>180°W</span><span>0° · near-side center</span><span>180°E</span></div></>}
    <form className="global-form" onSubmit={run}>
      <label className="field">Latitude (°N)<input required type="number" min="-90" max="90" step="any" value={latitude} onChange={e => select(Number(e.target.value), longitude)} /></label>
      <label className="field">Longitude (°E)<input required type="number" min="-180" max="179.999999" step="any" value={longitude} onChange={e => select(latitude, Number(e.target.value))} /></label>
      <label className="field">Start (UTC)<input required type="datetime-local" min="2025-01-01T00:00" max="2035-12-31T23:59" value={start} onChange={e => { setStart(e.target.value); setDirty(true); controller.current?.abort(); setLoading(false); }} /></label>
      <label className="field">End (UTC)<input required type="datetime-local" min="2025-01-01T00:00" max="2035-12-31T23:59" value={end} onChange={e => { setEnd(e.target.value); setDirty(true); controller.current?.abort(); setLoading(false); }} /></label>
      <button className="primary-button" disabled={loading || !overview}>{loading ? "Computing preview…" : "Preview this point"}</button>
    </form>
    <p className="muted">Negative latitude is south; negative longitude is west. Choose up to 31 days within 2025–2035.</p>
    {error && <p className="error-box" role="alert">{error}</p>}
    {result && <div className="global-result">
      <div className="section-heading"><div><span className="eyebrow">SELECTED LOCATION · COARSE RESULTS</span>
        <h2>{result.coordinate.latitude_deg.toFixed(4)}°N · {result.coordinate.longitude_deg_east.toFixed(4)}°E</h2></div>
        <button className="secondary-button" onClick={() => downloadJson(result, "lumen-global-point.json")}>Export preview</button></div>
      {dirty && <p className="global-notice" role="status">The point or dates changed. These results belong to the previous selection; run the preview again.</p>}
      <div className="global-metrics">
        <div><strong>{(result.metrics.illumination_fraction * 100).toFixed(1)}%</strong><span>Sun upper limb above coarse horizon</span></div>
        <div><strong>{(result.metrics.earth_visibility_fraction * 100).toFixed(1)}%</strong><span>Earth-center line of sight</span></div>
        <div><strong>{result.elevation_m.toFixed(0)} m</strong><span>Coarse elevation above 1,737.4 km sphere</span></div>
      </div>
      <div className="global-terrain"><Suspense fallback={<p>Loading local terrain…</p>}><TerrainScene key={`${result.coordinate.latitude_deg},${result.coordinate.longitude_deg_east}`}
        terrain={result.terrain} previewPoint candidates={[]} selected={null} onSelect={() => {}} mode="terrain" layer="terrain" mapCandidates={[]} psr={null} features={[]} /></Suspense></div>
      <p className="muted">80 × 80 km local context around the selected point · 2 km display sampling · 1.5× height exaggeration · illustrative lighting.</p>
      <h3>Mission visibility timeline</h3>
      <div className="global-timelines">{(["sun_visible", "earth_visible"] as const).map(key => <div key={key}><span>{key === "sun_visible" ? "Sun upper limb" : "Earth center"}</span>
        <svg viewBox="0 0 1000 22" role="img" aria-label={`${key === "sun_visible" ? "Sun" : "Earth"} visibility over the mission; inspect exact samples below.`}>
          {visibilitySegments(result.timeline, key).map((segment, i) => <rect key={i} x={segment.x} y="0" width={segment.width} height="22" fill={segment.visible ? (key === "sun_visible" ? "#efd18c" : "#9acbdb") : "#263432"} />)}
        </svg></div>)}</div>
      <label className="field">Inspect five-minute sample<input type="range" min="0" max={result.timeline.length - 1} value={index} onChange={e => setIndex(Number(e.target.value))} /></label>
      {sample && <p aria-live="polite">{sample.time_utc} · Sun {sample.sun_visible ? "visible" : "blocked"} ({sample.sun_elevation_deg.toFixed(2)}° elevation) · Earth {sample.earth_visible ? "visible" : "blocked"} ({sample.earth_elevation_deg.toFixed(2)}° elevation)</p>}
      <details><summary>Resolution, sources and limits</summary><ul>{result.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
        <a href="https://svs.gsfc.nasa.gov/4720/" target="_blank" rel="noreferrer">NASA LOLA elevation source and encoding</a></details>
    </div>}
  </section>;
}
