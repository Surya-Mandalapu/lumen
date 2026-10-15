import { Line, OrbitControls, Stars, useGLTF } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense, useMemo } from "react";
import * as THREE from "three";

function Moon() {
  const { scene } = useGLTF("/assets/moon-small.glb");
  const object = useMemo(() => {
    const copy = scene.clone(true);
    const box = new THREE.Box3().setFromObject(copy);
    const size = box.getSize(new THREE.Vector3());
    copy.scale.setScalar(4 / Math.max(size.x, size.y, size.z));
    return copy;
  }, [scene]);
  const points = useMemo(
    () =>
      Array.from({ length: 129 }, (_, index) => {
        const angle = (index / 128) * Math.PI * 2;
        return new THREE.Vector3(
          Math.cos(angle) * 0.105,
          -1.998,
          Math.sin(angle) * 0.105,
        );
      }),
    [],
  );
  return (
    <group rotation={[0.85, -0.5, -0.35]}>
      <primitive object={object} />
      <Line points={points} color="#9ce2bf" lineWidth={3} />
    </group>
  );
}

export function GlobeScene() {
  return (
    <div className="scene-wrapper globe-context">
      <Canvas
        camera={{ position: [0, 0, 6.8], fov: 42 }}
        dpr={[1, 1.7]}
        fallback={
          <div className="scene-empty">
            3D context needs WebGL. Candidate metrics remain available below.
          </div>
        }
      >
        <ambientLight intensity={0.8} />
        <directionalLight position={[5, 3, 5]} intensity={2.5} />
        <Stars
          radius={45}
          depth={25}
          count={600}
          factor={1}
          saturation={0}
          fade
        />
        <Suspense fallback={null}>
          <Moon />
        </Suspense>
        <OrbitControls enablePan={false} minDistance={4} maxDistance={10} />
      </Canvas>
      <div className="scene-caption">
        NASA GSFC / LRO color model · contextual geometry
      </div>
      <div className="globe-note">
        <span className="eyebrow">OUR STUDY AREA</span>
        <h3>
          A small region.
          <br />A different horizon.
        </h3>
        <p>
          South pole · 87°S–90°S planned coverage
          <br />
          <strong>20 × 20 km prepared in this MVP</strong>
        </p>
        <p className="small muted">
          The mint ring marks 87°S. Global context only; it is not the analysis
          terrain.
        </p>
      </div>
    </div>
  );
}
