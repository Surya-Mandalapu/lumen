import { Bvh, Html, Line, useTexture } from "@react-three/drei";
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { lunarCircle, lunarCoordinate, lunarDragRadius, lunarPoint } from "../lib/lunar-picking";
import type { SceneSite } from "../lib/scene-geometry";
import { terrainRadius } from "../lib/scene-geometry";
import type { LunarCoordinate } from "../lib/hemisphere";
import type { LunarFeature } from "../lib/types";

export const TopographicMoon = memo(function TopographicMoon({ exaggeration, features, labels, selectedCenter, radiusKm, onPick, onLandmark, drawMode = false, maximumRadiusKm = 5, onArea, onDrawFeedback, onDrawEnd, sites = [], selectedSite, onSiteSelect, onSiteBounds }: {
  exaggeration: number; features: LunarFeature[]; labels: boolean; selectedCenter?: LunarCoordinate; radiusKm?: number;
  onPick?: (point: LunarCoordinate) => void; onLandmark?: (feature: LunarFeature) => void;
  sites?: SceneSite[]; selectedSite?: string | null; onSiteSelect?: (id: string) => void; onSiteBounds?: (bounds: THREE.Sphere) => void;
  drawMode?: boolean; maximumRadiusKm?: number; onArea?: (center: LunarCoordinate, radiusKm: number) => void;
  onDrawFeedback?: (message: string) => void; onDrawEnd?: () => void;
}) {
  const texture = useTexture("/assets/moon-color.jpg");
  const buffer = useLoader(THREE.FileLoader, "/assets/moon-height.i16", loader => loader.setResponseType("arraybuffer")) as unknown as ArrayBuffer;
  const grid = useMemo(() => new Int16Array(buffer), [buffer]);
  const width = useThree(state => state.size.width);
  const mesh = useRef<THREE.Mesh>(null);
  const siteCloud = useRef<THREE.InstancedMesh>(null);
  const pin = useRef<THREE.Mesh>(null);
  const group = useRef<THREE.Group>(null);
  const labelElements = useRef(new Map<string, HTMLElement>());
  const { camera, gl, controls, invalidate } = useThree();
  const [draft, setDraft] = useState<{ center: LunarCoordinate; radiusKm: number } | null>(null);
  const suppressClickUntil = useRef(0);
  const callbacks = useRef({ onArea, onDrawFeedback, onDrawEnd });
  callbacks.current = { onArea, onDrawFeedback, onDrawEnd };
  const baseGeometry = useMemo(() => {
    // Uniform-area triangles avoid the needle-shaped polar wedges of a UV sphere.
    const source = new THREE.IcosahedronGeometry(2, width < 650 ? 79 : 127);
    const sourcePositions = source.getAttribute("position"), uv = source.getAttribute("uv");
    for (let i = 0; i < sourcePositions.count; i++) {
      const coordinate = lunarCoordinate(sourcePositions.getX(i), sourcePositions.getY(i), sourcePositions.getZ(i))!;
      uv.setXY(i, (coordinate.longitude_deg_east + 180) / 360, (coordinate.latitude_deg + 90) / 180);
    }
    // Unwrap each seam-crossing triangle before welding shared vertices.
    for (let i = 0; i < uv.count; i += 3) {
      const values = [uv.getX(i), uv.getX(i + 1), uv.getX(i + 2)];
      if (Math.max(...values) - Math.min(...values) > .5) for (let j = 0; j < 3; j++) if (values[j] < .5) uv.setX(i + j, values[j] + 1);
      for (let j = 0; j < 3; j++) if (Math.abs(sourcePositions.getY(i + j)) > 1.999999) uv.setX(i + j, (uv.getX(i + (j + 1) % 3) + uv.getX(i + (j + 2) % 3)) / 2);
    }
    source.deleteAttribute("normal");
    const shape = mergeVertices(source, 1e-5); source.dispose();
    return shape;
  }, [width < 650]);
  const geometry = useMemo(() => {
    let shape = baseGeometry.clone();
    if (sites.length) {
      // Refine only near the site cloud. A whole-globe mesh's triangles are too
      // large for a kilometer-scale close-up, especially at the pole/UV seam.
      const cloud = sites.map(site => new THREE.Vector3(...lunarPoint(site.latitude_deg, site.longitude_deg_east, 2)));
      const center = cloud.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(cloud.length);
      const spread = Math.max(...cloud.map(point => point.distanceTo(center)));
      const region = spread * 1.5 + .025, edgeLimit = Math.max(.0008, spread / 25);
      const source = baseGeometry.toNonIndexed(), points = source.getAttribute("position");
      const vertices: number[] = [], coordinates: number[] = [];
      const emit = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, depth: number) => {
        const edge = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
        if (depth < 6 && edge > edgeLimit && a.clone().add(b).add(c).divideScalar(3).distanceTo(center) < region + edge) {
          const ab = a.clone().add(b).normalize().multiplyScalar(2), bc = b.clone().add(c).normalize().multiplyScalar(2), ca = c.clone().add(a).normalize().multiplyScalar(2);
          emit(a, ab, ca, depth + 1); emit(ab, b, bc, depth + 1); emit(ca, bc, c, depth + 1); emit(ab, bc, ca, depth + 1);
          return;
        }
        const triangle = [a, b, c], uv = triangle.map(point => {
          const coordinate = lunarCoordinate(point.x, point.y, point.z)!;
          return [(coordinate.longitude_deg_east + 180) / 360, (coordinate.latitude_deg + 90) / 180];
        });
        if (Math.max(...uv.map(point => point[0])) - Math.min(...uv.map(point => point[0])) > .5) for (const point of uv) if (point[0] < .5) point[0] += 1;
        triangle.forEach((point, i) => {
          if (Math.abs(point.y) > 1.999999) uv[i][0] = (uv[(i + 1) % 3][0] + uv[(i + 2) % 3][0]) / 2;
          vertices.push(point.x, point.y, point.z); coordinates.push(...uv[i]);
        });
      };
      for (let i = 0; i < points.count; i += 3) emit(new THREE.Vector3().fromBufferAttribute(points, i), new THREE.Vector3().fromBufferAttribute(points, i + 1), new THREE.Vector3().fromBufferAttribute(points, i + 2), 0);
      source.dispose(); shape.dispose();
      const refined = new THREE.BufferGeometry(); refined.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3)); refined.setAttribute("uv", new THREE.Float32BufferAttribute(coordinates, 2));
      shape = mergeVertices(refined, 1e-6); refined.dispose();
    }
    const positions = shape.getAttribute("position");
    for (let i = 0; i < positions.count; i++) {
      const coordinate = lunarCoordinate(positions.getX(i), positions.getY(i), positions.getZ(i))!;
      positions.setXYZ(i, ...lunarPoint(coordinate.latitude_deg, coordinate.longitude_deg_east, terrainRadius(grid, coordinate, exaggeration)));
    }
    shape.computeVertexNormals(); shape.computeBoundingSphere();
    return shape;
  }, [grid, exaggeration, baseGeometry, sites]);
  useEffect(() => () => baseGeometry.dispose(), [baseGeometry]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => { texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = THREE.RepeatWrapping; texture.anisotropy = 4; texture.needsUpdate = true; }, [texture]);
  useEffect(() => {
    const canvas = gl.domElement, surface = canvas.closest<HTMLElement>(".orbital-canvas") ?? canvas, ray = new THREE.Raycaster();
    (ray as THREE.Raycaster & { firstHitOnly: boolean }).firstHitOnly = true;
    let drag: { id: number; center: LunarCoordinate; x: number; y: number; enabled: boolean } | null = null;
    const pick = (event: PointerEvent) => {
      if (!mesh.current) return null;
      const rect = canvas.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return null;
      ray.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
      const hit = ray.intersectObject(mesh.current, false)[0];
      if (!hit) return null;
      const local = mesh.current.worldToLocal(hit.point.clone());
      return lunarCoordinate(local.x, local.y, local.z);
    };
    const stop = (event: PointerEvent) => { event.preventDefault(); event.stopImmediatePropagation(); };
    const finish = (message: string) => {
      if (!drag) return;
      const previous = drag; drag = null;
      if (controls && "enabled" in controls) controls.enabled = previous.enabled;
      if (canvas.hasPointerCapture(previous.id)) canvas.releasePointerCapture(previous.id);
      suppressClickUntil.current = performance.now() + 500;
      setDraft(null); callbacks.current.onDrawFeedback?.(message); callbacks.current.onDrawEnd?.(); invalidate();
    };
    const down = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("button, input, select, summary") && !target.closest(".moon-landmark")) return;
      if (!callbacks.current.onArea || !(event.button === 2 || (drawMode && event.button === 0))) return;
      stop(event);
      suppressClickUntil.current = performance.now() + 500;
      if (drag) { finish("Area selection cancelled. Use one pointer to draw."); return; }
      const center = pick(event);
      if (!center || center.latitude_deg > 0) { callbacks.current.onDrawFeedback?.("Start your search circle on the Moon’s southern hemisphere."); return; }
      drag = { id: event.pointerId, center, x: event.clientX, y: event.clientY, enabled: controls && "enabled" in controls ? Boolean(controls.enabled) : true };
      if (controls && "enabled" in controls) controls.enabled = false;
      canvas.setPointerCapture(event.pointerId); suppressClickUntil.current = Infinity;
      setDraft({ center, radiusKm: 1 });
      callbacks.current.onDrawFeedback?.(`Drag from the center to the edge · 1–${maximumRadiusKm} km radius · Esc cancels`); invalidate();
    };
    const move = (event: PointerEvent) => {
      if (!drag || drag.id !== event.pointerId) return;
      stop(event);
      const edge = pick(event);
      if (!edge) { callbacks.current.onDrawFeedback?.("Move back onto the Moon. Releasing here cancels the selection."); return; }
      const result = lunarDragRadius(drag.center, edge, maximumRadiusKm);
      setDraft({ center: drag.center, radiusKm: result.radiusKm });
      callbacks.current.onDrawFeedback?.(`${result.radiusKm.toFixed(2)} km radius${result.limited ? ` · ${maximumRadiusKm} km search limit reached; zoom in for a smaller area` : " · release to select"}`); invalidate();
    };
    const up = (event: PointerEvent) => {
      if (!drag || drag.id !== event.pointerId) return;
      stop(event);
      const edge = pick(event), center = drag.center;
      if (!edge || Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 4) { finish("Area selection cancelled. Drag from the center to the edge of your search circle."); return; }
      const result = lunarDragRadius(center, edge, maximumRadiusKm);
      const radiusKm = Number(result.radiusKm.toFixed(2));
      finish(`Search area selected · ${result.radiusKm.toFixed(2)} km radius${result.limited ? ` · limited to ${maximumRadiusKm} km` : ""}`);
      callbacks.current.onArea?.(center, radiusKm);
    };
    const cancel = () => finish("Area selection cancelled; your previous area is unchanged.");
    const key = (event: KeyboardEvent) => { if (event.key === "Escape" && drag) { event.preventDefault(); event.stopImmediatePropagation(); cancel(); } };
    const context = (event: MouseEvent) => { if (callbacks.current.onArea && !(event.target as HTMLElement).closest(".scene-navigation")) event.preventDefault(); };
    surface.addEventListener("pointerdown", down, true); surface.addEventListener("pointermove", move, true); surface.addEventListener("pointerup", up, true);
    surface.addEventListener("pointercancel", cancel); surface.addEventListener("lostpointercapture", cancel); surface.addEventListener("contextmenu", context); window.addEventListener("keydown", key, true); window.addEventListener("blur", cancel);
    return () => {
      surface.removeEventListener("pointerdown", down, true); surface.removeEventListener("pointermove", move, true); surface.removeEventListener("pointerup", up, true);
      surface.removeEventListener("pointercancel", cancel); surface.removeEventListener("lostpointercapture", cancel); surface.removeEventListener("contextmenu", context); window.removeEventListener("keydown", key, true); window.removeEventListener("blur", cancel);
      cancel();
    };
  }, [camera, gl, controls, drawMode, maximumRadiusKm, geometry, invalidate]);
  const sitePositions = useMemo(() => sites.map(site => new THREE.Vector3(...lunarPoint(site.latitude_deg, site.longitude_deg_east, terrainRadius(grid, site, exaggeration) + .0005))), [sites, grid, exaggeration]);
  const siteBounds = useMemo(() => sitePositions.length ? new THREE.Box3().setFromPoints(sitePositions).getBoundingSphere(new THREE.Sphere()) : null, [sitePositions]);
  useEffect(() => { if (siteBounds) onSiteBounds?.(siteBounds); }, [siteBounds, onSiteBounds]);
  useEffect(() => {
    if (!siteCloud.current || !siteBounds) return;
    const transform = new THREE.Object3D(), color = new THREE.Color();
    sites.forEach((site, i) => {
      transform.position.copy(sitePositions[i]); transform.scale.setScalar(Math.max(.00008, siteBounds.radius / 80) * (site.id === selectedSite ? 2 : 1)); transform.updateMatrix();
      siteCloud.current!.setMatrixAt(i, transform.matrix);
      color.set(site.id === selectedSite ? "#ffffff" : site.rank ? "#f6d68c" : "#79d8b6"); siteCloud.current!.setColorAt(i, color);
    });
    siteCloud.current.instanceMatrix.needsUpdate = true;
    if (siteCloud.current.instanceColor) siteCloud.current.instanceColor.needsUpdate = true;
    siteCloud.current.computeBoundingSphere(); invalidate();
  }, [sites, sitePositions, siteBounds, selectedSite, invalidate]);
  const graticule = useMemo(() => {
    const point = (lat: number, lon: number) => lunarPoint(lat, lon, terrainRadius(grid, { latitude_deg: lat, longitude_deg_east: lon }, exaggeration) + .009);
    return [
      ...[-60, -30, 0, 30, 60].map(lat => ({ key: `lat-${lat}`, equator: lat === 0, points: Array.from({ length: 361 }, (_, i) => point(lat, i - 180)) })),
      ...Array.from({ length: 12 }, (_, index) => ({ key: `lon-${index}`, equator: false, points: Array.from({ length: 181 }, (_, i) => point(i - 90, index * 30 - 180)) })),
    ];
  }, [grid, exaggeration]);
  const marker = !sites.length && selectedCenter ? lunarPoint(selectedCenter.latitude_deg, selectedCenter.longitude_deg_east, terrainRadius(grid, selectedCenter, exaggeration) + .025) : undefined;
  const outlineCenter = draft?.center ?? selectedCenter, outlineRadius = draft?.radiusKm ?? radiusKm;
  const outline = outlineCenter && outlineRadius ? lunarCircle(outlineCenter.latitude_deg, outlineCenter.longitude_deg_east, outlineRadius).map(point => {
    const coordinate = lunarCoordinate(...point)!;
    return lunarPoint(coordinate.latitude_deg, coordinate.longitude_deg_east, terrainRadius(grid, coordinate, exaggeration) + .015);
  }) : undefined;
  const labelPoints = useMemo(() => {
    const entries = features.map(feature => ({ id: feature.id, name: feature.name, feature, point: new THREE.Vector3(...lunarPoint(feature.latitude_deg, feature.longitude_deg_east, terrainRadius(grid, feature, exaggeration) + .018)) }));
    if (selectedCenter) entries.sort((a, b) => a.point.distanceTo(new THREE.Vector3(...lunarPoint(selectedCenter.latitude_deg, selectedCenter.longitude_deg_east))) - b.point.distanceTo(new THREE.Vector3(...lunarPoint(selectedCenter.latitude_deg, selectedCenter.longitude_deg_east))));
    return entries;
  }, [features, grid, exaggeration, selectedCenter?.latitude_deg, selectedCenter?.longitude_deg_east]);
  const gridLabels = useMemo(() => [
    ...[0, 90, 180, -90].map(lon => ({ id: `equator-${lon}`, name: "Equator · 0°", point: new THREE.Vector3(...lunarPoint(0, lon, terrainRadius(grid, { latitude_deg: 0, longitude_deg_east: lon }, exaggeration) + .025)) })),
    ...[-60, -30, 30, 60].map(lat => ({ id: `parallel-${lat}`, name: `${Math.abs(lat)}°${lat < 0 ? "S" : "N"}`, point: new THREE.Vector3(...lunarPoint(lat, 0, terrainRadius(grid, { latitude_deg: lat, longitude_deg_east: 0 }, exaggeration) + .025)) })),
  ], [grid, exaggeration]);
  useFrame(({ camera, size }) => {
    if (!group.current) return;
    const localCamera = group.current.worldToLocal(camera.position.clone());
    if (pin.current && marker) pin.current.scale.setScalar(Math.max(.08, Math.min(1.2, localCamera.distanceTo(new THREE.Vector3(...marker)) / 10)));
    const occupied: { x: number; y: number; width: number }[] = [];
    const entries = marker ? [{ id: "site", name: "Your site", point: new THREE.Vector3(...marker) }, ...labelPoints] : [...labelPoints];
    entries.push(...gridLabels);
    for (const item of entries) {
      const element = labelElements.current.get(item.id); if (!element) continue;
      const projected = group.current.localToWorld(item.point.clone()).project(camera);
      const x = projected.x * size.width / 2, y = projected.y * size.height / 2, width = item.name.length * 7 + 20;
      const visible = localCamera.dot(item.point) > item.point.lengthSq() + .01 && Math.abs(projected.x) < .95 && Math.abs(projected.y) < .88 && !occupied.some(other => Math.abs(x - other.x) < (width + other.width) / 2 && Math.abs(y - other.y) < 28);
      element.style.visibility = visible ? "visible" : "hidden";
      if (visible) occupied.push({ x, y, width });
    }
  });
  return <group ref={group}>
    <Bvh firstHitOnly strategy={0} key={`${exaggeration}-${width < 650}`}><mesh ref={mesh} geometry={geometry} onClick={event => {
      if (!onPick || event.delta > 5 || event.button !== 0 || performance.now() < suppressClickUntil.current) return;
      event.stopPropagation();
      const local = event.object.worldToLocal(event.point.clone());
      const coordinate = lunarCoordinate(local.x, local.y, local.z);
      if (coordinate) onPick(coordinate);
    }}><meshStandardMaterial map={texture} roughness={1} metalness={0} onBeforeCompile={shader => {
      shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", `#include <map_fragment>
        float poleDistance = min(vMapUv.y, 1.0 - vMapUv.y);
        if (poleDistance < 0.0014) {
          vec3 polarColor = vec3(0.0);
          for (int sampleIndex = 0; sampleIndex < 8; sampleIndex++) {
            polarColor += texture2D(map, vec2((float(sampleIndex) + 0.5) / 8.0, vMapUv.y)).rgb / 8.0;
          }
          diffuseColor.rgb = mix(polarColor, diffuseColor.rgb, smoothstep(0.0, 0.0014, poleDistance));
        }
      `);
    }} /></mesh></Bvh>
    {sites.length > 0 && <instancedMesh key={sites.length} ref={siteCloud} args={[undefined, undefined, sites.length]} onClick={event => { event.stopPropagation(); if (event.delta < 5 && event.instanceId !== undefined) onSiteSelect?.(sites[event.instanceId].id); }}><sphereGeometry args={[1, 10, 8]} /><meshBasicMaterial /></instancedMesh>}
    {sites.filter(site => site.rank && site.rank <= 10).map(site => { const i = sites.indexOf(site); return <Html key={site.id} position={sitePositions[i]} center style={{ pointerEvents: "none" }} zIndexRange={[42, 0]}><button className="candidate-site-label" aria-label={`Select mapped candidate ${site.rank}`} aria-pressed={site.id === selectedSite} onClick={() => onSiteSelect?.(site.id)}>{site.rank}</button></Html>; })}
    {graticule.map(line => <Line key={line.key} points={line.points} color={line.equator ? "#efc97c" : "#a8c5c3"} opacity={line.equator ? .9 : .25} transparent lineWidth={line.equator ? 2 : .7} raycast={() => {}} />)}
    <Line points={Array.from({ length: 129 }, (_, index) => {
      const longitude = index / 128 * 360 - 180;
      return lunarPoint(-87, longitude, terrainRadius(grid, { latitude_deg: -87, longitude_deg_east: longitude }, exaggeration) + .012);
    })} color="#90c9ae" opacity={.6} transparent lineWidth={1} />
    {gridLabels.map(item => <Html style={{ pointerEvents: "none" }} key={item.id} position={item.point} center zIndexRange={[32, 0]}><span className="moon-grid-label" ref={element => { if (element) labelElements.current.set(item.id, element); else labelElements.current.delete(item.id); }}>{item.name}</span></Html>)}
    {marker && <><mesh ref={pin} position={marker}><sphereGeometry args={[.022, 16, 16]} /><meshBasicMaterial color="#f6d68c" /></mesh><Html style={{ pointerEvents: "none" }} position={marker} center zIndexRange={[40, 0]}><span ref={element => { if (element) labelElements.current.set("site", element); else labelElements.current.delete("site"); }} className="site-marker-label">Your site</span></Html></>}
    {draft && <mesh position={lunarPoint(draft.center.latitude_deg, draft.center.longitude_deg_east, terrainRadius(grid, draft.center, exaggeration) + .025)} raycast={() => {}}><sphereGeometry args={[.012, 12, 12]} /><meshBasicMaterial color="#96e2cf" /></mesh>}
    {outline && <Line points={outline} color={draft ? "#96e2cf" : "#f6d68c"} lineWidth={draft ? 3 : 2} raycast={() => {}} />}
    {labels && !drawMode && !draft && labelPoints.map(({ feature, point }) => <Html style={{ pointerEvents: "none" }} key={feature.id} position={point} center zIndexRange={[35, 0]}><button ref={element => { if (element) labelElements.current.set(feature.id, element); else labelElements.current.delete(feature.id); }} className="moon-landmark" onClick={event => { event.stopPropagation(); onLandmark?.(feature); }} title={`${feature.name} · IAU landmark center`}>{feature.name}</button></Html>)}
  </group>;
});
