import type { Candidate, Preferences, SearchResponse } from "../lib/types";
import { coordinate, hours, percent } from "../lib/format";
import { Icon } from "./Icon";

export function CandidateResults({
  result,
  selected,
  pinned,
  onSelect,
  onPin,
  onCompare,
}: {
  result: SearchResponse;
  selected: string | null;
  pinned: string[];
  onSelect: (id: string) => void;
  onPin: (id: string) => void;
  onCompare: () => void;
}) {
  return (
    <section className="results-section" aria-labelledby="results-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">THE SHORTLIST</span>
          <h2 id="results-title">Different sites. Different strengths.</h2>
        </div>
        <button
          className="secondary-button"
          onClick={onCompare}
          disabled={pinned.length !== 2}
        >
          <Icon name="compare" size={16} />
          Compare {pinned.length}/2
        </button>
      </div>
      <p className="results-summary">
        {result.counts.temporal_pass.toLocaleString()} eligible of{" "}
        {result.counts.region.toLocaleString()} covered candidates ·{" "}
        {result.candidates.length} spatially separated sites · scores within 2
        points are near ties.
      </p>
      {result.candidates.length === 0 ? (
        <div className="empty-results" role="status">
          <Icon name="compass" size={32} />
          <h3>No candidates meet this configuration.</h3>
          <p>
            {result.empty_reason ??
              "Review the mission window, region, or hard constraints and run another search."}
          </p>
          <div>
            {result.counts.region} in region → {result.counts.terrain_pass} pass
            terrain → {result.counts.temporal_pass} pass temporal constraints
          </div>
          <small>Constraints have not been relaxed.</small>
        </div>
      ) : (
        <div className="candidate-grid">
          {result.candidates.map((site) => (
            <article
              className={`candidate-card ${selected === site.id ? "selected" : ""}`}
              key={site.id}
            >
              <button
                className="candidate-select"
                onClick={() => onSelect(site.id)}
                aria-pressed={selected === site.id}
              >
                <div className="candidate-top">
                  <span className="candidate-number">
                    {String(site.rank).padStart(2, "0")}
                  </span>
                  <span className="candidate-score">
                    {Math.round(site.score)}
                    <small>/100</small>
                  </span>
                </div>
                <h3>Candidate {String(site.rank).padStart(2, "0")}</h3>
                <p className="candidate-coordinate">
                  {coordinate(site.latitude_deg, site.longitude_deg_east)}
                </p>
                <div className="candidate-metrics">
                  <span>
                    <Icon name="sun" size={14} />
                    <strong>
                      {percent(site.metrics.illumination_fraction)}
                    </strong>
                  </span>
                  <span>
                    <Icon name="earth" size={14} />
                    <strong>
                      {percent(site.metrics.earth_visibility_fraction)}
                    </strong>
                  </span>
                  <span>
                    <Icon name="terrain" size={14} />
                    <strong>{site.slope_deg.toFixed(1)}°</strong>
                  </span>
                </div>
                <div
                  className="score-stack"
                  aria-label="Weighted score contributions"
                >
                  {(
                    [
                      "illumination",
                      "earth_visibility",
                      "terrain_safety",
                      "science_proximity",
                    ] as const
                  ).map((key) => (
                    <span
                      className={key}
                      key={key}
                      style={{
                        width: `${(site.criteria_scores[key] ?? 0) * result.normalized_preferences[key] * 100}%`,
                      }}
                    />
                  ))}
                </div>
                <span className="inspect-link">
                  {selected === site.id
                    ? "Inspecting this site"
                    : "Inspect site"}
                  <Icon name="arrow" size={14} />
                </span>
              </button>
              <button
                className={`pin-button ${pinned.includes(site.id) ? "pinned" : ""}`}
                onClick={() => onPin(site.id)}
                disabled={pinned.length === 2 && !pinned.includes(site.id)}
                aria-pressed={pinned.includes(site.id)}
              >
                <Icon
                  name={pinned.includes(site.id) ? "check" : "pin"}
                  size={14}
                />
                {pinned.includes(site.id)
                  ? "Added to comparison"
                  : "Add to comparison"}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

const criteria: { key: keyof Preferences; label: string }[] = [
  { key: "illumination", label: "Sunlight" },
  { key: "earth_visibility", label: "Earth visibility" },
  { key: "terrain_safety", label: "Terrain suitability" },
  { key: "science_proximity", label: "Science proximity" },
];

export function Comparison({
  sites,
  result,
  onClose,
}: {
  sites: Candidate[];
  result: SearchResponse;
  onClose: () => void;
}) {
  const rows: { label: string; value: (site: Candidate) => string }[] = [
    { label: "Planning score", value: (s) => `${Math.round(s.score)} / 100` },
    {
      label: "Coordinates",
      value: (s) => coordinate(s.latitude_deg, s.longitude_deg_east),
    },
    {
      label: "Sunlight availability · upper limb",
      value: (s) => percent(s.metrics.illumination_fraction),
    },
    {
      label: "Mean visible solar disk fraction",
      value: (s) => percent(s.metrics.mean_visible_solar_disk_fraction),
    },
    {
      label: "Longest continuous sunlight",
      value: (s) => hours(s.metrics.longest_sunlight_hours),
    },
    {
      label: "Longest continuous darkness",
      value: (s) => hours(s.metrics.longest_darkness_hours),
    },
    {
      label: "Earth line-of-sight fraction",
      value: (s) => percent(s.metrics.earth_visibility_fraction),
    },
    {
      label: "Longest Earth LOS opportunity",
      value: (s) => hours(s.metrics.longest_communication_hours),
    },
    {
      label: "Longest Earth blackout",
      value: (s) => hours(s.metrics.longest_blackout_hours),
    },
    {
      label: "Slope · 100 m baseline",
      value: (s) => `${s.slope_deg.toFixed(2)}°`,
    },
    {
      label: "Roughness · 100 m baseline",
      value: (s) => `${s.roughness_m.toFixed(2)} m`,
    },
    {
      label: "Elevation above reference sphere",
      value: (s) => `${Math.round(s.elevation_m).toLocaleString()} m`,
    },
    {
      label: "Mapped PSR distance",
      value: (s) =>
        s.distance_psr_km == null
          ? "Unavailable"
          : `${s.distance_psr_km.toFixed(3)} km`,
    },
    {
      label: "Selected feature-center distance",
      value: (s) =>
        s.distance_science_feature_km == null
          ? "Not selected"
          : `${s.distance_science_feature_km.toFixed(2)} km`,
    },
  ];
  return (
    <section
      className="comparison-section"
      id="comparison"
      aria-labelledby="comparison-title"
    >
      <div className="section-heading">
        <div>
          <span className="eyebrow">SIDE BY SIDE</span>
          <h2 id="comparison-title">Compare the trade-offs.</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Close comparison"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
      {sites.length < 2 ? (
        <p className="muted">
          Add two candidates from the shortlist to compare their metrics under
          the same mission window.
        </p>
      ) : (
        <>
          <p className="small muted">
            One dataset. One mission window. The same{" "}
            {result.common_window.step_minutes}-minute samples.
          </p>
          <div className="table-scroll">
            <table className="comparison-table">
              <thead>
                <tr>
                  <th>Planning indicator</th>
                  {sites.map((s) => (
                    <th key={s.id}>
                      <span className="status-dot" /> Candidate{" "}
                      {String(s.rank).padStart(2, "0")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.label}>
                    <th scope="row">{row.label}</th>
                    {sites.map((s) => (
                      <td key={s.id}>{row.value(s)}</td>
                    ))}
                  </tr>
                ))}
                {criteria.map(({ key, label }) => (
                  <tr key={key}>
                    <th scope="row">
                      {label} contribution{" "}
                      <small>
                        ({Math.round(result.normalized_preferences[key] * 100)}%
                        weight)
                      </small>
                    </th>
                    {sites.map((s) => (
                      <td key={s.id}>
                        {(
                          (s.criteria_scores[key] ?? 0) *
                          result.normalized_preferences[key] *
                          100
                        ).toFixed(1)}{" "}
                        points{" "}
                        <span className="muted">
                          / utility{" "}
                          {((s.criteria_scores[key] ?? 0) * 100).toFixed(0)}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="field-hint">
            Planning scores express these preferences. They do not estimate
            landing safety, communications reliability, or mission success.
          </p>
        </>
      )}
    </section>
  );
}
