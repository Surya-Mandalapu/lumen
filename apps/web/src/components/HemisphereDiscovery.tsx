import { useEffect, useRef, useState } from "react";
import type { LunarFeature } from "../lib/types";
import { coordinateLabel, readSavedAreas } from "../lib/hemisphere";
import type { LunarCoordinate } from "../lib/hemisphere";

export function HemisphereDiscovery({ features, center, onSelect }: {
  features: LunarFeature[]; center: LunarCoordinate; onSelect: (point: LunarCoordinate) => void; local: boolean; onExplore: () => void;
}) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState("");
  const [saved, setSaved] = useState(readSavedAreas), [notice, setNotice] = useState("");
  const [matches, setMatches] = useState<LunarFeature[]>([]), [searching, setSearching] = useState(false), [searchError, setSearchError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => {
    const abort = new AbortController(); setMatches([]); setSearchError(""); setSearching(!!query.trim());
    if (!query.trim()) return () => abort.abort();
    const deadline = setTimeout(() => { abort.abort(); setSearching(false); setSearchError("Place search took too long. Retry or enter coordinates."); }, 10_000);
    const timer = setTimeout(() => {
      fetch(`${import.meta.env.VITE_API_BASE_URL ?? "/api/v1"}/global/features?q=${encodeURIComponent(query.trim())}`, { signal: abort.signal }).then(async response => {
        if (!response.ok) throw new Error(); return response.json() as Promise<{ features: LunarFeature[] }>;
      }).then(next => { if (!abort.signal.aborted) { setMatches(next.features); setSearching(false); } }).catch(() => {
        if (!abort.signal.aborted) { setMatches(features.filter(feature => feature.name.toLowerCase().includes(query.toLowerCase()))); setSearching(false); setSearchError("Showing available polar matches. Hemisphere place search is unavailable."); }
      }).finally(() => clearTimeout(deadline));
    }, 180);
    return () => { clearTimeout(timer); clearTimeout(deadline); abort.abort(); };
  }, [query, features]);
  function persist(next: LunarCoordinate[]) {
    setSaved(next); try { localStorage.setItem("lumen-southern-areas", JSON.stringify(next)); setNotice("Area saved on this device."); } catch { setNotice("Area saved for this visit."); }
  }
  return <div className="place-tools">
    <div className="place-tool-buttons"><button className="secondary-button" aria-expanded={open} onClick={() => setOpen(value => !value)}>Find a place</button><button className="secondary-button" onClick={() => persist([{ latitude_deg: center.latitude_deg, longitude_deg_east: center.longitude_deg_east }, ...saved.filter(point => point.latitude_deg !== center.latitude_deg || point.longitude_deg_east !== center.longitude_deg_east)].slice(0, 6))}>Save area</button>{saved.length > 0 && <details className="saved-areas"><summary>Saved ({saved.length})</summary><div>{saved.map((point, index) => <span key={`${point.latitude_deg},${point.longitude_deg_east}`}><button className="text-button" onClick={() => onSelect(point)}>{coordinateLabel(point)}</button><button className="text-button" aria-label={`Remove saved area ${index + 1}`} onClick={() => persist(saved.filter((_, item) => item !== index))}>×</button></span>)}</div></details>}</div>
    {open && <div className="place-finder"><label className="field">Find an approved landmark<input ref={input} type="search" maxLength={100} placeholder="Tycho, Shackleton, Tsiolkovskiy…" value={query} onChange={event => setQuery(event.target.value)} /></label>{query && <div className="landmark-matches" aria-label="Landmark search results">{searching ? <p role="status">Finding places…</p> : matches.length ? matches.map(feature => <button className="secondary-button" key={feature.id} onClick={() => { onSelect(feature); setQuery(""); setOpen(false); }}>{feature.name} <small>{coordinateLabel(feature)}</small></button>) : <p>No matching place. Pick a point on the Moon or use coordinates.</p>}{searchError && <p role="status">{searchError}</p>}</div>}</div>}
    {notice && <span className="save-notice" role="status">{notice}</span>}
  </div>;
}
