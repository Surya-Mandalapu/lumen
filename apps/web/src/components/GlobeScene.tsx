import { Line, OrbitControls, Stars, useGLTF, useProgress } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { lunarCoordinate, lunarPoint, NASA_MOON_AXES } from "../lib/lunar-picking";
import { SceneBoundary } from "./SceneBoundary";

type Coordinate = { latitude_deg: number; longitude_deg_east: number };
function Moon({ onPick, selectedCenter }: { onPick?: (coordinate: Coordinate) => void; selectedCenter?: Coordinate }) {
  const { scene } = useGLTF("/assets/moon-small.glb");
  const object = useMemo(() => {
    const copy = scene.clone(true);
    const box = new THREE.Box3().setFromObject(copy);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const scale = 4 / Math.max(size.x, size.y, size.z);
    // NASA's cube-atlas GLB has west-positive X. Reflect into our east-positive
    // coordinate frame (+Y north, -Z prime meridian) before picking/marking sites.
    copy.scale.set(scale * NASA_MOON_AXES[0], scale * NASA_MOON_AXES[1], scale * NASA_MOON_AXES[2]);
    copy.position.set(-center.x * copy.scale.x, -center.y * copy.scale.y, -center.z * copy.scale.z);
    return copy;
  }, [scene]);
  const points = useMemo(() => Array.from({ length: 129 }, (_, index) => {
    const angle = index / 128 * Math.PI * 2;
    const latitude = 87 * Math.PI / 180;
    return new THREE.Vector3(Math.cos(angle) * 2.008 * Math.cos(latitude), -2.008 * Math.sin(latitude), Math.sin(angle) * 2.008 * Math.cos(latitude));
  }), []);
  return <group><primitive object={object} onClick={(event: import("@react-three/fiber").ThreeEvent<MouseEvent>) => {
    if (!onPick || event.delta > 5 || event.button !== 0) return;
    event.stopPropagation();
    const coordinate = lunarCoordinate(event.point.x, event.point.y, event.point.z);
    if (coordinate) onPick(coordinate);
  }} /><Line points={points} color="#d0d0d0" lineWidth={3} />
    {selectedCenter && <mesh position={lunarPoint(selectedCenter.latitude_deg, selectedCenter.longitude_deg_east)}><sphereGeometry args={[.0032, 20, 20]} /><meshBasicMaterial color="#f1d49b" /></mesh>}
    <mesh position={[0, -2.012, 0]}><sphereGeometry args={[.0015, 16, 16]} /><meshBasicMaterial color="#fff3cb" /></mesh>
  </group>;
}
function PolarCamera({ close, reset }: { close: boolean; reset: number }) {
  const { camera, controls, invalidate } = useThree();
  useEffect(() => {
    camera.up.set(0, 0, 1);
    camera.position.set(0, close ? -2.3 : -6.8, close ? .003 : .3);
    const target = new THREE.Vector3(0, 0, 0);
    camera.lookAt(target);
    if (controls && "target" in controls) {
      (controls.target as THREE.Vector3).copy(target);
      if ("update" in controls) (controls.update as () => void)();
    }
    invalidate();
  }, [camera, controls, close, reset, invalidate]);
  return null;
}
export function GlobeScene({ preparedLabel, onPick, selectedCenter }: { preparedLabel?: string; onPick?: (coordinate: Coordinate) => void; selectedCenter?: Coordinate }) {
  const { active } = useProgress();
  const [close, setClose] = useState(false);
  const [reset, setReset] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const unavailable = <div className="scene-empty" role="status"><p>The 3D Moon could not load. Try again, or enter coordinates.</p><button className="secondary-button" onClick={() => { useGLTF.clear("/assets/moon-small.glb"); setAttempt(value => value + 1); }}>Retry 3D Moon</button></div>;
  return <div className="scene-wrapper globe-context" aria-label="Interactive 3D Moon viewed from the south pole">
    <SceneBoundary key={attempt} fallback={unavailable}>
      <Canvas frameloop="demand" camera={{ position: [0, -6.8, .3], up: [0, 0, 1], fov: 42, near: .01, far: 120 }} dpr={[1, 1.7]} fallback={unavailable}>
        <color attach="background" args={["#111213"]} />
        <ambientLight color="#ffffff" intensity={1.2} />
        <directionalLight color="#ffffff" position={[3, -6, 4]} intensity={2.5} />
        <Stars radius={45} depth={25} count={350} factor={1} saturation={0} fade />
        <Suspense fallback={null}><Moon onPick={onPick} selectedCenter={selectedCenter} /></Suspense>
        <OrbitControls makeDefault enablePan={false} minDistance={2.08} maxDistance={10} />
        <PolarCamera close={close} reset={reset} />
      </Canvas>
    </SceneBoundary>
    {active && <p className="moon-loading" role="status">Loading the 3D Moon model…</p>}
    <div className="polar-view-controls"><button className="secondary-button" onClick={() => { setClose(value => !value); setReset(value => value + 1); }}>{close ? "Show whole Moon" : "Zoom to south pole"}</button><button className="secondary-button" onClick={() => setReset(value => value + 1)}>Reset south-pole view</button></div>
    <div className="polar-view-caption"><strong>NASA Moon · south pole</strong><span>Inside the ring: 87–90°S · {onPick ? "click surface to select; " : ""}drag to rotate, scroll or pinch to zoom.</span><span>{preparedLabel ?? "Prepared south-pole coverage"}. Selected points are checked against scientific data.</span><small>NASA Goddard Space Flight Center / LRO · color model</small></div>
  </div>;
}
