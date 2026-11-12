import { useGLTF } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import * as THREE from "three";

/** Keep the NASA model's native cube-atlas UVs, rather than stretching them over a sphere. */
export function CelestialBody({ body, radius = 1 }: { body: "earth" | "sun"; radius?: number }) {
  const { scene } = useGLTF(`/assets/${body}-visual.glb`);
  const object = useMemo(() => {
    const copy = scene.clone(true);
    const bounds = new THREE.Box3().setFromObject(copy);
    const center = bounds.getCenter(new THREE.Vector3());
    const scale = 2 / Math.max(...bounds.getSize(new THREE.Vector3()).toArray());
    copy.scale.multiply(new THREE.Vector3(-scale, scale, scale));
    copy.position.set(-center.x * copy.scale.x, -center.y * copy.scale.y, -center.z * copy.scale.z);
    copy.traverse(node => {
      if (node instanceof THREE.Mesh) {
        const original = node.material as THREE.MeshStandardMaterial;
        node.material = body === "sun" ? new THREE.MeshBasicMaterial({ map: original.map, color: "#fff2d6", toneMapped: false }) : new THREE.MeshStandardMaterial({ map: original.map, roughness: .85, metalness: 0 });
      }
    });
    return copy;
  }, [scene, body]);
  useEffect(() => () => object.traverse(node => { if (node instanceof THREE.Mesh) (node.material as THREE.Material).dispose(); }), [object]);
  return <group scale={radius}><primitive object={object} />{body === "sun" && <mesh scale={1.28}><sphereGeometry args={[1, 48, 32]} /><shaderMaterial transparent depthWrite={false} side={THREE.BackSide} blending={THREE.AdditiveBlending} vertexShader="varying vec3 n; varying vec3 v; void main(){ vec4 p=modelViewMatrix*vec4(position,1.0); n=normalize(normalMatrix*normal); v=normalize(-p.xyz); gl_Position=projectionMatrix*p; }" fragmentShader="varying vec3 n; varying vec3 v; void main(){ float glow=pow(max(0.0,1.0-abs(dot(normalize(n),normalize(v)))),3.0); gl_FragColor=vec4(1.0,0.39,0.06,glow*0.32); }" /></mesh>}{body === "earth" && <mesh scale={1.025}><sphereGeometry args={[1, 48, 32]} /><shaderMaterial transparent depthWrite={false} side={THREE.BackSide} blending={THREE.AdditiveBlending} vertexShader="varying vec3 n; varying vec3 v; void main(){ vec4 p=modelViewMatrix*vec4(position,1.0); n=normalize(normalMatrix*normal); v=normalize(-p.xyz); gl_Position=projectionMatrix*p; }" fragmentShader="varying vec3 n; varying vec3 v; void main(){ float glow=pow(max(0.0,1.0-abs(dot(normalize(n),normalize(v)))),3.0); gl_FragColor=vec4(0.2,0.58,1.0,glow*0.38); }" /></mesh>}</group>;
}
