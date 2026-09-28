import { Line, OrbitControls, Stars } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";

function SupportedBoundary() {
  const points = useMemo(() => {
    const latitude = THREE.MathUtils.degToRad(-87);
    const radius = 2;
    const ringRadius = Math.cos(latitude) * radius;
    const y = Math.sin(latitude) * radius;

    return Array.from({ length: 129 }, (_, index) => {
      const longitude = (index / 128) * Math.PI * 2;
      return new THREE.Vector3(
        Math.cos(longitude) * ringRadius,
        y,
        Math.sin(longitude) * ringRadius,
      );
    });
  }, []);

  return <Line points={points} color="#f4c95d" lineWidth={2.5} />;
}

function ContextScene() {
  return (
    <>
      <color attach="background" args={["#040912"]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 3, 5]} intensity={2.8} color="#fff4ce" />
      <Stars radius={45} depth={25} count={800} factor={2} saturation={0} fade />

      <group rotation={[0.2, -0.4, 0]}>
        <mesh>
          <sphereGeometry args={[2, 96, 96]} />
          <meshStandardMaterial color="#aeb7bd" roughness={0.96} metalness={0.02} />
        </mesh>
        <mesh position={[-0.8, 0.85, 1.82]}>
          <sphereGeometry args={[0.3, 36, 36]} />
          <meshStandardMaterial color="#7e878e" roughness={1} />
        </mesh>
        <mesh position={[0.75, -0.2, 1.9]}>
          <sphereGeometry args={[0.2, 32, 32]} />
          <meshStandardMaterial color="#8b949a" roughness={1} />
        </mesh>
        <SupportedBoundary />
      </group>

      <mesh position={[5.2, 1.2, -1.5]}>
        <sphereGeometry args={[0.32, 32, 32]} />
        <meshStandardMaterial color="#5b93d3" emissive="#163d6c" emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[-7, 2.6, -4]}>
        <sphereGeometry args={[0.55, 32, 32]} />
        <meshBasicMaterial color="#f4c95d" />
      </mesh>

      <OrbitControls enablePan={false} minDistance={3.5} maxDistance={8} />
    </>
  );
}

export function GlobeScene() {
  return (
    <div className="globe-shell" aria-label="Interactive contextual Moon view">
      <Canvas camera={{ position: [0, 0.4, 5.2], fov: 42 }}>
        <ContextScene />
      </Canvas>
      <div className="scale-badge">Context view · not to scale</div>
      <div className="boundary-key"><span /> Supported analysis: 87°S–90°S</div>
    </div>
  );
}

