import { useEffect, useState } from "react";
import type { Candidate, SearchResponse, TimeSample } from "../lib/types";
import {
  coordinate,
  hours,
  percent,
  utcTime,
  downloadTimelineCsv,
} from "../lib/format";
import { Icon } from "./Icon";

function segments(samples: TimeSample[], key: "sun_visible" | "earth_visible") {
  const output: { start: number; end: number; state: boolean }[] = [];
  if (!samples.length) return output;
  let start = 0;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i][key] !== samples[start][key]) {
      output.push({ start, end: i, state: samples[start][key] });
      start = i;
    }
  }
  output.push({ start, end: samples.length - 1, state: samples[start][key] });
  return output.filter((segment) => segment.end > segment.start);
}

function Timeline({
  site,
  index,
  onIndex,
}: {
  site: Candidate;
  index: number;
  onIndex: (i: number) => void;
}) {
  const count = site.timeline.length - 1;
  const first = site.timeline[0],
    last = site.timeline[count];
  if (!first || !last) return <p className="muted">Timeline unavailable.</p>;
  const startMs = Date.parse(first.time_utc),
    durationMs = Date.parse(last.time_utc) - startMs;
  const position = (i: number) =>
    ((Date.parse(site.timeline[i].time_utc) - startMs) / durationMs) * 100;
  return (
    <div className="timeline-chart">
      {(
        [
          { key: "sun_visible", label: "Sun above terrain", className: "sun" },
          {
            key: "earth_visible",
            label: "Earth line of sight",
            className: "earth",
          },
        ] as const
      ).map(({ key, label, className }) => (
        <div className="timeline-row" key={key}>
          <span>{label}</span>
          <div
            className={`timeline-track ${className}`}
            aria-label={`${label}: ${segments(site.timeline, key).filter((segment) => segment.state).length} visible intervals`}
          >
            {segments(site.timeline, key).map((segment) => (
              <span
                key={segment.start}
                className={segment.state ? "visible" : "blocked"}
                style={{
                  left: `${position(segment.start)}%`,
                  width: `${position(segment.end) - position(segment.start)}%`,
                }}
                title={`${utcTime(site.timeline[segment.start].time_utc)} â€“ ${utcTime(site.timeline[segment.end].time_utc)}: ${segment.state ? "visible" : "blocked"}`}
              />
            ))}
            <i
              className="timeline-cursor"
              style={{ left: `${position(index)}%` }}
            />
          </div>
        </div>
      ))}
      <div className="timeline-controls">
        <span>{utcTime(first.time_utc)}</span>
        <span>{utcTime(last.time_utc)}</span>
      </div>
      <label className="time-slider">
        <span className="sr-only">Inspect time in the mission window</span>
        <input
          type="range"
          min="0"
          max={count}
          step="1"
          value={index}
          onChange={(event) => onIndex(Number(event.target.value))}
        />
      </label>
      <div className="timeline-legend">
        <span>
          <i className="sun-dot" />
          Sun available
        </span>
        <span>
          <i className="earth-dot" />
          Earth visible
        </span>
        <span>
          <i className="blocked-dot" />
          Terrain blocked
        </span>
      </div>
    </div>
  );
}

