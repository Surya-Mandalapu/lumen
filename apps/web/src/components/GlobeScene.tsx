import { Html, Line, OrbitControls, Stars, useGLTF, useProgress, useTexture } from "@react-three/drei";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { LunarCoordinate } from "../lib/hemisphere";
import type { LunarFeature, SearchRequest } from "../lib/types";
import { lunarPoint } from "../lib/lunar-picking";
import { interpolateScene } from "../lib/scene-geometry";
import type { SceneSite, SceneEphemeris } from "../lib/scene-geometry";
import { CelestialBody } from "./CelestialBody";
import { SiteSky } from "./SiteSky";
import { TopographicMoon } from "./TopographicMoon";
import { SceneBoundary } from "./SceneBoundary";
import "./orbital-scene.css";

const API = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";
type SceneMode = "moon" | "orbit" | "site";
type Display = ReturnType<typeof interpolateScene>;
const NO_SITES: SceneSite[] = [];
type AreaPick = (center: LunarCoordinate, radiusKm: number) => void;
type Props = { sites?: SceneSite[]; selectedSite?: string | null; onSiteSelect?: (id: string) => void; onArea?: AreaPick; maximumRadiusKm?: number; preparedLabel?: string; onPick?: (coordinate: LunarCoordinate) => void; selectedCenter?: LunarCoordinate; focusSelection?: boolean; radiusKm?: number; onLocalView?: () => void; timeRange?: SearchRequest["time_range"] };

function SceneCamera({ mode, reset, selection, focus, bounds }: { bounds: THREE.Sphere | null; mode: SceneMode; reset: number; selection?: LunarCoordinate; focus: boolean }) {
  const { camera, controls, invalidate, gl } = useThree();
  const viewportAspect = useThree(state => state.size.width / state.size.height);
  const start = useRef(new THREE.Vector3()), end = useRef(new THREE.Vector3()), target = useRef(new THREE.Vector3());
  const elapsed = useRef(1);
  const startUp = useRef(new THREE.Vector3()), upRotation = useRef(new THREE.Quaternion());
  useLayoutEffect(() => {
    // A manual gesture takes over from camera navigation before drawing or orbiting.
    const parent = gl.domElement.closest(".orbital-canvas");
    const interrupt = () => { elapsed.current = 1; if (controls && "enabled" in controls) controls.enabled = true; };
    parent?.addEventListener("pointerdown", interrupt, true);
    return () => parent?.removeEventListener("pointerdown", interrupt, true);
  }, [gl, controls]);
  useEffect(() => {
    if (mode === "site") return;
    startUp.current.copy(camera.up);
    const northUp = mode === "orbit" || (focus && Math.abs(selection?.latitude_deg ?? -90) < 85);
    const localView = mode === "moon" && focus && !!bounds;
    const destinationUp = localView ? bounds!.center.clone().normalize() : new THREE.Vector3(0, northUp ? 1 : 0, northUp ? 0 : 1);
    upRotation.current.setFromUnitVectors(startUp.current, destinationUp);
    target.current.set(0, 0, 0);
    if (mode === "orbit") end.current.set(8, 39, 38).multiplyScalar(Math.max(1, 1.15 / viewportAspect));
    else if (localView) {
      target.current.copy(bounds!.center);
      const halfFov = Math.atan(Math.tan(42 * Math.PI / 360) * Math.min(1, viewportAspect));
      const distance = Math.max(.005, bounds!.radius / Math.sin(halfFov) * 1.6);
      const tangent = new THREE.Vector3(0, 1, 0).addScaledVector(destinationUp, -destinationUp.y).normalize();
      end.current.copy(target.current).addScaledVector(destinationUp, distance).addScaledVector(tangent, distance * .2);
    }
    else if (focus && selection) end.current.set(...lunarPoint(selection.latitude_deg, selection.longitude_deg_east, 3.1));
    else {
      // Fit only the Moon, including its relief, with room for landmark labels.
      // The limiting field of view keeps it fully visible on narrow screens.
      const halfFov = Math.atan(Math.tan(42 * Math.PI / 360) * Math.min(1, viewportAspect));
      end.current.set(0, -2.15 / Math.sin(halfFov) * 1.12, 0);
    }
    start.current.copy(camera.position);
    if (start.current.length() < 2.28 && !localView) start.current.copy(end.current);
    elapsed.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : 0;
    if (elapsed.current === 1) { camera.position.copy(end.current); camera.up.copy(destinationUp); }
    if (controls && "enabled" in controls) controls.enabled = elapsed.current === 1;
    if (controls && "target" in controls) (controls.target as THREE.Vector3).copy(target.current);
    if (elapsed.current === 1) { camera.lookAt(target.current); if (controls && "update" in controls) (controls.update as () => void)(); }
    invalidate();
    return () => { if (controls && "enabled" in controls) controls.enabled = true; };
    // Framing follows explicit navigation; scrubbing time preserves the user's camera.
  }, [mode, reset, focus, selection?.latitude_deg, selection?.longitude_deg_east, controls, camera, invalidate, viewportAspect, bounds]);
  useFrame((_, delta) => {
    if (mode === "site" || elapsed.current >= 1) return;
    // Demand rendering includes idle time in the first frame's delta. Discard
    // that idle gap so a click after a pause cannot finish the animation at once.
    elapsed.current = Math.min(1, elapsed.current + Math.min(delta, .05) / 1.25);
    const t = THREE.MathUtils.smootherstep(elapsed.current, 0, 1), from = start.current.clone().sub(target.current), to = end.current.clone().sub(target.current);
    const rotation = new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), to.clone().normalize());
    camera.position.copy(from).normalize().applyQuaternion(new THREE.Quaternion().slerpQuaternions(new THREE.Quaternion(), rotation, t)).multiplyScalar(THREE.MathUtils.lerp(from.length(), to.length(), t)).add(target.current);
    if (mode === "moon" && !(focus && bounds) && camera.position.length() < 2.28) camera.position.setLength(2.28);
    camera.up.copy(startUp.current).applyQuaternion(new THREE.Quaternion().slerpQuaternions(new THREE.Quaternion(), upRotation.current, t));
    camera.lookAt(target.current);
    if (elapsed.current === 1 && controls) { if ("enabled" in controls) controls.enabled = true; if ("update" in controls) (controls.update as () => void)(); }
    invalidate();
  });
  return null;
}

