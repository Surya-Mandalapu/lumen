import { useState } from "react";
import type { FormEvent } from "react";
import type { LunarFeature, Preferences, SearchRequest } from "../lib/types";
import { normalizePreferences } from "../lib/weights";
import { DEFAULT_REQUEST, MISSION_PRESETS } from "../lib/missions";
import { Icon } from "./Icon";

export { DEFAULT_REQUEST } from "../lib/missions";
type Constraints = SearchRequest["hard_constraints"];
const basicFields = [
  { key: "maximum_slope_deg", label: "Max slope (°)", max: 90, step: 0.1 },
  {
    key: "minimum_earth_visibility_fraction",
    label: "Min Earth LOS (%)",
    max: 100,
    factor: 100,
    step: 1,
  },
  {
    key: "minimum_illumination_fraction",
    label: "Min sunlight (%)",
    max: 100,
    factor: 100,
    step: 1,
  },
  {
    key: "maximum_continuous_darkness_hours",
    label: "Max darkness (h)",
    step: 0.5,
  },
  {
    key: "maximum_continuous_blackout_hours",
    label: "Max Earth blackout (h)",
    step: 0.5,
  },
] as const;
const advancedFields = [
  { key: "maximum_roughness_m", label: "Max roughness (m)", step: 0.1 },
  {
    key: "minimum_elevation_m",
    label: "Min elevation (m)",
    step: 1,
    negative: true,
  },
  {
    key: "maximum_elevation_m",
    label: "Max elevation (m)",
    step: 1,
    negative: true,
  },
  {
    key: "minimum_continuous_sunlight_hours",
    label: "Min continuous sunlight (h)",
    step: 0.5,
  },
  {
    key: "minimum_continuous_communication_hours",
    label: "Min continuous Earth LOS (h)",
    step: 0.5,
  },
  {
    key: "maximum_distance_to_psr_km",
    label: "Max PSR distance (km)",
    step: 0.1,
    science: true,
  },
  {
    key: "maximum_distance_to_science_feature_km",
    label: "Max feature-center distance (km)",
    step: 0.5,
    feature: true,
  },
] as const;
const priorities: {
  key: keyof Preferences;
  label: string;
  icon: "sun" | "earth" | "terrain" | "compass";
}[] = [
  { key: "illumination", label: "Sunlight", icon: "sun" },
  { key: "earth_visibility", label: "Earth visibility", icon: "earth" },
  { key: "terrain_safety", label: "Terrain suitability", icon: "terrain" },
  { key: "science_proximity", label: "Science proximity", icon: "compass" },
];