function HorizonChart({
  site,
  sample,
}: {
  site: Candidate;
  sample: TimeSample | undefined;
}) {
  const points = site.horizon;
  if (!points.length) return <p className="muted">Horizon unavailable.</p>;
  const minimum =
    Math.min(
      -6,
      ...points.map((p) => p.elevation_deg),
      sample?.sun_elevation_deg ?? 0,
      sample?.earth_elevation_deg ?? 0,
    ) - 1;
  const maximum = Math.max(10, ...points.map((p) => p.elevation_deg)) + 1;
  const x = (az: number) => 38 + (az / 360) * 604;
  const y = (el: number) => 178 - ((el - minimum) / (maximum - minimum)) * 152;
  const horizonPath =
    points
      .map(
        (p, i) =>
          `${i ? "L" : "M"}${x(p.azimuth_deg).toFixed(1)},${y(p.elevation_deg).toFixed(1)}`,
      )
      .join(" ") + ` L${x(360)},${y(points[0].elevation_deg)}`;
  function path(key: "sun" | "earth") {
    const step = Math.max(1, Math.floor(site.timeline.length / 250));
    let previous = -1;
    return site.timeline
      .filter((_, i) => i % step === 0)
      .map((p) => {
        const az = key === "sun" ? p.sun_azimuth_deg : p.earth_azimuth_deg;
        const el = key === "sun" ? p.sun_elevation_deg : p.earth_elevation_deg;
        const move = previous < 0 || Math.abs(az - previous) > 180;
        previous = az;
        return `${move ? "M" : "L"}${x(az).toFixed(1)},${y(el).toFixed(1)}`;
      })
      .join(" ");
  }
  return (
    <svg
      className="horizon-chart"
      viewBox="0 0 670 214"
      role="img"
      aria-label="Terrain horizon versus Sun and Earth paths across azimuth. Exact selected-time values and terrain table follow."
    >
      {[0, 90, 180, 270, 360].map((az, i) => (
        <g key={az}>
          <line
            x1={x(az)}
            x2={x(az)}
            y1="26"
            y2="178"
            stroke="#2a3435"
            strokeDasharray="2 5"
          />
          <text x={x(az)} y="201" textAnchor="middle">
            {["N 0Â°", "E 90Â°", "S 180Â°", "W 270Â°", "N 360Â°"][i]}
          </text>
        </g>
      ))}
      {[minimum, 0, maximum].map((el) => (
        <g key={el}>
          <line x1="38" x2="642" y1={y(el)} y2={y(el)} stroke="#2a3435" />
          <text x="29" y={y(el) + 4} textAnchor="end">
            {Math.round(el)}Â°
          </text>
        </g>
      ))}
      <path
        d={`${horizonPath} L642,178 L38,178 Z`}
        fill="#384340"
        fillOpacity=".48"
      />
      <path d={horizonPath} fill="none" stroke="#8b9b91" strokeWidth="1.5" />
      <path
        d={path("sun")}
        fill="none"
        stroke="#dfbb6c"
        strokeWidth="1.6"
        opacity=".6"
      />
      <path
        d={path("earth")}
        fill="none"
        stroke="#94c4df"
        strokeWidth="1.6"
        opacity=".6"
      />
      {sample && (
        <>
          <circle
            cx={x(sample.sun_azimuth_deg)}
            cy={y(sample.sun_elevation_deg)}
            r="4.5"
            fill="#f1cb77"
            stroke="#171e1d"
            strokeWidth="2"
          />
          <circle
            cx={x(sample.earth_azimuth_deg)}
            cy={y(sample.earth_elevation_deg)}
            r="4.5"
            fill="#94c4df"
            stroke="#171e1d"
            strokeWidth="2"
          />
        </>
      )}
    </svg>
  );
}

