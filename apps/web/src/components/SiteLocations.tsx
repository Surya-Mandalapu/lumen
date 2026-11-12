import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState } from "react";
import type { SceneSite } from "../lib/scene-geometry";
import type { SearchRequest } from "../lib/types";
import { coordinateLabel } from "../lib/hemisphere";

const GlobeScene = lazy(() => import("./GlobeScene").then(module => ({ default: module.GlobeScene })));
export function SiteLocations({ sites, eligible, eligibleTotal, dates, onClose, onInspect, coarse = false }: {
  sites: SceneSite[]; eligible?: SceneSite[]; eligibleTotal?: number; dates: SearchRequest["time_range"];
  onClose: () => void; onInspect?: (id: string) => void; coarse?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null), title = useId();
  const [all, setAll] = useState(false), [selected, setSelected] = useState(sites[0]?.id ?? eligible?.[0]?.id ?? "");
  const shown = useMemo(() => all && eligible?.length ? eligible : sites, [all, eligible, sites]);
  const chosen = shown.find(site => site.id === selected) ?? shown[0];
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current; element?.showModal();
    return () => { element?.close(); previous?.focus(); };
  }, []);
  return <dialog ref={dialog} className="planning-dialog site-locations-dialog" aria-labelledby={title} onCancel={onClose}>
    <div className="planning-dialog-header"><h2 id={title}>{coarse ? "Explore the ranked local area" : "Places to consider · 3D Moon"}</h2><button className="secondary-button" autoFocus onClick={onClose}>Close site map</button></div>
    {eligible && eligible.length > 0 && <div className="guide-actions" role="group" aria-label="Mapped site set"><button className="secondary-button" aria-pressed={!all} onClick={() => setAll(false)}>Shortlist ({sites.length})</button><button className="secondary-button" aria-pressed={all} onClick={() => setAll(true)}>Eligible locations ({eligible.length})</button></div>}
    <p className="mapped-site-count">Showing {shown.length.toLocaleString()} locations. Gold: ranked candidates · green: other eligible locations · white: selected.</p>
    {all && eligibleTotal != null && eligibleTotal > (eligible?.length ?? 0) && <p className="field-hint">The service returned a spatial sample of {eligible!.length.toLocaleString()} of {eligibleTotal.toLocaleString()} eligible locations. The ranking evaluated every eligible location; this map does not show omitted points.</p>}
    {coarse && <p className="changed-notice">Exploratory coarse ranking · 2 km candidate spacing · sunlight and Earth visibility only. No fine terrain or mission hard-constraint screening.</p>}
    {chosen && <><div className="candidate-globe"><Suspense fallback={<p role="status">Loading site locations…</p>}><GlobeScene sites={shown} selectedSite={chosen.id} onSiteSelect={setSelected} selectedCenter={chosen} timeRange={dates} preparedLabel={coarse ? "Coarse global terrain" : "Applied prepared-site analysis"} /></Suspense></div>
      <div className="mapped-site-detail" aria-live="polite"><strong>{chosen.rank ? `Candidate ${chosen.rank}` : "Eligible location"} · {coordinateLabel(chosen)}</strong><span>Planning score {chosen.score.toFixed(1)} / 100{chosen.illumination_fraction != null ? ` · Sun ${(chosen.illumination_fraction * 100).toFixed(1)}%` : ""}{chosen.earth_visibility_fraction != null ? ` · Earth ${(chosen.earth_visibility_fraction * 100).toFixed(1)}%` : ""}</span>{onInspect && <button className="secondary-button" onClick={() => { onClose(); onInspect(chosen.id); }}>Inspect mapped site</button>}</div></>}
    <label className="field">Select a mapped location<select aria-label="Select mapped location" value={chosen?.id ?? ""} onChange={event => setSelected(event.target.value)}>{shown.map(site => <option value={site.id} key={site.id}>{site.rank ? `#${site.rank}` : site.id} · {coordinateLabel(site)} · score {site.score.toFixed(1)}</option>)}</select></label>
    <p className="field-hint">Frame all sites returns to the local cluster. Fit view shows the whole Moon. Markers are raised above the display terrain for visibility; scores use the applied search data.</p>
  </dialog>;
}
