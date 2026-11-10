import type { LunarFeature, SearchRequest } from "./types";

export interface BriefInterpretation {
  request: SearchRequest;
  assumptions: string[];
  errors: string[];
  changes: string[];
}
const months = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

/** A bounded local grammar: it extracts request fields, never scientific results. */
export function interpretBrief(
  text: string,
  base: SearchRequest,
  features: LunarFeature[],
): BriefInterpretation {
  const request = structuredClone(base),
    assumptions: string[] = [],
    errors: string[] = [],
    changes: string[] = [];
  const input = text.trim().toLowerCase();
  let recognized = 0;
  if (!input || input.length > 1000)
    return {
      request,
      assumptions,
      changes,
      errors: ["Enter a mission brief of 1–1,000 characters."],
    };
  if (
    /\b(?:safe return|rover rout\w*|link budget|relay optim\w*|trajectory|certif\w*|guarantee|safest)\b/.test(
      input,
    )
  )
    errors.push(
      "This brief asks for a capability outside this surface-comparison tool. Remove that request and use supported planning indicators.",
    );
  const month = input.match(
    new RegExp(`\\b(${months.join("|")})\\s+(20\\d{2})\\b`),
  );
  const range = input.match(
    /\b(20\d{2}-\d{2}-\d{2})\s*(?:to|through|until|–)\s*(20\d{2}-\d{2}-\d{2})\b/,
  );
  if (range) {
    const start = Date.parse(`${range[1]}T00:00:00Z`),
      end = Date.parse(`${range[2]}T00:00:00Z`);
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      new Date(start).toISOString().slice(0, 10) !== range[1] ||
      new Date(end).toISOString().slice(0, 10) !== range[2]
    )
      errors.push("Use real calendar dates in YYYY-MM-DD format.");
    else {
      request.time_range = {
        start_utc: new Date(start).toISOString(),
        end_utc: new Date(end).toISOString(),
      };
      changes.push("Mission date range");
      recognized++;
    }
  } else if (month) {
    const year = Number(month[2]),
      index = months.indexOf(month[1]);
    request.time_range = {
      start_utc: new Date(Date.UTC(year, index, 1)).toISOString(),
      end_utc: new Date(Date.UTC(year, index + 1, 1)).toISOString(),
    };
    assumptions.push(
      `${month[1]} ${year} means the full UTC calendar month; the end is exclusive.`,
    );
    changes.push("Mission calendar month");
    recognized++;
  }
  const nearby = input.match(
    /\b(?:near|around|within\s+\d+(?:\.\d+)?\s*km\s+of)\s+([^,;.]+?)(?=\s+(?:for|during|in|with|prioriti[sz]e|max(?:imum)?|min(?:imum)?)\b|[,;.]|$)/,
  );
  if (nearby && !/^(?:a\s+)?psr$/i.test(nearby[1].trim())) {
    const name = nearby[1].trim().replace(/\s+crater$/, "");
    const feature = features.find((item) => item.name.toLowerCase() === name);
    if (!feature)
      errors.push(
        `“${nearby[1]}” is not resolved in the official local gazetteer. Select a named feature in the form.`,
      );
    else {
      const distance =
        nearby[0].match(/(?:within|radius)\s+(\d+(?:\.\d+)?)\s*km/) ??
        input.match(/\bradius\s+(\d+(?:\.\d+)?)\s*km/);
      const radius = distance ? Number(distance[1]) : 10;
      if (radius < 1 || radius > 50)
        errors.push("Feature radius must be 1–50 km.");
      if (feature.latitude_deg > -87)
        errors.push(
          "The resolved feature center is outside the supported 87°S–90°S cap.",
        );
      request.region = {
        selector_type: "feature_radius",
        resolved_feature_id: feature.id,
        input_text: feature.name,
        center: {
          latitude_deg: feature.latitude_deg,
          longitude_deg_east: feature.longitude_deg_east,
        },
        search_radius_km: radius,
      };
      if (!distance)
        assumptions.push(
          "“Near” uses a 10 km radius. Feature coordinates come from the approved IAU entry.",
        );
      changes.push(`Region near ${feature.name}`);
      recognized++;
    }
  }
  const patterns: {
    key: keyof SearchRequest["hard_constraints"];
    pattern: RegExp;
    factor?: number;
    label: string;
  }[] = [
    {
      key: "maximum_slope_deg",
      pattern:
        /(?:max(?:imum)?\s+slope|slope\s+(?:under|below|at most))\s*(\d+(?:\.\d+)?)\s*(?:°|deg(?:rees?)?)?/,
      label: "Maximum slope",
    },
    {
      key: "minimum_illumination_fraction",
      pattern:
        /(?:min(?:imum)?\s+(?:sunlight|illumination)|(?:sunlight|illumination)\s+(?:at least|above))\s*(\d+(?:\.\d+)?)\s*%/,
      factor: 0.01,
      label: "Minimum sunlight",
    },
    {
      key: "minimum_earth_visibility_fraction",
      pattern:
        /(?:min(?:imum)?\s+earth(?:\s+(?:visibility|los))?|earth(?:\s+(?:visibility|los))?\s+(?:at least|above))\s*(\d+(?:\.\d+)?)\s*%/,
      factor: 0.01,
      label: "Minimum Earth visibility",
    },
    {
      key: "maximum_continuous_darkness_hours",
      pattern:
        /(?:max(?:imum)?\s+darkness|darkness\s+(?:under|below|at most))\s*(\d+(?:\.\d+)?)\s*(?:h|hours?)\b/,
      label: "Maximum darkness",
    },
    {
      key: "maximum_continuous_blackout_hours",
      pattern:
        /(?:max(?:imum)?\s+(?:earth\s+)?blackout|blackout\s+(?:under|below|at most))\s*(\d+(?:\.\d+)?)\s*(?:h|hours?)\b/,
      label: "Maximum blackout",
    },
    {
      key: "maximum_distance_to_psr_km",
      pattern: /psr\s+(?:within|under)\s*(\d+(?:\.\d+)?)\s*km/,
      label: "Maximum PSR distance",
    },
    {
      key: "maximum_distance_to_psr_km",
      pattern: /within\s*(\d+(?:\.\d+)?)\s*km\s*of\s+(?:a\s+)?psr\b/,
      label: "Maximum PSR distance",
    },
  ];
  for (const { key, pattern, factor = 1, label } of patterns) {
    const match = input.match(pattern);
    if (!match) continue;
    // A generic "within ... km of Shackleton" is a region radius, not a PSR constraint.
    if (key === "maximum_distance_to_psr_km" && !/\bpsr\b/.test(input))
      continue;
    const value = Number(match[1]) * factor;
    if (
      (key === "maximum_slope_deg" && value > 90) ||
      (key.endsWith("fraction") && value > 1)
    )
      errors.push(`${label} is outside its allowed range.`);
    else {
      request.hard_constraints[key] = value as never;
      changes.push(label);
      recognized++;
    }
  }
  for (const [phrase, key, label] of [
    [
      /\b(?:max(?:imum)?\s+slope|slope\s+(?:under|below|at most))\b/,
      "maximum_slope_deg",
      "maximum slope in degrees",
    ],
    [
      /\bmin(?:imum)?\s+(?:sunlight|illumination)\b/,
      "minimum_illumination_fraction",
      "minimum sunlight with a % unit",
    ],
    [
      /\bmin(?:imum)?\s+earth\b/,
      "minimum_earth_visibility_fraction",
      "minimum Earth visibility with a % unit",
    ],
    [
      /\bmax(?:imum)?\s+(?:earth\s+)?blackout\b/,
      "maximum_continuous_blackout_hours",
      "maximum blackout in hours",
    ],
    [
      /\bmax(?:imum)?\s+darkness\b/,
      "maximum_continuous_darkness_hours",
      "maximum darkness in hours",
    ],
  ] as const) {
    if (
      phrase.test(input) &&
      !patterns.some(
        (pattern) => pattern.key === key && pattern.pattern.test(input),
      )
    )
      errors.push(`Provide a nonnegative numeric ${label}.`);
  }
  const priority =
    /prioriti[sz]e\s+(sunlight|illumination|earth(?:\s+visibility)?|terrain|flatness|science|psr)/.exec(
      input,
    );
  if (priority) {
    const key = /sun|illum/.test(priority[1])
      ? "illumination"
      : /earth/.test(priority[1])
        ? "earth_visibility"
        : /terrain|flat/.test(priority[1])
          ? "terrain_safety"
          : "science_proximity";
    request.preferences = {
      illumination: 15,
      earth_visibility: 15,
      terrain_safety: 15,
      science_proximity: 0,
      [key]: 60,
    };
    assumptions.push(
      `“Prioritize ${priority[1]}” sets that category to 60 relative weight units and other available categories to 15. Review the normalized percentages.`,
    );
    changes.push("Ranking priorities");
    recognized++;
  } else if (/\bflat\b|long sunlight/.test(input)) {
    const key = /\bflat\b/.test(input) ? "terrain_safety" : "illumination";
    request.preferences = {
      illumination: 20,
      earth_visibility: 20,
      terrain_safety: 20,
      science_proximity: 0,
      [key]: 60,
    };
    assumptions.push(
      "Qualitative wording changes a preference only; it does not invent a hard threshold.",
    );
    changes.push("Qualitative priority");
    recognized++;
  }
  if (
    /\b(?:must|required|require)\b/.test(input) &&
    !patterns.some(({ pattern }) => pattern.test(input))
  )
    errors.push(
      "A mandatory requirement needs a numeric threshold, such as “minimum sunlight 50%”.",
    );
  if (!recognized && !errors.length)
    errors.push(
      "No supported fields were recognized. Try a month, approved feature, numeric constraint, or ranking priority.",
    );
  if (!month && !range)
    assumptions.push("The existing mission dates are retained.");
  if (!nearby) assumptions.push("The existing study region is retained.");
  const start = Date.parse(request.time_range.start_utc),
    end = Date.parse(request.time_range.end_utc);
  if (
    start >= end ||
    end - start > 31 * 86400000 ||
    start < Date.UTC(2025, 0, 1) ||
    end > Date.UTC(2036, 0, 1)
  )
    errors.push(
      "Mission dates must be ordered, within 2025–2035, and span at most 31 days.",
    );
  return { request, assumptions, errors: [...new Set(errors)], changes };
}