export function SiteAnalysis({
  site,
  result,
  onSampleChange,
}: {
  site: Candidate;
  result: SearchResponse;
  onSampleChange?: (sample: TimeSample) => void;
}) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(
      () =>
        setIndex((current) => {
          const next = Math.min(
            site.timeline.length - 1,
            current + Math.max(1, Math.floor(site.timeline.length / 160)),
          );
          return next;
        }),
      180,
    );
    return () => clearInterval(timer);
  }, [playing, site.timeline.length]);
  useEffect(() => {
    if (index >= site.timeline.length - 1) setPlaying(false);
  }, [index, site.timeline.length]);
  const sample = site.timeline[Math.min(index, site.timeline.length - 1)];
  useEffect(() => {
    if (sample) onSampleChange?.(sample);
  }, [sample, onSampleChange]);
  return (
    <section className="analysis-section" aria-labelledby="analysis-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">SITE INSPECTION</span>
          <h2 id="analysis-title">
            {site.rank > 0
              ? `Candidate ${String(site.rank).padStart(2, "0")}`
              : "Explored location"}{" "}
            <span className="heading-detail">
              {coordinate(site.latitude_deg, site.longitude_deg_east)}
            </span>
          </h2>
        </div>
        <span className="subtle-badge">
          {result.common_window.step_minutes} min samples
        </span>
      </div>
      <div className="metric-strip">
        <div>
          <span>
            <Icon name="sun" size={14} />
            Sunlight availability
          </span>
          <strong className="sun-color">
            {percent(site.metrics.illumination_fraction)}
          </strong>
          <small>Time with solar upper limb visible</small>
        </div>
        <div>
          <span>
            <Icon name="earth" size={14} />
            Earth line of sight
          </span>
          <strong className="earth-color">
            {percent(site.metrics.earth_visibility_fraction)}
          </strong>
          <small>Geometric opportunity</small>
        </div>
        <div>
          <span>Longest darkness</span>
          <strong>{hours(site.metrics.longest_darkness_hours)}</strong>
          <small>Within mission window</small>
        </div>
        <div>
          <span>Longest blackout</span>
          <strong>{hours(site.metrics.longest_blackout_hours)}</strong>
          <small>Earth center blocked</small>
        </div>
      </div>
      <div className="analysis-grid">
        <article className="chart-panel">
          <div className="chart-heading">
            <h3>Mission timeline</h3>
            <span className="small muted">UTC Â· sampled visibility</span>
          </div>
          <div className="playback-controls">
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                if (index >= site.timeline.length - 1) setIndex(0);
                setPlaying((current) => !current);
              }}
            >
              <Icon name={playing ? "pause" : "play"} size={14} />
              {playing ? "Pause mission" : "Play mission"}
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() =>
                downloadTimelineCsv(
                  site.timeline.map((sample) => ({ ...sample })),
                  `lumen-timeline-${site.id}.csv`,
                )
              }
            >
              <Icon name="download" size={13} />
              Timeline CSV
            </button>
          </div>
          <Timeline
            site={site}
            index={Math.min(index, site.timeline.length - 1)}
            onIndex={(value) => {
              setPlaying(false);
              setIndex(value);
            }}
          />
          <div className="selected-time">
            <span className="eyebrow">INSPECTING</span>
            <strong>{sample ? utcTime(sample.time_utc) : "Unavailable"}</strong>
          </div>
          {sample && (
            <div className="sky-readouts">
              <div>
                <span className="sun-color">
                  <Icon name="sun" size={15} /> Sun
                </span>
                <strong>
                  {sample.sun_visible
                    ? sample.solar_fraction < 0.999
                      ? "Partial disk"
                      : "Above horizon"
                    : "Blocked"}
                </strong>
                <small>
                  Az {sample.sun_azimuth_deg.toFixed(1)}Â° Â· El{" "}
                  {sample.sun_elevation_deg.toFixed(2)}Â°
                </small>
                <small>
                  Terrain {sample.sun_horizon_deg.toFixed(2)}Â° Â· disk{" "}
                  {percent(sample.solar_fraction)}
                </small>
              </div>
              <div>
                <span className="earth-color">
                  <Icon name="earth" size={15} /> Earth
                </span>
                <strong>
                  {sample.earth_visible ? "Line of sight" : "Blocked"}
                </strong>
                <small>
                  Az {sample.earth_azimuth_deg.toFixed(1)}Â° Â· El{" "}
                  {sample.earth_elevation_deg.toFixed(2)}Â°
                </small>
                <small>
                  Terrain horizon {sample.earth_horizon_deg.toFixed(2)}Â°
                </small>
              </div>
            </div>
          )}
        </article>
        <article className="chart-panel">
          <div className="chart-heading">
            <h3>What blocks the view?</h3>
            <span className="small muted">
              Local sky Â· azimuth / elevation
            </span>
          </div>
          <HorizonChart site={site} sample={sample} />
          <div className="timeline-legend">
            <span>
              <i className="sun-dot" />
              Sun path
            </span>
            <span>
              <i className="earth-dot" />
              Earth path
            </span>
            <span>
              <i className="horizon-dot" />
              Terrain horizon
            </span>
          </div>
          <p className="field-hint">
            Paths span the common mission window. Points show the selected time.
            Terrain is sampled at 5Â° azimuth spacing to 200 km; intervening
            ridges may be missed.
          </p>
          <details className="data-table-details">
            <summary>View terrain horizon as a table</summary>
            <div className="table-scroll compact">
              <table>
                <thead>
                  <tr>
                    <th>Azimuth</th>
                    <th>Horizon elevation</th>
                    <th>Blocker distance</th>
                  </tr>
                </thead>
                <tbody>
                  {site.horizon.map((p) => (
                    <tr key={p.azimuth_deg}>
                      <td>{p.azimuth_deg.toFixed(0)}Â°</td>
                      <td>{p.elevation_deg.toFixed(2)}Â°</td>
                      <td>
                        {p.distance_m == null
                          ? "Unavailable"
                          : `${(p.distance_m / 1000).toFixed(2)} km`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </article>
      </div>
    </section>
  );
}
