import type { Candidate, SearchResponse } from "../lib/types";
import { constraintEvidence, contributions } from "../lib/explanations";

export function ResultExplanation({
  site,
  result,
}: {
  site: Candidate;
  result: SearchResponse;
}) {
  const parts = contributions(site, result.normalized_preferences);
  const strongest = parts.find((part) => part.points > 0);
  const checks = constraintEvidence(site, result.request);
  return (
    <details className="result-explanation">
      <summary>
        Why this site? · Candidate {String(site.rank).padStart(2, "0")}
      </summary>
      <div className="explanation-body">
        <p>
          {strongest
            ? `${strongest.label} contributes the most to this site's score (${strongest.points.toFixed(1)} points).`
            : "No category contributes a positive score under these preferences."}{" "}
          All shortlist sites pass the applied hard constraints.
        </p>
        <dl className="contribution-list">
          {parts.map((part) => (
            <div key={part.key}>
              <dt>
                {part.label}{" "}
                <small>({(part.weight * 100).toFixed(0)}% weight)</small>
              </dt>
              <dd>
                {part.utility == null
                  ? "Unavailable"
                  : `${part.points.toFixed(1)} points`}
              </dd>
            </div>
          ))}
        </dl>
        {checks.length > 0 && (
          <ul className="constraint-evidence">
            {checks.map((check) => (
              <li key={check.label}>
                <strong>
                  {check.passes == null
                    ? "Unknown"
                    : check.passes
                      ? "Pass"
                      : "Outside limit"}
                </strong>{" "}
                · {check.label}:{" "}
                {check.value == null
                  ? "unavailable"
                  : `${(check.value * check.factor).toFixed(2)}${check.unit}`}{" "}
                {check.minimum ? "≥" : "≤"}{" "}
                {(check.limit * check.factor).toFixed(2)}
                {check.unit}
              </li>
            ))}
          </ul>
        )}
        <p className="field-hint">
          Values above are rounded for display; checks use raw metrics. Rank
          also reflects a 1.5 km separation between shortlisted sites. Scores
          express mission priorities, not success probabilities.
        </p>
      </div>
    </details>
  );
}
