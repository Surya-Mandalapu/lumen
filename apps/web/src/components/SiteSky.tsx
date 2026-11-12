import { Html, Line, Stars } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import type { LunarCoordinate } from "../lib/hemisphere";
import { interpolateScene, siteSky } from "../lib/scene-geometry";
import type { SceneEphemeris } from "../lib/scene-geometry";
import { CelestialBody } from "./CelestialBody";

type Display = ReturnType<typeof interpolateScene>;
export function SiteSky({ display, data, site }: { display: Display; data: SceneEphemeris | null; site: LunarCoordinate }) {
  const { camera, gl, invalidate } = useThree();
  const sky = useMemo(() => siteSky(display, site), [display, site.latitude_deg, site.longitude_deg_east]);
  const [look, setLook] = useState<"earth" | "sun" | "north">("north");
  // Site changes and explicit look buttons reorient; time scrubbing keeps your gaze fixed.
  useEffect(() => {
    camera.position.set(0, 0, 0); camera.up.set(0, 1, 0);
    const direction = look === "north" ? new THREE.Vector3(0, .12, -1) : sky[look].direction.clone();
    direction.y = Math.max(.04, direction.y); camera.lookAt(direction); invalidate();
  }, [look, site.latitude_deg, site.longitude_deg_east, camera, invalidate]);
  useEffect(() => {
    const element = gl.domElement;
    const previousTabIndex = element.tabIndex; element.tabIndex = 0;
    element.setAttribute("aria-label", "Sky from selected lunar site. Drag or use arrow keys to look around.");
    let pointer: { id: number; x: number; y: number } | null = null;
    const turn = (x: number, y: number) => {
      const rotation = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
      rotation.y -= x; rotation.x = THREE.MathUtils.clamp(rotation.x - y, -Math.PI / 2 + .02, Math.PI / 2 - .02);
      camera.quaternion.setFromEuler(rotation); invalidate();
    };
    const down = (event: PointerEvent) => { pointer = { id: event.pointerId, x: event.clientX, y: event.clientY }; element.setPointerCapture(event.pointerId); element.focus({ preventScroll: true }); };
    const move = (event: PointerEvent) => { if (!pointer || pointer.id !== event.pointerId) return; turn((event.clientX - pointer.x) * .004, (event.clientY - pointer.y) * .004); pointer.x = event.clientX; pointer.y = event.clientY; };
    const up = () => { pointer = null; };
    const key = (event: KeyboardEvent) => {
      const delta: Record<string, [number, number]> = { ArrowLeft: [-.08, 0], ArrowRight: [.08, 0], ArrowUp: [0, -.08], ArrowDown: [0, .08] };
      if (delta[event.key]) { event.preventDefault(); turn(...delta[event.key]); }
    };
    element.addEventListener("pointerdown", down); element.addEventListener("pointermove", move); element.addEventListener("pointerup", up); element.addEventListener("pointercancel", up); element.addEventListener("keydown", key);
    return () => { element.tabIndex = previousTabIndex; element.removeAttribute("aria-label"); element.removeEventListener("pointerdown", down); element.removeEventListener("pointermove", move); element.removeEventListener("pointerup", up); element.removeEventListener("pointercancel", up); element.removeEventListener("keydown", key); };
  }, [camera, gl, invalidate]);
  const paths = useMemo(() => {
    if (!data) return null;
    const samples = data.samples.map((_, i) => siteSky(interpolateScene(data.samples, i / (data.samples.length - 1)), site));
    return { earth: samples.map(sample => sample.earth.direction.clone().multiplyScalar(35)), sun: samples.map(sample => sample.sun.direction.clone().multiplyScalar(35)) };
  }, [data, site.latitude_deg, site.longitude_deg_east]);
  return <>
    <Stars radius={90} depth={20} count={1400} factor={1.2} fade />
    <ambientLight intensity={1.3} />
    <directionalLight position={sky.sun.direction.clone().multiplyScalar(50)} intensity={2.1} />
    <mesh position={[0, -.02, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[200, 200]} /><meshBasicMaterial color="#242d2a" side={THREE.DoubleSide} /></mesh>
    <Line points={Array.from({ length: 181 }, (_, i) => new THREE.Vector3(35 * Math.sin(i / 180 * Math.PI * 2), 0, -35 * Math.cos(i / 180 * Math.PI * 2)))} color="#a5c3a5" lineWidth={2} />
    {["N", "E", "S", "W"].map((name, i) => <Html key={name} position={[35 * Math.sin(i * Math.PI / 2), 1.5, -35 * Math.cos(i * Math.PI / 2)]} center><span className="sky-compass">{name}</span></Html>)}
    {(["earth", "sun"] as const).map(body => {
      const position = sky[body].direction.clone().multiplyScalar(35);
      return <group key={body}>
        {paths && <Line points={paths[body]} color={body === "earth" ? "#8dbede" : "#edcc82"} opacity={.55} transparent lineWidth={1} />}
        {sky[body].elevation >= 0 && <Suspense fallback={null}><group position={position}><CelestialBody body={body} radius={body === "earth" ? .7 : .4} /></group></Suspense>}
        {sky[body].elevation >= 0 && <Html position={[position.x, position.y + 1.3, position.z]} center><span className={`body-label ${body}`}>{body.toUpperCase()} · {sky[body].elevation.toFixed(1)}°</span></Html>}
      </group>;
    })}
    <Html fullscreen style={{ pointerEvents: "none" }}><div className="site-sky-context">
      <strong>Sky from your site · {Math.abs(site.latitude_deg).toFixed(2)}°{site.latitude_deg < 0 ? "S" : "N"} · {Math.abs(site.longitude_deg_east).toFixed(2)}°{site.longitude_deg_east < 0 ? "W" : "E"}</strong>
      <div className="site-sky-readings">{(["earth", "sun"] as const).map(body => <div key={body}><b>{body === "earth" ? "Earth" : "Sun"}</b><span>{sky[body].elevation.toFixed(1)}° elevation · {sky[body].azimuth.toFixed(0)}° bearing</span><span>{sky[body].elevation >= 0 ? "Above geometric horizon" : "Below geometric horizon"}</span></div>)}</div>
      <div className="site-sky-actions">{(["earth", "sun", "north"] as const).map(body => <button key={body} onClick={() => { setLook(body); if (look === body) { const direction = body === "north" ? new THREE.Vector3(0, .12, -1) : sky[body].direction.clone(); direction.y = Math.max(.04, direction.y); camera.lookAt(direction); invalidate(); } }}>Look {body === "north" ? "north" : `toward ${body === "earth" ? "Earth" : "Sun"}`}</button>)}</div>
      <p>Flat geometric horizon · terrain obstructions excluded · body markers enlarged. Use site analysis for terrain-aware visibility.</p>
    </div><div className="site-horizon-overview">
      <strong>360° geometric horizon · 0° elevation</strong>
      <svg viewBox="0 0 400 95" role="img" aria-label="Earth and Sun elevation across the full compass horizon">
        <rect x="20" y="47" width="360" height="38" fill="#364239" />
        <line x1="20" x2="380" y1="47" y2="47" stroke="#9db89e" />
        {[0, 90, 180, 270, 360].map((az, index) => <g key={az}><line x1={20 + az} x2={20 + az} y1="12" y2="85" stroke="#688477" opacity=".25" /><text x={20 + az} y="94" textAnchor="middle">{["N", "E", "S", "W", "N"][index]}</text></g>)}
        {(["earth", "sun"] as const).map(body => {
          const x = 20 + sky[body].azimuth, y = 47 - sky[body].elevation * .36;
          return <g key={body} fill={body === "earth" ? "#9dcce3" : "#f0ce83"}><circle cx={x} cy={y} r="3.5" /><text x={Math.max(42, Math.min(358, x))} y={Math.max(10, y - 7)} textAnchor="middle">{body === "earth" ? "Earth" : "Sun"}</text></g>;
        })}
      </svg>
    </div></Html>
  </>;
}
