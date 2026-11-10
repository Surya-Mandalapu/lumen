import type { SearchRequest } from "./types";

export const DEFAULT_REQUEST: SearchRequest = {
  region: { selector_type: "full_supported_region" },
  time_range: {
    start_utc: "2028-10-01T00:00:00Z",
    end_utc: "2028-10-31T00:00:00Z",
  },
  hard_constraints: {
    maximum_slope_deg: 10,
    minimum_earth_visibility_fraction: 0.5,
  },
  preferences: {
    illumination: 40,
    earth_visibility: 40,
    terrain_safety: 20,
    science_proximity: 0,
  },
};

export const MISSION_PRESETS = [
  {
    id: "balanced",
    name: "Polar pathfinder",
    description:
      "A representative October 2028 mission. Balance power, Earth access, and terrain.",
    request: DEFAULT_REQUEST,
  },
  {
    id: "solar",
    name: "Follow the light",
    description:
      "Explore sunlight continuity while keeping terrain slopes below 10°.",
    request: {
      ...DEFAULT_REQUEST,
      hard_constraints: { maximum_slope_deg: 10 },
      preferences: {
        illumination: 65,
        earth_visibility: 15,
        terrain_safety: 20,
        science_proximity: 0,
      },
    },
  },
  {
    id: "contact",
    name: "Keep Earth in view",
    description:
      "Prioritize Earth-center visibility. This is a geometric study, not an RF prediction.",
    request: {
      ...DEFAULT_REQUEST,
      hard_constraints: {
        maximum_slope_deg: 12,
        minimum_earth_visibility_fraction: 0.6,
      },
      preferences: {
        illumination: 20,
        earth_visibility: 65,
        terrain_safety: 15,
        science_proximity: 0,
      },
    },
  },
  {
    id: "science",
    name: "Shadow frontier",
    description:
      "Compare proximity to mapped permanently shadowed terrain with sunlight and Earth access.",
    request: {
      ...DEFAULT_REQUEST,
      hard_constraints: {
        maximum_slope_deg: 12,
        maximum_distance_to_psr_km: 5,
      },
      preferences: {
        illumination: 25,
        earth_visibility: 25,
        terrain_safety: 20,
        science_proximity: 30,
      },
    },
  },
] satisfies {
  id: string;
  name: string;
  description: string;
  request: SearchRequest;
}[];

export interface SavedMission {
  id: string;
  name: string;
  saved_utc: string;
  request: SearchRequest;
}
const STORAGE_KEY = "lumen-missions-v1";

export function isMissionRequest(value: unknown): value is SearchRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as SearchRequest;
  return Boolean(
    request.region &&
      ["circle", "feature_radius", "full_supported_region"].includes(
        request.region.selector_type,
      ) &&
      request.time_range &&
      Number.isFinite(Date.parse(request.time_range.start_utc)) &&
      Number.isFinite(Date.parse(request.time_range.end_utc)) &&
      request.hard_constraints &&
      typeof request.hard_constraints === "object" &&
      request.preferences &&
      [
        "illumination",
        "earth_visibility",
        "terrain_safety",
        "science_proximity",
      ].every(
        (key) =>
          typeof request.preferences[
            key as keyof typeof request.preferences
          ] === "number" &&
          Number.isFinite(
            request.preferences[key as keyof typeof request.preferences],
          ) &&
          request.preferences[key as keyof typeof request.preferences] >= 0,
      ),
  );
}

export function readSavedMissions(): SavedMission[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(saved)
      ? saved
          .filter(
            (item) =>
              typeof item?.id === "string" &&
              typeof item?.name === "string" &&
              typeof item?.saved_utc === "string" &&
              isMissionRequest(item.request),
          )
          .slice(0, 12)
      : [];
  } catch {
    return [];
  }
}

export function writeSavedMissions(missions: SavedMission[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(missions.slice(0, 12)));
}

export function shiftWindow(
  request: SearchRequest,
  hours: number,
): SearchRequest {
  return {
    ...request,
    time_range: {
      start_utc: new Date(
        Date.parse(request.time_range.start_utc) + hours * 3600000,
      ).toISOString(),
      end_utc: new Date(
        Date.parse(request.time_range.end_utc) + hours * 3600000,
      ).toISOString(),
    },
  };
}
