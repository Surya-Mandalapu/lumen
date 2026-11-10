import type {
  LunarFeature,
  RegionManifest,
  SearchRequest,
  TerrainData,
} from "../lib/types";
import {
  footprintOverlap,
  selectedCircle,
  unprojectPolar,
} from "../lib/coverage";

export function CoveragePreview({
  terrain,
  manifest,
  request,
  features,
  onChange,
}: {
  terrain: TerrainData | null;
  manifest: RegionManifest | null;
  request: SearchRequest;
  features: LunarFeature[];
  onChange: (request: SearchRequest) => void;
}) {
  const extent = terrain?.extent_m;
  const circle = selectedCircle(request.region, features);
  const overlap = extent && circle ? footprintOverlap(circle, extent) : null;
  const unresolved =
    request.region.selector_type !== "full_supported_region" && !circle;
  const status = !extent
    ? "Coverage unavailable"
    : unresolved
      ? "Choose a center and radius"
      : overlap === "outside"
        ? "Outside prepared footprint"
        : overlap === "partial"
          ? "Partial footprint overlap"
          : "Within prepared footprint";
  const size = extent
    ? Math.max(extent[2] - extent[0], extent[3] - extent[1]) * 1.5
    : 30000;
  const cx = extent ? (extent[0] + extent[2]) / 2 : 0;
  const cy = extent ? (extent[1] + extent[3]) / 2 : 0;
  const select = (x: number, y: number) => {
    const center = unprojectPolar(x, y);
    const longitude = Number(center.longitude_deg_east.toFixed(3));
    onChange({
      ...request,
      region: {
        selector_type: "circle",
        center: {
          latitude_deg: Number(center.latitude_deg.toFixed(3)),
          longitude_deg_east: longitude >= 180 ? -180 : longitude,
        },
        search_radius_km: request.region.search_radius_km ?? 3,
      },
    });
  };
  const hours =
    (Date.parse(request.time_range.end_utc) -
      Date.parse(request.time_range.start_utc)) /
    3600000;
  return (
    <details className="coverage-preview">
      <summary>
        Study area & data coverage <span>{status}</span>
      </summary>
      <div className="coverage-preview-body">
        <div>
          <button
            type="button"
            className="coverage-map"
            disabled={!extent}
            aria-label="Select study-area center. Click the map, or use arrow keys to move the center 500 metres. Enter selects the current center."
            onClick={(event) => {
              if (!event.detail) {
                select(circle?.x ?? 0, circle?.y ?? 3000);
                return;
              }
              const rect = event.currentTarget.getBoundingClientRect();
              select(
                cx + ((event.clientX - rect.left) / rect.width - 0.5) * size,
                cy + (0.5 - (event.clientY - rect.top) / rect.height) * size,
              );
            }}
            onKeyDown={(event) => {
              const shifts: Record<string, [number, number]> = {
                ArrowLeft: [-500, 0],
                ArrowRight: [500, 0],
                ArrowUp: [0, 500],
                ArrowDown: [0, -500],
              };
              const shift = shifts[event.key];
              if (shift) {
                event.preventDefault();
                select(
                  Math.max(
                    cx - size / 2,
                    Math.min(cx + size / 2, (circle?.x ?? 0) + shift[0]),
                  ),
                  Math.max(
                    cy - size / 2,
                    Math.min(cy + size / 2, (circle?.y ?? 3000) + shift[1]),
                  ),
                );
              }
            }}
          >
            <svg
              viewBox={`${cx - size / 2} ${-cy - size / 2} ${size} ${size}`}
              aria-hidden="true"
            >
              <rect
                x={cx - size / 2}
                y={-cy - size / 2}
                width={size}
                height={size}
                fill="#1d2926"
              />
              {extent && (
                <rect
                  x={extent[0]}
                  y={-extent[3]}
                  width={extent[2] - extent[0]}
                  height={extent[3] - extent[1]}
                  fill="#355d4c"
                  stroke="#9ce2bf"
                  strokeWidth={size / 200}
                />
              )}
              {circle && (
                <circle
                  cx={circle.x}
                  cy={-circle.y}
                  r={circle.radius}
                  fill="#e0c792"
                  fillOpacity="0.15"
                  stroke="#e0c792"
                  strokeWidth={size / 150}
                />
              )}
              {circle && (
                <circle
                  cx={circle.x}
                  cy={-circle.y}
                  r={size / 100}
                  fill="#e0c792"
                />
              )}
              <path
                d={`M -350 0 H 350 M 0 -350 V 350`}
                stroke="#caddcb"
                strokeWidth={size / 250}
              />
              <text
                x={cx}
                y={-cy - size * 0.4}
                textAnchor="middle"
                fill="#caddcb"
                fontSize={size / 24}
              >
                +Y · 0°E
              </text>
            </svg>
          </button>
          <p className="field-hint">
            Green: prepared candidate footprint. Gold: selected circle. Outside:
            analysis unavailable. Click to set a center; edit the radius in
            Study area.
          </p>
        </div>
        <div className="coverage-facts">
          <strong role="status">{status}</strong>
          <p>
            {overlap === "partial"
              ? "The search will evaluate only prepared candidates inside your circle. The uncovered portion has no results."
              : overlap === "outside"
                ? "This preview finds no overlap. Choose a location in the green footprint before searching."
                : "The footprint preview is approximate; exact spherical candidate membership is determined during analysis."}
          </p>
          <dl>
            <div>
              <dt>Geographic coverage</dt>
              <dd>
                {extent
                  ? `${((extent[2] - extent[0]) / 1000).toFixed(0)} × ${((extent[3] - extent[1]) / 1000).toFixed(0)} km prepared square`
                  : "Unavailable"}
              </dd>
            </div>
            <div>
              <dt>Candidate spacing</dt>
              <dd>{manifest?.analysis.candidate_spacing_m ?? "—"} m</dd>
            </div>
            <div>
              <dt>Source DEM pixel scale</dt>
              <dd>{manifest?.analysis.terrain_resolution_m ?? "—"} m</dd>
            </div>
            <div>
              <dt>Display grid</dt>
              <dd>{terrain?.resolution_m ?? "—"} m · 1.5× height in 3D</dd>
            </div>
            <div>
              <dt>Mission window</dt>
              <dd>
                {Number.isFinite(hours) && hours > 0
                  ? `${(hours / 24).toFixed(1)} days`
                  : "Check mission dates"}{" "}
                · {manifest?.analysis.finalist_time_step_minutes ?? "—"} min
                samples
              </dd>
            </div>
          </dl>
          <p className="field-hint">
            Slope and roughness: 1 km output grids, 100 m baseline. DEM
            error/count masks are not included; no quality or confidence overlay
            is available. The pole itself is not a candidate.
          </p>
          <p className="field-hint">
            Horizon terrain extends to 200 km and is already included in
            prepared profiles. This map shows candidate coverage, not the
            horizon-data extent. Analysis readiness:{" "}
            {manifest?.status === "prepared"
              ? "verified terrain and kernels"
              : "unavailable or awaiting verification"}
            .
          </p>
        </div>
      </div>
    </details>
  );
}