function World({ data, display, mode, exaggeration, features, labels, selectedCenter, radiusKm, onPick, onArea, maximumRadiusKm, drawMode, onDrawFeedback, onDrawEnd, sites, selectedSite, onSiteSelect, onSiteBounds }: {
  sites: SceneSite[]; selectedSite?: string | null; onSiteSelect?: (id: string) => void; onSiteBounds: (bounds: THREE.Sphere) => void;
  onArea?: AreaPick; maximumRadiusKm?: number; drawMode: boolean; onDrawFeedback: (message: string) => void; onDrawEnd: () => void;
  data: SceneEphemeris | null; display: Display | null; mode: SceneMode; exaggeration: number; features: LunarFeature[]; labels: boolean; selectedCenter?: LunarCoordinate; radiusKm?: number; onPick?: (coordinate: LunarCoordinate) => void;
}) {
  const moonPosition = mode === "orbit" && display ? display.moon.clone().multiplyScalar(1 / 25_000) : new THREE.Vector3();
  const moonRotation = mode === "orbit" && display ? display.moonRotation : new THREE.Quaternion();
  const invMoon = display?.moonRotation.clone().invert();
  const earth = display ? mode === "orbit" ? new THREE.Vector3() : display.moon.clone().negate().applyQuaternion(invMoon!).normalize().multiplyScalar(4.8) : null;
  const sun = display ? mode === "orbit" ? display.sun.clone().normalize().multiplyScalar(23) : display.sun.clone().sub(display.moon).applyQuaternion(invMoon!).normalize().multiplyScalar(6) : null;
  const earthRotation = display ? mode === "orbit" ? display.earthRotation : invMoon!.clone().multiply(display.earthRotation) : new THREE.Quaternion();
  const orbit = useMemo(() => data?.samples.map(sample => new THREE.Vector3(...sample.moon_from_earth_km).multiplyScalar(1 / 25_000)) ?? [], [data]);
  const onLandmark = useCallback((feature: LunarFeature) => onPick?.({ latitude_deg: feature.latitude_deg, longitude_deg_east: feature.longitude_deg_east }), [onPick]);
  if (mode === "site") return display && selectedCenter ? <SiteSky display={display} data={data} site={selectedCenter} /> : null;
  return <>
    <ambientLight intensity={.55} /><directionalLight position={sun ?? [3, 4, -6]} intensity={2.1} color="#fff4df" /><Stars radius={80} depth={45} count={1000} factor={1.5} saturation={0} fade />
    {mode === "orbit" && orbit.length > 1 && <Line points={orbit} color="#668e80" opacity={.75} transparent lineWidth={1.5} />}
    <group position={moonPosition} quaternion={moonRotation} scale={mode === "orbit" ? .27 : 1}><TopographicMoon sites={mode === "moon" ? sites : NO_SITES} selectedSite={selectedSite} onSiteSelect={onSiteSelect} onSiteBounds={onSiteBounds} drawMode={mode === "moon" && drawMode} maximumRadiusKm={maximumRadiusKm} onArea={mode === "moon" ? onArea : undefined} onDrawFeedback={onDrawFeedback} onDrawEnd={onDrawEnd} exaggeration={exaggeration} features={features} labels={labels && mode === "moon"} selectedCenter={selectedCenter} radiusKm={radiusKm} onPick={mode === "moon" ? onPick : undefined} onLandmark={onLandmark} /></group>
    {mode === "orbit" && display && earth && sun && <Suspense fallback={null}>
      <group position={earth} quaternion={earthRotation}><CelestialBody body="earth" radius={mode === "orbit" ? 1.9 : .85} /></group><group position={sun}><CelestialBody body="sun" radius={mode === "orbit" ? 2.1 : 1.15} /></group>
      <Html position={[earth.x, earth.y + (mode === "orbit" ? 2.3 : 1.1), earth.z]} center zIndexRange={[30, 0]}><span className="body-label earth">EARTH</span></Html><Html position={[sun.x, sun.y + (mode === "orbit" ? 2.6 : 1.5), sun.z]} center zIndexRange={[30, 0]}><span className="body-label sun">SUN</span></Html>
      {mode === "orbit" && <Html position={[moonPosition.x, moonPosition.y + .9, moonPosition.z]} center zIndexRange={[30, 0]}><span className="body-label">{selectedCenter ? "MOON · YOUR SITE" : "MOON"}</span></Html>}
    </Suspense>}
  </>;
}

