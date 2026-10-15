import { useEffect, useRef, useState } from "react";
import type { Candidate, SearchResponse } from "../lib/types";
import { downloadJson, utcTime } from "../lib/format";
import { Icon } from "./Icon";
import "./scenario-lab.css";

type Metrics = Candidate["metrics"];
type MetricName = keyof Metrics;
interface ConstraintStatus {
  passes: boolean;
  region_pass: boolean;
  terrain_pass: boolean;
  temporal_pass: boolean;
}
interface ScenarioWindow {
  start_utc: string;
  end_utc: string;
  step_minutes: number;
}
interface ScenarioResult {
  site_id: string;
  baseline: {
    window: ScenarioWindow;
    metrics: Metrics;
    constraint_status: ConstraintStatus;
  };
  shifted: {
    window: ScenarioWindow;
    metrics: Metrics;
    constraint_status: ConstraintStatus;
  };
  metric_deltas: Metrics;
  neighbors: {
    site: Pick<
      Candidate,
      | "id"
      | "latitude_deg"
      | "longitude_deg_east"
      | "x_m"
      | "y_m"
      | "elevation_m"
      | "slope_deg"
      | "roughness_m"
    >;
    distance_m: number;
    metrics: Metrics;
    metric_deltas: Metrics;
    constraint_status: ConstraintStatus;
  }[];
  neighbor_ranges: Partial<Record<MetricName, { min: number; max: number }>>;
  sampling_sensitivity: {
    baseline_step_minutes: number;
    refined_step_minutes: number;
    metrics: Metrics;
    metric_deltas: Metrics;
    constraint_status?: ConstraintStatus;
  } | null;
  warnings: string[];
  provenance: Record<string, unknown>;
}

const metricRows: { key: MetricName; label: string; fraction?: boolean }[] = [
  {
    key: "illumination_fraction",
    label: "Sunlight availability · upper limb",
    fraction: true,
  },
  {
    key: "mean_visible_solar_disk_fraction",
    label: "Mean visible solar disk",
    fraction: true,
  },
  {
    key: "earth_visibility_fraction",
    label: "Earth line of sight",
    fraction: true,
  },
  { key: "longest_sunlight_hours", label: "Longest continuous sunlight" },
  { key: "longest_darkness_hours", label: "Longest darkness" },
  { key: "longest_communication_hours", label: "Longest Earth opportunity" },
  { key: "longest_blackout_hours", label: "Longest Earth blackout" },
];

function value(number: number, fraction = false) {
  return `${(number * (fraction ? 100 : 1)).toFixed(1)}${fraction ? "%" : " h"}`;
}

