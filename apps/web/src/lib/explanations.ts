import type { Candidate, Preferences, SearchRequest } from "./types";

export const scoreCriteria: { key: keyof Preferences; label: string }[] = [
  { key: "illumination", label: "Sunlight" },
  { key: "earth_visibility", label: "Earth visibility" },
  { key: "terrain_safety", label: "Terrain suitability" },
  { key: "science_proximity", label: "Science proximity" },
];

export function contributions(site: Candidate, weights: Preferences) {
  return scoreCriteria
    .map(({ key, label }) => ({
      key,
      label,
      weight: weights[key],
      utility: site.criteria_scores[key],
      points: (site.criteria_scores[key] ?? 0) * weights[key] * 100,
    }))
    .sort((a, b) => b.points - a.points);
}

// Compare the returned raw metrics with the original request. No rounding before
// evaluating constraints, and no alternate scientific calculation in the browser.
export function constraintEvidence(site: Candidate, request: SearchRequest) {
  const c = request.hard_constraints;
  const checks = [
    ["Slope", c.maximum_slope_deg, site.slope_deg, false, "°", 1],
    ["Roughness", c.maximum_roughness_m, site.roughness_m, false, " m", 1],
    [
      "Minimum elevation",
      c.minimum_elevation_m,
      site.elevation_m,
      true,
      " m",
      1,
    ],
    [
      "Maximum elevation",
      c.maximum_elevation_m,
      site.elevation_m,
      false,
      " m",
      1,
    ],
    [
      "Sunlight availability",
      c.minimum_illumination_fraction,
      site.metrics.illumination_fraction,
      true,
      "%",
      100,
    ],
    [
      "Earth visibility",
      c.minimum_earth_visibility_fraction,
      site.metrics.earth_visibility_fraction,
      true,
      "%",
      100,
    ],
    [
      "Continuous sunlight",
      c.minimum_continuous_sunlight_hours,
      site.metrics.longest_sunlight_hours,
      true,
      " h",
      1,
    ],
    [
      "Continuous Earth LOS",
      c.minimum_continuous_communication_hours,
      site.metrics.longest_communication_hours,
      true,
      " h",
      1,
    ],
    [
      "Longest darkness",
      c.maximum_continuous_darkness_hours,
      site.metrics.longest_darkness_hours,
      false,
      " h",
      1,
    ],
    [
      "Longest Earth blackout",
      c.maximum_continuous_blackout_hours,
      site.metrics.longest_blackout_hours,
      false,
      " h",
      1,
    ],
    [
      "Mapped PSR distance",
      c.maximum_distance_to_psr_km,
      site.distance_psr_km,
      false,
      " km",
      1,
    ],
    [
      "Feature-center distance",
      c.maximum_distance_to_science_feature_km,
      site.distance_science_feature_km,
      false,
      " km",
      1,
    ],
  ] as const;
  return checks.flatMap(([label, limit, value, minimum, unit, factor]) => {
    if (limit == null) return [];
    const known = value != null && Number.isFinite(value);
    return [
      {
        label,
        limit,
        value,
        minimum,
        unit,
        factor,
        passes: known ? (minimum ? value >= limit : value <= limit) : null,
      },
    ];
  });
}

export function comparisonTradeoffs(a: Candidate, b: Candidate) {
  const rows = [
    {
      label: "sunlight availability",
      a: a.metrics.illumination_fraction * 100,
      b: b.metrics.illumination_fraction * 100,
      unit: "percentage points",
      higher: true,
    },
    {
      label: "Earth visibility",
      a: a.metrics.earth_visibility_fraction * 100,
      b: b.metrics.earth_visibility_fraction * 100,
      unit: "percentage points",
      higher: true,
    },
    {
      label: "longest Earth blackout",
      a: a.metrics.longest_blackout_hours,
      b: b.metrics.longest_blackout_hours,
      unit: "h",
      higher: false,
    },
    {
      label: "slope",
      a: a.slope_deg,
      b: b.slope_deg,
      unit: "°",
      higher: false,
    },
  ];
  return rows.map((row) => {
    const difference = Math.abs(row.a - row.b);
    return {
      ...row,
      difference,
      leader: difference < 0.05 ? null : row.a > row.b === row.higher ? a : b,
    };
  });
}
