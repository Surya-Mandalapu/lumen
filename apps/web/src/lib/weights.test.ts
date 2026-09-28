import { describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES, normalizePreferences } from "./weights";

describe("normalizePreferences", () => {
  it("normalizes nonnegative weights", () => {
    const result = normalizePreferences({
      illumination: 35,
      earth_visibility: 45,
      terrain_safety: 15,
      science_proximity: 5,
    });

    expect(result).toEqual({
      illumination: 0.35,
      earth_visibility: 0.45,
      terrain_safety: 0.15,
      science_proximity: 0.05,
    });
  });

  it("uses documented defaults for an all-zero input", () => {
    expect(
      normalizePreferences({
        illumination: 0,
        earth_visibility: 0,
        terrain_safety: 0,
        science_proximity: 0,
      }),
    ).toEqual(DEFAULT_PREFERENCES);
  });
});