function difference(number: number, fraction = false) {
  const scaled = number * (fraction ? 100 : 1);
  const rounded = Math.abs(scaled) < 0.05 ? 0 : scaled;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)} ${fraction ? "pp" : "h"}`;
}

function Status({ status }: { status: ConstraintStatus }) {
  const failures = [
    !status.region_pass && "outside request region",
    !status.terrain_pass && "terrain constraint",
    !status.temporal_pass && "temporal constraint",
  ].filter(Boolean);
  return (
    <span className={`scenario-status ${status.passes ? "passes" : "fails"}`}>
      <Icon name={status.passes ? "check" : "info"} size={13} />
      {status.passes
        ? "Passes current constraints"
        : `Does not pass · ${failures.join(", ") || "current constraints"}`}
    </span>
  );
}

function MetricTable({
  baseline,
  compared,
  deltas,
  comparedLabel,
}: {
  baseline: Metrics;
  compared: Metrics;
  deltas: Metrics;
  comparedLabel: string;
}) {
  return (
    <div className="table-scroll scenario-table-wrap">
      <table className="scenario-metric-table">
        <thead>
          <tr>
            <th scope="col">Planning indicator</th>
            <th scope="col">Baseline</th>
            <th scope="col">{comparedLabel}</th>
            <th scope="col">Change</th>
          </tr>
        </thead>
        <tbody>
          {metricRows.map(({ key, label, fraction }) => (
            <tr key={key}>
              <th scope="row">{label}</th>
              <td>{value(baseline[key], fraction)}</td>
              <td>{value(compared[key], fraction)}</td>
              <td className="scenario-delta">
                {difference(deltas[key], fraction)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ScenarioLab({
  result,
  site,
  onApplyDelay,
}: {
  result: SearchResponse;
  site: Candidate;
  onApplyDelay?: (hours: number) => void;
}) {
  const [delay, setDelay] = useState(12);
  const [radius, setRadius] = useState(500);
  const [sampling, setSampling] = useState(true);
  const [report, setReport] = useState<ScenarioResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completedSettings, setCompletedSettings] = useState<{
    delay: number;
    radius: number;
    sampling: boolean;
  } | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    controller.current?.abort();
    setReport(null);
    setError(null);
    setPending(false);
    setCompletedSettings(null);
    return () => controller.current?.abort();
  }, [result.search_id, site.id]);

  const changed =
    !!completedSettings &&
    (completedSettings.delay !== delay ||
      completedSettings.radius !== radius ||
      completedSettings.sampling !== sampling);

  async function analyze() {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setPending(true);
    setError(null);
    setReport(null);
    setCompletedSettings(null);
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";
      const response = await fetch(`${apiBase}/scenarios/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request: result.request,
          site_id: site.id,
          delay_hours: delay,
          offset_radius_m: radius,
          include_sampling_sensitivity: sampling,
        }),
        signal: abort.signal,
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const detail = body?.detail;
        const message =
          typeof detail === "string"
            ? detail
            : Array.isArray(detail)
              ? detail.map((item: { msg: string }) => item.msg).join(". ")
              : detail?.message;
        throw new Error(
          message ||
            `Scenario analysis could not complete (${response.status}).`,
        );
      }
      if (!body?.baseline || !body?.shifted || !Array.isArray(body?.neighbors))
        throw new Error(
          "The analysis service returned an incomplete scenario report.",
        );
      if (abort.signal.aborted) return;
      setReport(body as ScenarioResult);
      setCompletedSettings({ delay, radius, sampling });
    } catch (reason) {
      if (!abort.signal.aborted)
        setError(
          reason instanceof Error
            ? reason.message
            : "Scenario analysis failed. Please try again.",
        );
    } finally {
      if (!abort.signal.aborted) setPending(false);
    }
  }

  return (
    <section className="scenario-lab" aria-labelledby="scenario-lab-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">CHANGE ONE ASSUMPTION</span>
          <h2 id="scenario-lab-title">How much does the picture change?</h2>
        </div>
        <span className="subtle-badge">
          {site.rank > 0
            ? `Candidate ${String(site.rank).padStart(2, "0")}`
            : "Explored location"}
        </span>
      </div>
      <p className="scenario-intro">
        Explore a later arrival, neighboring candidate locations, and a finer
        time step. These comparisons use this site and the original search
        requirements; they do not rerank the shortlist.
      </p>
      <div className="scenario-controls">
        <fieldset disabled={pending}>
          <legend>Shift the entire mission window</legend>
          <div className="scenario-choice-group">
            {[12, 24].map((hours) => (
              <button
                key={hours}
                type="button"
                aria-pressed={delay === hours}
                onClick={() => setDelay(hours)}
              >
                +{hours} hours
              </button>
            ))}
          </div>
        </fieldset>
        <label className="scenario-radius">
          Nearby candidate radius
          <select
            value={radius}
            disabled={pending}
            onChange={(event) => setRadius(Number(event.target.value))}
          >
            <option value={500}>500 m · one grid step</option>
            <option value={1000}>1 km · wider neighborhood</option>
          </select>
        </label>
        <label className="scenario-sampling">
          <input
            type="checkbox"
            checked={sampling}
            disabled={pending}
            onChange={(event) => setSampling(event.target.checked)}
          />
          <span>
            Check 2.5-minute sampling<small>Same site and baseline dates</small>
          </span>
        </label>
        <button
          className="secondary-button scenario-run"
          type="button"
          onClick={analyze}
          disabled={pending}
        >
          {pending ? (
            <>
              <span className="spinner" />
              Computing scenarios…
            </>
          ) : (
            <>
              <Icon name="compare" size={16} />
              Run sensitivity analysis
            </>
          )}
        </button>
      </div>
      <div aria-live="polite" aria-atomic="true">
        {pending && (
          <p className="scenario-pending">
            Recomputing date-specific geometry and constraints for each case.
          </p>
        )}
        {error && (
          <div className="error-box" role="alert">
            {error}
          </div>
        )}
        {changed && (
          <p className="changed-notice">
            Scenario settings changed. Run the analysis again to update the
            comparisons below.
          </p>
        )}
      </div>
      {!report && !pending && !error && (
        <p className="scenario-idle">
          A sensitivity check shows which metrics depend on the dates, location,
          and time sampling. No assumptions are changed in your original search.
        </p>
      )}
      {report && completedSettings && (
        <div className="scenario-report">
          <article className="scenario-block">
            <div className="scenario-block-heading">
              <div>
                <h3>Arrival +{completedSettings.delay} hours</h3>
                <p>Same candidate, same mission duration, shifted UTC dates.</p>
              </div>
              <Status status={report.shifted.constraint_status} />
            </div>
            <div className="scenario-window-pair">
              <div>
                <span>Baseline window</span>
                <strong>
                  {utcTime(report.baseline.window.start_utc)} →{" "}
                  {utcTime(report.baseline.window.end_utc)}
                </strong>
              </div>
              <div>
                <span>Shifted window</span>
                <strong>
                  {utcTime(report.shifted.window.start_utc)} →{" "}
                  {utcTime(report.shifted.window.end_utc)}
                </strong>
              </div>
            </div>
            <MetricTable
              baseline={report.baseline.metrics}
              compared={report.shifted.metrics}
              deltas={report.metric_deltas}
              comparedLabel={`+${completedSettings.delay} hours`}
            />
            <p className="scenario-explainer">
              Changes are shifted minus baseline. Percentage points (pp) compare
              fractions directly; a positive change can be favorable or
              unfavorable depending on the indicator.
            </p>
            {onApplyDelay && (
              <button
                className="text-button"
                onClick={() => onApplyDelay(completedSettings.delay)}
              >
                Use shifted dates in mission form
                <Icon name="arrow" size={14} />
              </button>
            )}
          </article>
          <article className="scenario-block">
            <div className="scenario-block-heading">
              <div>
                <h3>
                  Nearby locations · {completedSettings.radius.toLocaleString()}{" "}
                  m radius
                </h3>
                <p>
                  {report.neighbors.length} prepared neighbors · baseline dates
                  and time step.
                </p>
              </div>
              <span className="subtle-badge">Spatial sensitivity</span>
            </div>
            <p className="scenario-explainer">
              Ranges include the selected site and the shown nearby 500 m
              candidate-grid points. They do not model a landing-error
              distribution or unresolved terrain hazards.
            </p>
            {report.neighbors.length ? (
              <>
                <div className="scenario-spread-grid">
                  {metricRows
                    .filter(({ key }) =>
                      [
                        "illumination_fraction",
                        "earth_visibility_fraction",
                        "longest_darkness_hours",
                        "longest_blackout_hours",
                      ].includes(key),
                    )
                    .map(({ key, label, fraction }) => {
                      const range = report.neighbor_ranges[key];
                      return (
                        <div key={key}>
                          <span>{label}</span>
                          <strong>
                            {range
                              ? `${value(range.min, fraction)} – ${value(range.max, fraction)}`
                              : "Unavailable"}
                          </strong>
                          <small>Selected site + nearby samples</small>
                        </div>
                      );
                    })}
                </div>
                <details className="scenario-neighbors">
                  <summary>Inspect each neighboring location</summary>
                  <div className="table-scroll">
                    <table className="scenario-neighbor-table">
                      <thead>
                        <tr>
                          <th scope="col">Location</th>
                          <th scope="col">Offset</th>
                          <th scope="col">Sunlight</th>
                          <th scope="col">Earth LOS</th>
                          <th scope="col">Slope</th>
                          <th scope="col">Current constraints</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.neighbors.map((neighbor) => (
                          <tr key={neighbor.site.id}>
                            <th scope="row">
                              {neighbor.site.latitude_deg.toFixed(4)}°,{" "}
                              {neighbor.site.longitude_deg_east.toFixed(3)}°E
                              <small>{neighbor.site.id}</small>
                            </th>
                            <td>{Math.round(neighbor.distance_m)} m</td>
                            <td>
                              {value(
                                neighbor.metrics.illumination_fraction,
                                true,
                              )}
                              <small>
                                {difference(
                                  neighbor.metric_deltas.illumination_fraction,
                                  true,
                                )}
                              </small>
                            </td>
                            <td>
                              {value(
                                neighbor.metrics.earth_visibility_fraction,
                                true,
                              )}
                              <small>
                                {difference(
                                  neighbor.metric_deltas
                                    .earth_visibility_fraction,
                                  true,
                                )}
                              </small>
                            </td>
                            <td>{neighbor.site.slope_deg.toFixed(1)}°</td>
                            <td>
                              <Status status={neighbor.constraint_status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </>
            ) : (
              <p className="scenario-idle">
                No prepared neighboring candidates fall inside this radius.
                Locations outside the prepared dataset are not extrapolated.
              </p>
            )}
          </article>
          {report.sampling_sensitivity && (
            <article className="scenario-block">
              <div className="scenario-block-heading">
                <div>
                  <h3>Time-step sensitivity</h3>
                  <p>
                    {report.sampling_sensitivity.baseline_step_minutes}-minute
                    baseline versus{" "}
                    {report.sampling_sensitivity.refined_step_minutes}-minute
                    samples at the same location and dates.
                  </p>
                </div>
                {report.sampling_sensitivity.constraint_status && (
                  <Status
                    status={report.sampling_sensitivity.constraint_status}
                  />
                )}
              </div>
              <MetricTable
                baseline={report.baseline.metrics}
                compared={report.sampling_sensitivity.metrics}
                deltas={report.sampling_sensitivity.metric_deltas}
                comparedLabel={`${report.sampling_sensitivity.refined_step_minutes} min samples`}
              />
              <p className="scenario-explainer">
                A small difference suggests convergence for these sampled
                metrics. It does not establish accuracy: both runs share the
                same coarse terrain horizons, and shorter events can still be
                missed.
              </p>
            </article>
          )}
          <div className="scenario-footnotes">
            <div>
              <strong>Keep the uncertainty in view.</strong>
              <p>
                Observed differences are sensitivity indicators, not confidence
                intervals or probabilities of mission success. Terrain quality
                masks and formal uncertainty propagation are unavailable.
              </p>
            </div>
            <button
              className="text-button"
              onClick={() =>
                downloadJson(
                  {
                    parent_search_id: result.search_id,
                    original_request: result.request,
                    settings: completedSettings,
                    ...report,
                  },
                  `lumen-sensitivity-${site.id}.json`,
                )
              }
            >
              <Icon name="download" size={14} />
              Export sensitivity report
            </button>
          </div>
          {!!report.warnings.length && (
            <details className="scenario-warnings">
              <summary>
                Scenario assumptions and limitations · {report.warnings.length}
              </summary>
              <ul>
                {report.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
