import { Canvas } from "@react-three/fiber";
import { Line, OrbitControls } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import type { Candidate, TimeSample } from "../lib/types";
import { utcTime } from "../lib/format";
import { SceneLabel } from "./SceneLabel";

const skyPoint = (azimuth: number, elevation: number, radius = 4) => {
  const az = THREE.MathUtils.degToRad(azimuth),
    el = THREE.MathUtils.degToRad(elevation);
  return new THREE.Vector3(
    radius * Math.cos(el) * Math.sin(az),
    radius * Math.sin(el),
    -radius * Math.cos(el) * Math.cos(az),
  );
};

function LocalSky({ site, sample }: { site: Candidate; sample: TimeSample }) {
  const { horizon, sunPath, earthPath, tangent } = useMemo(() => {
    const step = Math.max(1, Math.floor(site.timeline.length / 300));
    const samples = site.timeline.filter((_, index) => index % step === 0);
    const profile = site.horizon.map((point) =>
      skyPoint(point.azimuth_deg, point.elevation_deg),
    );
    if (profile.length) profile.push(profile[0].clone());
    return {
      horizon: profile,
      sunPath: samples.map((point) =>
        skyPoint(point.sun_azimuth_deg, point.sun_elevation_deg),
      ),
      earthPath: samples.map((point) =>
        skyPoint(point.earth_azimuth_deg, point.earth_elevation_deg),
      ),
      tangent: Array.from({ length: 129 }, (_, i) =>
        skyPoint((i / 128) * 360, 0),
      ),
    };
  }, [site]);
  const sun = skyPoint(sample.sun_azimuth_deg, sample.sun_elevation_deg),
    earth = skyPoint(sample.earth_azimuth_deg, sample.earth_elevation_deg);
  return (
    <>
      <ambientLight intensity={1.1} />
      <directionalLight position={[4, 8, 5]} intensity={2} />
      <Line
        points={tangent}
        color="#3d6052"
        lineWidth={1}
        dashed
        dashSize={0.08}
        gapSize={0.05}
      />
      {horizon.length > 1 && (
        <Line points={horizon} color="#96af97" lineWidth={2} />
      )}
      {sunPath.length > 1 && (
        <Line
          points={sunPath}
          color="#d6b777"
          lineWidth={1.5}
          transparent
          opacity={0.6}
        />
      )}
      {earthPath.length > 1 && (
        <Line
          points={earthPath}
          color="#8bb5d6"
          lineWidth={1.5}
          transparent
          opacity={0.6}
        />
      )}
      {[0, 90, 180, 270].map((az, i) => (
        <SceneLabel
          key={az}
          text={["N", "E", "S", "W"][i]}
          position={skyPoint(az, 0, 4.5).toArray() as [number, number, number]}
          width={0.65}
        />
      ))}
      <Line
        points={[new THREE.Vector3(0, 0, 0), sun]}
        color="#d8b970"
        lineWidth={0.8}
        transparent
        opacity={0.4}
      />
      <Line
        points={[new THREE.Vector3(0, 0, 0), earth]}
        color="#91bfdc"
        lineWidth={0.8}
        transparent
        opacity={0.4}
      />
      <mesh position={sun}>
        <sphereGeometry args={[0.13, 24, 24]} />
        <meshBasicMaterial color="#f0cd79" />
      </mesh>
      <mesh position={earth}>
        <sphereGeometry args={[0.13, 24, 24]} />
        <meshStandardMaterial color="#76add0" roughness={0.8} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.055, 16, 16]} />
        <meshBasicMaterial color="#c7e4cb" />
      </mesh>
      <SceneLabel
        text={`Sun · ${sample.sun_elevation_deg.toFixed(1)}°`}
        color="#e2be77"
        position={[sun.x, sun.y + 0.38, sun.z]}
        width={1.7}
      />
      <SceneLabel
        text={`Earth · ${sample.earth_elevation_deg.toFixed(1)}°`}
        color="#94c4df"
        position={[earth.x, earth.y + 0.4, earth.z]}
        width={1.7}
      />
      <OrbitControls
        enablePan={false}
        target={[0, 0, 0]}
        minDistance={5}
        maxDistance={18}
      />
    </>
  );
}

export function SkyScene({
  site,
  sample,
}: {
  site: Candidate;
  sample: TimeSample;
}) {
  return (
    <div className="scene-wrapper sky-context">
      <Canvas
        dpr={[1, 1.7]}
        camera={{ position: [6.5, 4.8, 7.5], fov: 43 }}
        fallback={
          <div className="scene-empty">
            Use the horizon chart below for the same local sky data.
          </div>
        }
      >
        <color attach="background" args={["#101819"]} />
        <LocalSky site={site} sample={sample} />
      </Canvas>
      <div className="sky-context-caption">
        <span className="eyebrow">LOCAL SKY · EAST / NORTH / UP</span>
        <strong>{utcTime(sample.time_utc)}</strong>
        <span>Sun / Earth paths across the common mission window.</span>
        <span>Green: sampled terrain horizon. Dashed: local tangent.</span>
        <a href="#analysis-title">
          Use the site timeline to play or scrub time ↓
        </a>
      </div>
      <div className="scene-caption">
        Direction diagram · equal display radius · object sizes not to scale ·
        drag to orbit
      </div>
    </div>
  );
}