export function GlobeScene({ sites = NO_SITES, selectedSite, onSiteSelect, onArea, maximumRadiusKm = 5, preparedLabel, onPick, selectedCenter, focusSelection, radiusKm, timeRange }: Props) {
  const [siteBounds, setSiteBounds] = useState<THREE.Sphere | null>(null);
  const { active: assetsLoading } = useProgress();
  const [drawMode, setDrawMode] = useState(false), [drawFeedback, setDrawFeedback] = useState("");
  const endDrawing = useCallback(() => setDrawMode(false), []);
  const [mode, setMode] = useState<SceneMode>("moon"), [focus, setFocus] = useState(sites.length > 0), [reset, setReset] = useState(0);
  useEffect(() => { if (mode !== "moon") { setDrawMode(false); setDrawFeedback(""); } }, [mode]);
  const [exaggeration, setExaggeration] = useState(6), [labels, setLabels] = useState(true), [features, setFeatures] = useState<LunarFeature[]>([]);
  const [landmarkError, setLandmarkError] = useState(false), [data, setData] = useState<SceneEphemeris | null>(null), [sceneError, setSceneError] = useState(""), [retry, setRetry] = useState(0);
  const [start, setStart] = useState((timeRange?.start_utc ?? "2028-10-01T00:00:00Z").slice(0, 16)), [days, setDays] = useState(7);
  const [fraction, setFraction] = useState(0), [playing, setPlaying] = useState(false), [immersive, setImmersive] = useState(false), [assetAttempt, setAssetAttempt] = useState(0);
  const wrapper = useRef<HTMLDivElement>(null), fullscreenButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (focusSelection) { setMode(previous => previous === "site" ? "site" : "moon"); setFocus(true); } }, [focusSelection, selectedCenter?.latitude_deg, selectedCenter?.longitude_deg_east]);
  useEffect(() => {
    const abort = new AbortController();
    fetch(`${API}/scene/landmarks`, { signal: abort.signal }).then(response => { if (!response.ok) throw new Error(); return response.json(); }).then(next => { if (!abort.signal.aborted) { setFeatures(next.features); setLandmarkError(false); } }).catch(() => { if (!abort.signal.aborted) setLandmarkError(true); });
    return () => abort.abort();
  }, [retry]);
  useEffect(() => {
    const abort = new AbortController(); setData(null); setSceneError(""); setFraction(0); setPlaying(false);
    const date = new Date(`${start}:00Z`);
    if (!Number.isFinite(date.getTime())) { setSceneError("Choose a valid scene date."); return; }
    const timer = setTimeout(() => { abort.abort(); setSceneError("Scene positions took too long to load. Retry when ready."); }, 15_000);
    fetch(`${API}/scene/ephemeris`, { method: "POST", signal: abort.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ time_range: { start_utc: date.toISOString(), end_utc: new Date(date.getTime() + days * 86400000).toISOString() } }) }).then(async response => {
      const body = await response.json(); if (!response.ok) throw new Error(typeof body.detail === "string" ? body.detail : "Scene positions unavailable. Check the date."); return body as SceneEphemeris;
    }).then(next => { if (!abort.signal.aborted) setData(next); }).catch(error => { if (!abort.signal.aborted) setSceneError(error.message); }).finally(() => clearTimeout(timer));
    return () => { clearTimeout(timer); abort.abort(); };
  }, [start, days, retry]);
  useEffect(() => {
    if (!playing || !data) return;
    let frame: number, last = performance.now();
    const animate = (now: number) => { const delta = Math.min((now - last) / 1000, .2); last = now; setFraction(previous => Math.min(1, previous + delta / 40)); frame = requestAnimationFrame(animate); };
    frame = requestAnimationFrame(animate); return () => cancelAnimationFrame(frame);
  }, [playing, data]);
  useEffect(() => { if (fraction >= 1) setPlaying(false); }, [fraction]);
  useEffect(() => {
    const previous = document.body.style.overflow; if (immersive) document.body.style.overflow = "hidden";
    const change = () => { if (!document.fullscreenElement) { setImmersive(false); fullscreenButton.current?.focus(); } };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && immersive) { if (document.fullscreenElement === wrapper.current) void document.exitFullscreen().catch(() => {}); setImmersive(false); fullscreenButton.current?.focus(); }
      if (event.key === "Tab" && immersive && wrapper.current) {
        const elements = Array.from(wrapper.current.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, a[href]")).filter(element => element.getClientRects().length);
        const first = elements[0], last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("fullscreenchange", change); document.addEventListener("keydown", key);
    return () => { document.body.style.overflow = previous; document.removeEventListener("fullscreenchange", change); document.removeEventListener("keydown", key); };
  }, [immersive]);
  async function fullscreen() {
    if (immersive) { if (document.fullscreenElement === wrapper.current) await document.exitFullscreen(); setImmersive(false); fullscreenButton.current?.focus(); }
    else { setImmersive(true); try { await wrapper.current?.requestFullscreen(); } catch { /* CSS fallback for browsers without native fullscreen. */ } }
  }
  const display = useMemo(() => data ? interpolateScene(data.samples, fraction) : null, [data, fraction]);
  const unavailable = <div className="scene-empty" role="status"><p>The 3D assets could not load. Coordinates remain available.</p><button onClick={() => { useLoader.clear(THREE.FileLoader, "/assets/moon-height.i16"); useTexture.clear("/assets/moon-color.jpg"); useGLTF.clear("/assets/earth-visual.glb"); useGLTF.clear("/assets/sun-visual.glb"); setAssetAttempt(value => value + 1); }}>Retry 3D scene</button></div>;
  return <div ref={wrapper} className={["orbital-scene", mode === "site" ? "site-view" : "", immersive ? "immersive" : ""].filter(Boolean).join(" ")} role="region" aria-label="Interactive topographic Moon, Earth and Sun">
    <div className="orbital-toolbar"><div className="scene-view-tabs" role="group" aria-label="Scene view"><button aria-pressed={mode === "moon"} onClick={() => { setMode("moon"); setFocus(false); setReset(value => value + 1); }}>Moon surface</button><button aria-pressed={mode === "orbit"} onClick={() => { setMode("orbit"); setFocus(false); setReset(value => value + 1); }}>Earth orbit</button><button aria-pressed={mode === "site"} disabled={!selectedCenter} onClick={() => setMode("site")}>View from site</button></div><div className="scene-tools"><button disabled={mode === "site"} aria-pressed={labels} onClick={() => setLabels(value => !value)}>Landmarks</button><label className="relief-control">Relief <select disabled={mode === "site"} aria-label="Topographic relief" value={exaggeration} onChange={event => setExaggeration(Number(event.target.value))}><option value={1}>True scale</option><option value={6}>6×</option><option value={12}>12×</option></select></label><button ref={fullscreenButton} aria-pressed={immersive} onClick={() => void fullscreen()}>{immersive ? "Exit full screen" : "Full screen"} <span aria-hidden="true">⛶</span></button></div></div>
    <div className={`orbital-canvas ${drawMode ? "drawing-area" : ""}`}><SceneBoundary key={assetAttempt} fallback={unavailable}><Canvas frameloop="demand" camera={{ position: [5, -3, -10], fov: 42, near: .01, far: 250 }} dpr={[1, 1.5]} fallback={unavailable}>
      <color attach="background" args={["#070c10"]} /><Suspense fallback={null}><World data={data} display={display} mode={mode} exaggeration={exaggeration} features={features} labels={labels} selectedCenter={selectedCenter} radiusKm={radiusKm} onPick={onPick} onArea={onArea} maximumRadiusKm={maximumRadiusKm} drawMode={drawMode} onDrawFeedback={setDrawFeedback} onDrawEnd={endDrawing} sites={sites} selectedSite={selectedSite} onSiteSelect={onSiteSelect} onSiteBounds={setSiteBounds} /></Suspense>{mode !== "site" && <OrbitControls makeDefault enableDamping={false} enablePan={mode === "orbit"} minDistance={mode === "moon" && focus && sites.length ? .002 : mode === "moon" ? 2.28 : 5} maxPolarAngle={mode === "moon" && focus && sites.length ? Math.PI / 2 - .02 : Math.PI} maxDistance={mode === "moon" ? 50 : 180} />}<SceneCamera mode={mode} reset={reset} selection={selectedCenter} focus={focus} bounds={sites.length ? siteBounds : null} />
    </Canvas></SceneBoundary><div className="scene-navigation">{onArea && <button disabled={mode !== "moon"} aria-pressed={drawMode} title="Right-drag also draws an area. Drag from center to edge." onClick={() => { setDrawMode(value => !value); setDrawFeedback(drawMode ? "Area drawing off." : `Drag from center to edge on the Moon · 1–${maximumRadiusKm} km radius`); }}>{drawMode ? "Cancel drawing" : "Draw search area"}</button>}<button onClick={() => { setMode("moon"); setFocus(true); setReset(value => value + 1); }} disabled={!selectedCenter}>{sites.length ? "Frame all sites" : "Go to my site"}</button><button onClick={() => { if (mode === "site") setMode("moon"); setFocus(false); setReset(value => value + 1); }}>Fit view</button></div><div className="scene-readout"><span className="scene-live-dot" />{display ? display.time.toISOString().replace("T", " ").slice(0, 16) + " UTC" : sceneError ? "Positions unavailable" : "Loading JPL positions…"}</div>
      {drawFeedback && mode === "moon" && <div className="area-selection-status" role="status">{drawFeedback}</div>}
      {assetsLoading && <div className="scene-loading" role="status">Loading Moon terrain and planet textures…</div>}{sceneError && <div className="scene-data-error" role="alert">{sceneError} <button onClick={() => setRetry(value => value + 1)}>Retry positions</button></div>}{landmarkError && <div className="scene-landmark-error" role="status">Landmarks unavailable. <button onClick={() => setRetry(value => value + 1)}>Retry labels</button></div>}
    </div>
    <div className="orbital-timeline"><button className="play-scene" disabled={!data} onClick={() => { if (fraction >= 1) setFraction(0); setPlaying(value => !value); }} aria-label={playing ? "Pause scene time" : "Play scene time"}>{playing ? "Ⅱ" : "▶"}</button><label className="scene-time-slider"><span>Scene time <span>{mode === "orbit" ? "Moon motion around Earth" : mode === "site" ? "Earth & Sun above your horizon" : "Sunlight on the Moon"}</span></span><input aria-label="Scene time" type="range" min={0} max={1000} value={Math.round(fraction * 1000)} disabled={!data} onChange={event => { setPlaying(false); setFraction(Number(event.target.value) / 1000); }} /></label><label className="scene-date">From (UTC)<input aria-label="Scene start UTC" type="datetime-local" min="2025-01-01T00:00" max="2035-11-30T00:00" value={start} onChange={event => setStart(event.target.value)} /></label><label className="scene-duration">Window<select aria-label="Scene duration" value={days} onChange={event => setDays(Number(event.target.value))}><option value={1}>1 day</option><option value={7}>7 days</option><option value={30}>30 days</option></select></label></div>
    <div className="orbital-footer"><span>{mode === "site" ? "At your site · geometric horizon · drag or use arrow keys to look around" : <>NASA LRO / LOLA · grid 30° · gold equator · {exaggeration === 1 ? "true-scale relief" : `${exaggeration}× relief`} · drag to orbit · right-drag to select an area</>}</span><details><summary>Scale & sources</summary><p>NASA elevation data forms the landforms; relief settings change only this display. Earth and Sun use NASA model textures in Earth orbit and View from site. Positions and lunar rotation follow JPL DE440. Body sizes and distances are rescaled for readability; the orbit preserves lunar directions and relative distance changes.</p><p>Scene time is independent of mission dates. Lighting is illustrative; use site analysis for terrain-aware visibility. Earth rotation uses the approximate IAU model. {preparedLabel}</p><a href="https://svs.gsfc.nasa.gov/4720/" target="_blank" rel="noreferrer">NASA Moon data</a><a href="https://science.nasa.gov/3d-resources/" target="_blank" rel="noreferrer">NASA Earth & Sun models</a></details></div>
  </div>;
}
