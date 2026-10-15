import { useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type {
  Candidate,
  TerrainData,
  MapCandidate,
  MapLayer,
  PSRLayer,
  LunarFeature,
} from "../lib/types";
import { SceneBoundary } from "./SceneBoundary";
import { SceneLabel } from "./SceneLabel";

interface LayerOptions {
  layer: MapLayer;
  mapCandidates: MapCandidate[];
  psr: PSRLayer | null;
  features: LunarFeature[];
}
function pointColor(point: MapCandidate, layer: MapLayer) {
  const value =
    layer === "illumination"
      ? point.illumination_fraction
      : layer === "earth_visibility"
        ? point.earth_visibility_fraction
        : point.score / 100;
  return new THREE.Color(
    layer === "illumination"
      ? "#48402d"
      : layer === "earth_visibility"
        ? "#2e4253"
        : "#655071",
  ).lerp(
    new THREE.Color(
      layer === "illumination"
        ? "#f2d583"
        : layer === "earth_visibility"
          ? "#acd9ed"
          : "#c3e6aa",
    ),
    Math.max(0, Math.min(1, value)),
  );
}
function psrAt(psr: PSRLayer | null, x: number, y: number) {
  if (!psr) return 0;
  const [xmin, ymin, xmax, ymax] = psr.extent_m;
  const col = Math.min(
    psr.width - 1,
    Math.max(0, Math.floor(((x - xmin) / (xmax - xmin)) * psr.width)),
  );
  const row = Math.min(
    psr.height - 1,
    Math.max(0, Math.floor(((ymax - y) / (ymax - ymin)) * psr.height)),
  );
  return psr.psr_fraction[row * psr.width + col] ?? 0;
}
function featurePoint(feature: LunarFeature) {
  const rho =
    2 *
    1737400 *
    Math.tan(Math.PI / 4 + (feature.latitude_deg * Math.PI) / 360);
  const lon = (feature.longitude_deg_east * Math.PI) / 180;
  return [rho * Math.sin(lon), rho * Math.cos(lon)];
}
function CandidateCloud({
  terrain,
  points,
  layer,
  selected,
  onSelect,
}: {
  terrain: TerrainData;
  points: MapCandidate[];
  layer: MapLayer;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const geometry = useMemo(() => {
    const base = Math.min(
      ...terrain.elevations_m.filter((v): v is number => v != null),
    );
    const positions = new Float32Array(points.length * 3),
      colors = new Float32Array(points.length * 3);
    points.forEach((point, i) => {
      positions.set(
        [
          point.x_m / 1000,
          ((heightAt(terrain, point.x_m, point.y_m) - base) / 1000) * 1.5 +
            0.055,
          -point.y_m / 1000,
        ],
        i * 3,
      );
      const color =
        point.id === selected
          ? new THREE.Color("#ffffff")
          : pointColor(point, layer);
      colors.set([color.r, color.g, color.b], i * 3);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return geo;
  }, [terrain, points, layer, selected]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <points
      geometry={geometry}
      onClick={(event) => {
        event.stopPropagation();
        const point = points[event.index ?? -1];
        if (point) onSelect(point.id);
      }}
    >
      <pointsMaterial
        size={0.17}
        vertexColors
        sizeAttenuation
        transparent
        opacity={0.95}
        depthWrite={false}
      />
    </points>
  );
}

function heightAt(terrain: TerrainData, x: number, y: number) {
  const [xmin, ymin, xmax, ymax] = terrain.extent_m;
  const col = Math.max(
    0,
    Math.min(
      terrain.width - 1,
      Math.round(((x - xmin) / (xmax - xmin)) * (terrain.width - 1)),
    ),
  );
  const row = Math.max(
    0,
    Math.min(
      terrain.height - 1,
      Math.round(((ymax - y) / (ymax - ymin)) * (terrain.height - 1)),
    ),
  );
  return terrain.elevations_m[row * terrain.width + col] ?? 0;
}

function TerrainMesh({
  terrain,
  candidates,
  selected,
  onSelect,
  layer,
  mapCandidates,
  psr,
  features,
}: {
  terrain: TerrainData;
  candidates: Candidate[];
  selected: string | null;
  onSelect: (id: string) => void;
} & LayerOptions) {
  const elevation = layer === "elevation";
  const { geometry, base } = useMemo(() => {
    const {
      width,
      height,
      elevations_m,
      extent_m: [xmin, ymin, xmax, ymax],
    } = terrain;
    const values = elevations_m.filter(
      (x): x is number => x != null && Number.isFinite(x),
    );
    const minimum = Math.min(...values),
      maximum = Math.max(...values);
    const positions = new Float32Array(width * height * 3);
    const colors = new Float32Array(width * height * 3);
    const indices: number[] = [];
    const low = new THREE.Color(elevation ? "#1b3b38" : "#303a3e"),
      high = new THREE.Color(elevation ? "#a7d8a6" : "#bbc1bc");
    for (let row = 0; row < height; row++)
      for (let col = 0; col < width; col++) {
        const i = row * width + col,
          h = elevations_m[i] ?? minimum;
        positions.set(
          [
            (xmin + (col / (width - 1)) * (xmax - xmin)) / 1000,
            ((h - minimum) / 1000) * 1.5,
            -(ymax - (row / (height - 1)) * (ymax - ymin)) / 1000,
          ],
          i * 3,
        );
        const color = low
          .clone()
          .lerp(high, (h - minimum) / Math.max(1, maximum - minimum));
        if (layer === "psr") {
          const x = xmin + (col / (width - 1)) * (xmax - xmin),
            y = ymax - (row / (height - 1)) * (ymax - ymin);
          color.lerp(new THREE.Color("#a09ace"), psrAt(psr, x, y) * 0.9);
        }
        colors.set([color.r, color.g, color.b], i * 3);
        if (
          row < height - 1 &&
          col < width - 1 &&
          [i, i + 1, i + width, i + width + 1].every(
            (j) => elevations_m[j] != null,
          )
        )
          indices.push(i, i + width, i + 1, i + 1, i + width, i + width + 1);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return { geometry: geo, base: minimum };
  }, [terrain, elevation, layer, psr]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <group>
      <mesh geometry={geometry}>
        <meshStandardMaterial
          vertexColors
          roughness={0.95}
          side={THREE.DoubleSide}
        />
      </mesh>
      <gridHelper
        args={[24, 12, "#28413d", "#1a2829"]}
        position={[0, -0.08, 0]}
      />
      {["score", "illumination", "earth_visibility"].includes(layer) && (
        <CandidateCloud
          terrain={terrain}
          points={mapCandidates}
          layer={layer}
          selected={selected}
          onSelect={onSelect}
        />
      )}
      {features.map((feature) => {
        const [x, y] = featurePoint(feature);
        if (Math.abs(x) > 10000 || Math.abs(y) > 10000) return null;
        return (
          <SceneLabel
            key={feature.id}
            text={`+ ${feature.name}`}
            position={[
              x / 1000,
              ((heightAt(terrain, x, y) - base) / 1000) * 1.5 + 0.2,
              -y / 1000,
            ]}
            width={3.2}
          />
        );
      })}
      {candidates.map((site) => {
        const y =
          ((heightAt(terrain, site.x_m, site.y_m) - base) / 1000) * 1.5 + 0.12;
        const active = site.id === selected;
        return (
          <group
            key={site.id}
            position={[site.x_m / 1000, y, -site.y_m / 1000]}
          >
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.25, 0.32, 40]} />
              <meshBasicMaterial
                color={active ? "#d4ffe1" : "#92dcb6"}
                side={THREE.DoubleSide}
              />
            </mesh>
            <SceneLabel
              text={String(site.rank).padStart(2, "0")}
              selected={active}
              round
              position={[0, 0.65, 0]}
              width={0.7}
              onSelect={() => onSelect(site.id)}
            />
          </group>
        );
      })}
    </group>
  );
}

export function FlatMap({
  terrain,
  candidates,
  selected,
  onSelect,
  layer,
  mapCandidates,
  psr,
  features,
}: {
  terrain: TerrainData;
  candidates: Candidate[];
  selected: string | null;
  onSelect: (id: string) => void;
} & LayerOptions) {
  const [xmin, ymin, xmax, ymax] = terrain.extent_m;
  const values = terrain.elevations_m.filter((v): v is number => v != null),
    min = Math.min(...values),
    max = Math.max(...values);
  return (
    <div className="flat-map">
      <svg
        viewBox="0 0 600 600"
        aria-label="Top-down terrain map with candidate locations"
        role="img"
      >
        {terrain.elevations_m.map((height, i) =>
          height == null ? null : (
            <rect
              key={i}
              x={((i % terrain.width) / terrain.width) * 600}
              y={(Math.floor(i / terrain.width) / terrain.height) * 600}
              width={600 / terrain.width + 0.5}
              height={600 / terrain.height + 0.5}
              fill={`hsl(160 12% ${12 + ((height - min) / Math.max(1, max - min)) * 45}%)`}
            />
          ),
        )}
        {layer === "psr" &&
          psr &&
          psr.psr_fraction.map((fraction, i) =>
            fraction <= 0 ? null : (
              <rect
                key={`psr-${i}`}
                x={((i % psr.width) / psr.width) * 600}
                y={(Math.floor(i / psr.width) / psr.height) * 600}
                width={600 / psr.width + 0.2}
                height={600 / psr.height + 0.2}
                fill="#a09ace"
                opacity={fraction * 0.85}
              />
            ),
          )}
        {["score", "illumination", "earth_visibility"].includes(layer) &&
          mapCandidates.map((point) => (
            <circle
              key={point.id}
              cx={((point.x_m - xmin) / (xmax - xmin)) * 600}
              cy={((ymax - point.y_m) / (ymax - ymin)) * 600}
              r={point.id === selected ? 5 : 3}
              fill={`#${pointColor(point, layer).getHexString()}`}
              stroke={point.id === selected ? "white" : "none"}
              onClick={() => onSelect(point.id)}
              className="eligible-point"
            >
              <title>
                {point.id} · score {point.score.toFixed(1)} · sunlight{" "}
                {(point.illumination_fraction * 100).toFixed(1)}% · Earth{" "}
                {(point.earth_visibility_fraction * 100).toFixed(1)}%
              </title>
            </circle>
          ))}
        {features.map((feature) => {
          const [x, y] = featurePoint(feature);
          if (x < xmin || x > xmax || y < ymin || y > ymax) return null;
          return (
            <text
              className="flat-feature-label"
              x={((x - xmin) / (xmax - xmin)) * 600 + 7}
              y={((ymax - y) / (ymax - ymin)) * 600 - 8}
              key={feature.id}
            >
              + {feature.name}
            </text>
          );
        })}
        {candidates.map((site) => (
          <g
            key={site.id}
            transform={`translate(${((site.x_m - xmin) / (xmax - xmin)) * 600},${((ymax - site.y_m) / (ymax - ymin)) * 600})`}
            className={`flat-marker ${selected === site.id ? "selected" : ""}`}
            tabIndex={0}
            role="button"
            aria-label={`Inspect candidate ${site.rank}`}
            onClick={() => onSelect(site.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(site.id);
              }
            }}
          >
            <circle r="14" />
            <text textAnchor="middle" dy="5">
              {site.rank}
            </text>
          </g>
        ))}
        <g stroke="#d4e4d5" fill="#e2ede3">
          <path d="M25 568v7h150v-7" fill="none" strokeWidth="2" />
          <text x="25" y="558" stroke="none" fontSize="12">
            5 km
          </text>
        </g>
      </svg>
    </div>
  );
}

export function TerrainScene({
  terrain,
  candidates,
  selected,
  onSelect,
  mode,
  layer,
  mapCandidates,
  psr,
  features,
}: {
  terrain: TerrainData;
  candidates: Candidate[];
  selected: string | null;
  onSelect: (id: string) => void;
  mode: "terrain" | "map";
} & LayerOptions) {
  const elevation = layer === "elevation";
  const flat = (
    <FlatMap
      terrain={terrain}
      candidates={candidates}
      selected={selected}
      onSelect={onSelect}
      layer={layer}
      mapCandidates={mapCandidates}
      psr={psr}
      features={features}
    />
  );
  if (mode === "map") return flat;
  return (
    <SceneBoundary fallback={flat}>
      <Canvas
        dpr={[1, 1.7]}
        camera={{ position: [21, 19, 24], fov: 44, near: 0.1, far: 200 }}
        fallback={flat}
      >
        <color attach="background" args={["#101819"]} />
        <fog attach="fog" args={["#101819", 45, 100]} />
        <ambientLight intensity={0.5} />
        <directionalLight
          position={[-12, 20, -10]}
          intensity={2.3}
          color="#eef1de"
        />
        <directionalLight
          position={[10, 4, 15]}
          intensity={0.35}
          color="#99c4bb"
        />
        <TerrainMesh
          terrain={terrain}
          candidates={candidates}
          selected={selected}
          onSelect={onSelect}
          layer={layer}
          mapCandidates={mapCandidates}
          psr={psr}
          features={features}
        />
        <OrbitControls
          makeDefault
          target={[0, 2.0, 0]}
          minDistance={6}
          maxDistance={55}
          maxPolarAngle={Math.PI / 2.05}
        />
      </Canvas>
    </SceneBoundary>
  );
}
