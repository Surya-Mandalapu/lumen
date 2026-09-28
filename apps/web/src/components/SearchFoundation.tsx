import { useState } from "react";
import { validateSearch } from "../lib/api";
import type { Preferences, SearchValidationResponse } from "../lib/types";

const initialWeights: Preferences = {
  illumination: 35,
  earth_visibility: 45,
  terrain_safety: 15,
  science_proximity: 5,
};

export function SearchFoundation() {
  const [weights, setWeights] = useState(initialWeights);
  const [result, setResult] = useState<SearchValidationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onValidate() {
    setLoading(true);
    setError(null);
    try {
      setResult(
        await validateSearch({
          start_utc: "2028-10-01T00:00:00Z",
          end_utc: "2028-10-31T00:00:00Z",
          search_radius_km: 20,
          preferences: weights,
        }),
      );
    } catch (reason) {
      setResult(null);
      setError(reason instanceof Error ? reason.message : "Validation failed.");
    } finally {
      setLoading(false);
    }
  }

  function updateWeight(key: keyof Preferences, value: number) {
    setWeights((current) => ({ ...current, [key]: value }));
  }

  return (
    <section className="planner-card" aria-labelledby="planner-title">
      <div className="section-kicker">Structured search</div>
      <h2 id="planner-title">Representative Shackleton scenario</h2>
      <p className="muted">October 1–31, 2028 · 20 km radius · maximum slope 10°</p>

      <div className="weight-grid">
        {(Object.keys(weights) as Array<keyof Preferences>).map((key) => (
          <label key={key}>
            <span>{key.replaceAll("_", " ")}</span>
            <strong>{weights[key]}%</strong>
            <input
              type="range"
              min="0"
              max="100"
              value={weights[key]}
              onChange={(event) => updateWeight(key, Number(event.target.value))}
            />
          </label>
        ))}
      </div>

      <button type="button" onClick={onValidate} disabled={loading}>
        {loading ? "Validating…" : "Validate configuration"}
      </button>

      {result && (
        <div className="validation-result" role="status">
          <strong>Configuration valid</strong>
          <span>
            Normalized Earth visibility weight:{" "}
            {(result.normalized_preferences.earth_visibility * 100).toFixed(0)}%
          </span>
          <span>Estimated candidates: {result.estimated_candidate_count.toLocaleString()}</span>
        </div>
      )}
      {error && <div className="error-result" role="alert">{error}</div>}
    </section>
  );
}

