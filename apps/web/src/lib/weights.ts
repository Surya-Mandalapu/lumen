import type { Preferences } from "./types";

export const DEFAULT_PREFERENCES: Preferences = {
  illumination: 0.35,
  earth_visibility: 0.35,
  terrain_safety: 0.2,
  science_proximity: 0.1,
};

export function normalizePreferences(input: Preferences): Preferences {
  const values = Object.values(input);
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error("Preference weights must be finite and nonnegative.");
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  if (total === 0) {
    return { ...DEFAULT_PREFERENCES };
  }

  return {
    illumination: input.illumination / total,
    earth_visibility: input.earth_visibility / total,
    terrain_safety: input.terrain_safety / total,
    science_proximity: input.science_proximity / total,
  };
}

