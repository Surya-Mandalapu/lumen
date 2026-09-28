import type {
  Preferences,
  RegionManifest,
  SearchValidationResponse,
} from "./types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

async function expectJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Request failed with status ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function getRegionManifest(): Promise<RegionManifest> {
  return expectJson(await fetch(`${API_BASE}/region`));
}

export async function validateSearch(input: {
  start_utc: string;
  end_utc: string;
  search_radius_km: number;
  preferences: Preferences;
}): Promise<SearchValidationResponse> {
  return expectJson(
    await fetch(`${API_BASE}/search/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        region: {
          selector_type: "feature_radius",
          input_text: "near Shackleton crater",
          resolved_feature_id: "USGS_PLACEHOLDER_SHACKLETON",
          center: { latitude_deg: -89.9, longitude_deg_east: 0 },
          search_radius_km: input.search_radius_km,
        },
        time_range: {
          start_utc: input.start_utc,
          end_utc: input.end_utc,
        },
        hard_constraints: {
          maximum_slope_deg: 10,
          minimum_earth_visibility_fraction: 0.5,
        },
        preferences: input.preferences,
      }),
    }),
  );
}

