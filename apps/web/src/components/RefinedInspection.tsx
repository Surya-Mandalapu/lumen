import { useEffect, useState } from "react";
import type { Candidate, SearchResponse, SiteDetail } from "../lib/types";
import { getSiteAnalysis } from "../lib/api";
import { coordinate, downloadJson, utcTime } from "../lib/format";
import { Icon } from "./Icon";

export function RefinedInspection({
  site,
  result,
}: {
  site: Candidate;
  result: SearchResponse;
}) {
  const [detail, setDetail] = useState<SiteDetail | null>(null),
    [error, setError] = useState<string | null>(null),
    [retry, setRetry] = useState(0),
    [azimuth, setAzimuth] = useState(0),
    [showBlocked, setShowBlocked] = useState(false),
    [limit, setLimit] = useState(20);
  useEffect(() => {
    const abort = new AbortController();
    setDetail(null);
    setError(null);
    getSiteAnalysis(site.id, result.request, abort.signal)
      .then(setDetail)
      .catch((reason: unknown) => {
        if (!abort.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not refine these event times.",
          );
      });
    return () => abort.abort();
  }, [site.id, result.search_id, retry]);
  const profile = detail?.horizon ?? site.horizon;
  const blocker = profile[Math.min(azimuth, profile.length - 1)];
  const events = detail
    ? [
        ...detail.intervals.sun.map((event) => ({ ...event, body: "Sun" })),
        ...detail.intervals.earth.map((event) => ({ ...event, body: "Earth" })),
      ]
        .filter((event) => showBlocked || event.visible)
        .sort((a, b) => Date.parse(a.start_utc) - Date.parse(b.start_utc))
    : [];
  function chooseRay(body: "sun" | "earth") {
    const sample = site.timeline[0];
    if (!sample || !profile.length) return;
    const angle =
      body === "sun" ? sample.sun_azimuth_deg : sample.earth_azimuth_deg;
    const left = Math.floor((angle / 360) * profile.length) % profile.length,
      right = (left + 1) % profile.length;
    setAzimuth(
      profile[left].elevation_deg >= profile[right].elevation_deg
        ? left
        : right,
    );
  }
  const angle = ((blocker?.azimuth_deg ?? 0) * Math.PI) / 180;
  return (
    <section className="refined-inspection" aria-labelledby="refined-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">BEYOND THE FIVE-MINUTE GRID</span>
          <h2 id="refined-title">Follow a transition. Find its horizon.</h2>
        </div>
        <button
          className="text-button"
          disabled={!detail}
          onClick={() => downloadJson(detail, `lumen-site-${site.id}.json`)}
        >
          <Icon name="download" size={15} />
          Site evidence
        </button>
      </div>
      {error ? (
        <div className="error-box" role="alert">
          {error}
          <button
            className="text-button"
            onClick={() => setRetry((current) => current + 1)}
          >
            Retry inspection
          </button>
        </div>
      ) : (
        !detail && (
          <p className="loading-inline" role="status">
            <span className="spinner" />
            Refining bracketed Sun and Earth transitions…
          </p>
        )
      )}
      <div className="refinement-grid">
        <article className="chart-panel">
          <div className="chart-heading">
            <h3>Visibility events</h3>
            <span className="subtle-badge">≤ 60 s brackets</span>
          </div>
          <p className="field-hint">
            Transitions detected by the five-minute grid are bisected to at most
            one minute. Short grazing events may still be missed; ranking
            metrics retain the five-minute calculation.
          </p>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={showBlocked}
              onChange={(e) => {
                setShowBlocked(e.target.checked);
                setLimit(20);
              }}
            />
            Include blocked intervals
          </label>
          {detail && (
            <>
              <div className="table-scroll event-table">
                <table>
                  <thead>
                    <tr>
                      <th>Body / state</th>
                      <th>Start UTC</th>
                      <th>End UTC</th>
                      <th>Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.slice(0, limit).map((event, i) => (
                      <tr key={`${event.body}-${i}`}>
                        <th>
                          <span
                            className={
                              event.body === "Sun" ? "sun-color" : "earth-color"
                            }
                          >
                            {event.body}
                          </span>{" "}
                          · {event.visible ? "visible" : "blocked"}
                        </th>
                        <td>{utcTime(event.start_utc).replace(" UTC", "")}</td>
                        <td>{utcTime(event.end_utc).replace(" UTC", "")}</td>
                        <td>{event.duration_hours.toFixed(2)} h</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {events.length === 0 && (
                <p className="field-hint">
                  No visible intervals in this mission window.
                </p>
              )}
              {events.length > limit && (
                <button
                  className="text-button"
                  onClick={() => setLimit((current) => current + 20)}
                >
                  Show more intervals ({events.length - limit} remaining)
                </button>
              )}
              <p className="field-hint">
                {detail.refinement.transition_count} bracketed transitions
                refined. Mission edges clip each interval.
              </p>
            </>
          )}
        </article>
        <article className="chart-panel">
          <div className="chart-heading">
            <h3>The sampled blocking terrain</h3>
            <span className="small muted">Approximate location</span>
          </div>
          <div className="blocker-layout">
            <svg
              viewBox="0 0 180 180"
              className="blocker-compass"
              role="img"
              aria-label={`Horizon ray at ${blocker?.azimuth_deg ?? 0} degrees azimuth`}
            >
              <circle cx="90" cy="90" r="65" fill="none" stroke="#42574a" />
              <circle
                cx="90"
                cy="90"
                r="36"
                fill="none"
                stroke="#2f4135"
                strokeDasharray="3 5"
              />
              <path d="M90 15v150M15 90h150" stroke="#2f4135" />
              <text x="90" y="13" textAnchor="middle">
                N
              </text>
              <text x="171" y="94" textAnchor="middle">
                E
              </text>
              <text x="90" y="178" textAnchor="middle">
                S
              </text>
              <text x="8" y="94" textAnchor="middle">
                W
              </text>
              <line
                x1="90"
                y1="90"
                x2={90 + Math.sin(angle) * 65}
                y2={90 - Math.cos(angle) * 65}
                stroke="#b8d3b7"
                strokeWidth="2"
              />
              <circle
                cx={90 + Math.sin(angle) * 65}
                cy={90 - Math.cos(angle) * 65}
                r="4"
                fill="#d6c38b"
              />
              <circle cx="90" cy="90" r="3" fill="#b8d3b7" />
            </svg>
            <dl className="blocker-readouts">
              <div>
                <dt>Azimuth / horizon</dt>
                <dd>
                  {blocker?.azimuth_deg.toFixed(0)}° /{" "}
                  {blocker?.elevation_deg.toFixed(2)}°
                </dd>
              </div>
              <div>
                <dt>Range to sampled blocker</dt>
                <dd>
                  {blocker?.distance_m == null
                    ? "Unavailable"
                    : `${(blocker.distance_m / 1000).toFixed(2)} km`}
                </dd>
              </div>
              <div>
                <dt>Blocker coordinates</dt>
                <dd>
                  {blocker?.blocker_latitude_deg == null ||
                  blocker.blocker_longitude_deg_east == null
                    ? "Loading source geometry…"
                    : coordinate(
                        blocker.blocker_latitude_deg,
                        blocker.blocker_longitude_deg_east,
                      )}
                </dd>
              </div>
            </dl>
          </div>
          <label className="field">
            Inspect horizon azimuth{" "}
            <input
              aria-label="Blocker azimuth"
              type="range"
              min="0"
              max={Math.max(0, profile.length - 1)}
              value={azimuth}
              onChange={(e) => setAzimuth(Number(e.target.value))}
            />
          </label>
          <div className="dialog-actions">
            <button
              className="secondary-button"
              onClick={() => chooseRay("sun")}
            >
              <Icon name="sun" size={14} />
              Sun at start
            </button>
            <button
              className="secondary-button"
              onClick={() => chooseRay("earth")}
            >
              <Icon name="earth" size={14} />
              Earth at start
            </button>
          </div>
          <p className="field-hint">
            This is the highest sampled terrain cell along a 5° ray, not an
            identified ridge boundary. It may lie outside the displayed study
            square.
          </p>
        </article>
      </div>
    </section>
  );
}