export function MissionForm({
  loading,
  value,
  onDraftChange,
  onSearch,
  features,
  scienceAvailable,
}: {
  loading: boolean;
  value: SearchRequest;
  onDraftChange: (request: SearchRequest) => void;
  onSearch: (request: SearchRequest) => void;
  features: LunarFeature[];
  scienceAvailable: boolean;
}) {
  const [expanded, setExpanded] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [localError, setLocalError] = useState<string | null>(null);
  const normalized = normalizePreferences(value.preferences);
  const exclusive = Object.values(normalized).some((weight) => weight === 1);
  const center = value.region.center ?? {
    latitude_deg: -89.9,
    longitude_deg_east: 0,
  };
  const dateInput = (date: string) =>
    Number.isFinite(Date.parse(date))
      ? new Date(date).toISOString().slice(0, 16)
      : "";
  function change(next: SearchRequest) {
    setLocalError(null);
    setConfirmed(false);
    onDraftChange(next);
  }
  function constraint(key: keyof Constraints, raw: string, factor = 1) {
    const next = { ...value.hard_constraints };
    if (raw === "") delete next[key];
    else Object.assign(next, { [key]: Number(raw) / factor });
    change({ ...value, hard_constraints: next });
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    setLocalError(null);
    const start = Date.parse(value.time_range.start_utc),
      end = Date.parse(value.time_range.end_utc);
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start >= end ||
      end - start > 31 * 86400000
    ) {
      setLocalError("Choose an ordered mission window of at most 31 days.");
      return;
    }
    if (exclusive && !confirmed) {
      setLocalError("Confirm using a single ranking criterion.");
      return;
    }
    onSearch(structuredClone(value));
    if (window.innerWidth <= 650) {
      setExpanded(false);
      document.getElementById("explorer")?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
    }
  }
  function field(item: {
    key: keyof Constraints;
    label: string;
    step: number;
    factor?: number;
    max?: number;
    negative?: boolean;
    science?: boolean;
    feature?: boolean;
  }) {
    const scalar = value.hard_constraints[item.key];
    return (
      <label className="field" key={item.key}>
        {item.label}
        <input
          type="number"
          min={item.negative ? undefined : 0}
          max={item.max}
          step={item.step}
          placeholder="Any"
          value={
            typeof scalar === "number"
              ? Number((scalar * (item.factor ?? 1)).toFixed(6))
              : ""
          }
          onChange={(e) => constraint(item.key, e.target.value, item.factor)}
          disabled={
            (item.science && !scienceAvailable) ||
            (item.feature &&
              !value.hard_constraints.science_feature_ids?.length)
          }
        />
      </label>
    );
  }
  return (
    <aside
      className={`mission-panel ${expanded ? "expanded" : ""}`}
      id="mission-settings"
    >
      <button
        className="mobile-mission-toggle"
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-controls="mission-form"
      >
        <span>
          <Icon name="compass" size={18} />
          Mission parameters
        </span>
        <span>
          {expanded ? "Close" : "Configure"}
          <Icon name={expanded ? "close" : "arrow"} size={15} />
        </span>
      </button>
      <div className="panel-heading">
        <span className="eyebrow">MISSION PARAMETERS</span>
        <button
          className="icon-button"
          title="Reset mission parameters"
          aria-label="Reset mission parameters"
          onClick={() => change(structuredClone(DEFAULT_REQUEST))}
        >
          <Icon name="reset" size={16} />
        </button>
      </div>
      <h2>Define your mission.</h2>
      <p className="small muted">A clear window. Your own priorities.</p>
      <form id="mission-form" onSubmit={submit}>
        <label className="field">
          Start from a representative scenario
          <select
            value=""
            onChange={(e) => {
              const preset = MISSION_PRESETS.find(
                (p) => p.id === e.target.value,
              );
              if (preset) change(structuredClone(preset.request));
            }}
          >
            <option value="">Choose a mission preset…</option>
            {MISSION_PRESETS.map((p) => (
              <option
                key={p.id}
                value={p.id}
                disabled={p.id === "science" && !scienceAvailable}
              >
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>
            <span className="step-number">01</span> Study area
          </legend>
          <label className="field">
            Region
            <select
              value={value.region.selector_type}
              onChange={(e) =>
                change({
                  ...value,
                  region:
                    e.target.value === "full_supported_region"
                      ? { selector_type: "full_supported_region" }
                      : {
                          selector_type: e.target.value as
                            | "circle"
                            | "feature_radius",
                          center,
                          search_radius_km: 10,
                        },
                })
              }
            >
              <option value="full_supported_region">
                South pole · prepared study area
              </option>
              <option value="feature_radius" disabled={!features.length}>
                Near an approved lunar feature
              </option>
              <option value="circle">Custom coordinates + radius</option>
            </select>
          </label>
          <div className="coverage-note">
            <span className="status-dot" />
            <span>
              20 × 20 km study area
              <br />
              <span className="muted">500 m candidates · 80 m source DEM</span>
            </span>
          </div>
          {value.region.selector_type === "feature_radius" && (
            <>
              <label className="field">
                Approved feature
                <select
                  required
                  value={value.region.resolved_feature_id ?? ""}
                  onChange={(e) => {
                    const feature = features.find(
                      (f) => f.id === e.target.value,
                    );
                    if (feature)
                      change({
                        ...value,
                        region: {
                          ...value.region,
                          selector_type: "feature_radius",
                          resolved_feature_id: feature.id,
                          input_text: feature.name,
                          center: {
                            latitude_deg: feature.latitude_deg,
                            longitude_deg_east: feature.longitude_deg_east,
                          },
                        },
                      });
                  }}
                >
                  <option value="">Choose a feature…</option>
                  {features.map((feature) => (
                    <option value={feature.id} key={feature.id}>
                      {feature.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="field-hint">
                Official IAU center. Only the overlap with prepared coverage is
                searched.
              </p>
            </>
          )}
          {value.region.selector_type !== "full_supported_region" && (
            <div className="coordinate-fields">
              {value.region.selector_type === "circle" && (
                <>
                  <label className="field">
                    Latitude °
                    <input
                      type="number"
                      min="-90"
                      max="-87"
                      step=".001"
                      value={center.latitude_deg}
                      required
                      onChange={(e) =>
                        change({
                          ...value,
                          region: {
                            ...value.region,
                            center: {
                              ...center,
                              latitude_deg: Number(e.target.value),
                            },
                          },
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    Longitude °E
                    <input
                      type="number"
                      min="-180"
                      max="179.999"
                      step=".001"
                      value={center.longitude_deg_east}
                      required
                      onChange={(e) =>
                        change({
                          ...value,
                          region: {
                            ...value.region,
                            center: {
                              ...center,
                              longitude_deg_east: Number(e.target.value),
                            },
                          },
                        })
                      }
                    />
                  </label>
                </>
              )}
              <label className="field full">
                Radius (km)
                <input
                  type="number"
                  min="1"
                  max="50"
                  step=".5"
                  value={value.region.search_radius_km ?? 10}
                  required
                  onChange={(e) =>
                    change({
                      ...value,
                      region: {
                        ...value.region,
                        search_radius_km: Number(e.target.value),
                      },
                    })
                  }
                />
              </label>
            </div>
          )}
        </fieldset>
        <fieldset>
          <legend>
            <span className="step-number">02</span> Mission window{" "}
            <span className="label-note">UTC</span>
          </legend>
          {(["start_utc", "end_utc"] as const).map((key) => (
            <label className="field" key={key}>
              {key === "start_utc" ? "Start" : "End (exclusive)"}
              <input
                type="datetime-local"
                value={dateInput(value.time_range[key])}
                min="2025-01-01T00:00"
                max={
                  key === "end_utc" ? "2036-01-01T00:00" : "2035-12-31T23:59"
                }
                required
                onChange={(e) =>
                  change({
                    ...value,
                    time_range: {
                      ...value.time_range,
                      [key]: e.target.value ? `${e.target.value}:00Z` : "",
                    },
                  })
                }
              />
            </label>
          ))}
          <p className="field-hint">2025–2035 · up to 31 days per search</p>
        </fieldset>
        <fieldset>
          <legend>
            <span className="step-number">03</span> Hard constraints
          </legend>
          <div className="coordinate-fields">{basicFields.map(field)}</div>
          <p className="field-hint">
            Applied before ranking. Blank means unrestricted.
          </p>
          <details className="advanced-constraints">
            <summary>Terrain, continuity & science</summary>
            <div className="coordinate-fields">{advancedFields.map(field)}</div>
            <label className="field">
              Science feature (optional)
              <select
                value={value.hard_constraints.science_feature_ids?.[0] ?? ""}
                onChange={(e) => {
                  const next = {
                    ...value.hard_constraints,
                    science_feature_ids: e.target.value ? [e.target.value] : [],
                  };
                  if (!e.target.value)
                    delete next.maximum_distance_to_science_feature_km;
                  change({ ...value, hard_constraints: next });
                }}
              >
                <option value="">PSR proximity only</option>
                {features.map((feature) => (
                  <option value={feature.id} key={feature.id}>
                    {feature.name} · center distance
                  </option>
                ))}
              </select>
            </label>
            <p className="field-hint">
              PSR distance uses the mapped shadow mask. Named-feature distance
              is to its approved center, not its rim. Slope and roughness: 100 m
              baseline on 1 km output grids.
            </p>
          </details>
        </fieldset>
        <fieldset>
          <legend>
            <span className="step-number">04</span> Ranking priorities
          </legend>
          <div className="weight-grid">
            {priorities.map(({ key, label, icon }) => (
              <label key={key} className={`weight-field ${key}`}>
                <span>
                  <Icon name={icon} size={14} />
                  {label}
                </span>
                <strong>{Math.round(normalized[key] * 100)}%</strong>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={value.preferences[key]}
                  aria-label={`${label} weight`}
                  disabled={key === "science_proximity" && !scienceAvailable}
                  onChange={(e) =>
                    change({
                      ...value,
                      preferences: {
                        ...value.preferences,
                        [key]: Number(e.target.value),
                      },
                    })
                  }
                />
              </label>
            ))}
          </div>
          <p className="field-hint">
            Weights normalize to 100%.
            {scienceAvailable
              ? " Science uses PSR distance and an optional selected feature."
              : " The science layer is loading or unavailable."}
          </p>
          {exclusive && (
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              Use only this criterion for ranking.
            </label>
          )}
        </fieldset>
        {localError && (
          <div className="error-box" role="alert">
            {localError}
          </div>
        )}
        <button
          type="submit"
          className="primary-button search-button"
          disabled={loading}
        >
          {loading ? (
            <>
              <span className="spinner" />
              Analyzing terrain & geometry…
            </>
          ) : (
            <>
              Find candidate sites
              <Icon name="arrow" />
            </>
          )}
        </button>
        <p className="field-hint centered">
          Representative presets · computed planning indicators
        </p>
      </form>
    </aside>
  );
}
