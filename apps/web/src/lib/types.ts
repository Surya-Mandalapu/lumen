export interface Preferences {
  illumination: number;
  earth_visibility: number;
  terrain_safety: number;
  science_proximity: number;
}
export interface RegionManifest {
  application: string;
  dataset_version: string;
  status: string;
  supported_region: {
    label: string;
    minimum_latitude_deg: number;
    maximum_latitude_deg: number;
    boundary_description: string;
  };
  analysis: {
    terrain_resolution_m: number;
    candidate_spacing_m: number;
    observer_height_m: number;
    horizon_azimuth_step_deg: number;
    horizon_maximum_range_km: number;
    coarse_time_step_minutes: number;
    finalist_time_step_minutes: number;
  };
  valid_time_range: {
    start_utc: string;
    end_utc: string;
    maximum_query_days: number;
  };
  disclaimers: string[];
  [key: string]: unknown;
}
export interface SearchRequest {
  region: {
    selector_type: "circle" | "feature_radius" | "full_supported_region";
    input_text?: string;
    resolved_feature_id?: string;
    center?: { latitude_deg: number; longitude_deg_east: number };
    search_radius_km?: number;
  };
  time_range: { start_utc: string; end_utc: string };
  hard_constraints: {
    maximum_slope_deg?: number;
    maximum_roughness_m?: number;
    minimum_elevation_m?: number;
    maximum_elevation_m?: number;
    minimum_illumination_fraction?: number;
    minimum_earth_visibility_fraction?: number;
    maximum_continuous_darkness_hours?: number;
    maximum_continuous_blackout_hours?: number;
    minimum_continuous_sunlight_hours?: number;
    minimum_continuous_communication_hours?: number;
    maximum_distance_to_psr_km?: number;
    maximum_distance_to_science_feature_km?: number;
    science_feature_ids?: string[];
  };
  preferences: Preferences;
}
export interface SearchValidationResponse {
  valid: boolean;
  normalized_preferences: Preferences;
  assumptions: string[];
  warnings: string[];
  estimated_candidate_count: number;
}
export interface TimeSample {
  time_utc: string;
  sun_azimuth_deg: number;
  sun_elevation_deg: number;
  earth_azimuth_deg: number;
  earth_elevation_deg: number;
  sun_horizon_deg: number;
  earth_horizon_deg: number;
  solar_fraction: number;
  sun_visible: boolean;
  earth_visible: boolean;
}
export interface Candidate {
  id: string;
  rank: number;
  latitude_deg: number;
  longitude_deg_east: number;
  x_m: number;
  y_m: number;
  elevation_m: number;
  slope_deg: number;
  roughness_m: number;
  distance_psr_km?: number;
  distance_science_feature_km?: number;
  score: number;
  criteria_scores: Record<keyof Preferences, number | null>;
  metrics: {
    illumination_fraction: number;
    mean_visible_solar_disk_fraction: number;
    earth_visibility_fraction: number;
    longest_sunlight_hours: number;
    longest_darkness_hours: number;
    longest_communication_hours: number;
    longest_blackout_hours: number;
  };
  timeline: TimeSample[];
  horizon: {
    azimuth_deg: number;
    elevation_deg: number;
    distance_m?: number;
    blocker_latitude_deg?: number;
    blocker_longitude_deg_east?: number;
  }[];
}
export interface SearchResponse {
  search_id: string;
  status: "complete" | "empty";
  request: SearchRequest;
  candidates: Candidate[];
  counts: {
    total: number;
    region: number;
    terrain_pass: number;
    temporal_pass: number;
    shortlisted: number;
  };
  normalized_preferences: Preferences;
  assumptions: string[];
  warnings: string[];
  provenance: Record<string, unknown>;
  common_window: { start_utc: string; end_utc: string; step_minutes: number };
  empty_reason?: string;
  map_candidates?: MapCandidate[];
  failure_counts?: Record<string, number>;
  rejections?: Record<string, number>;
}

export interface LunarFeature {
  id: string;
  name: string;
  latitude_deg: number;
  longitude_deg_east: number;
  diameter_km: number;
  feature_type: string;
  source_url: string;
  approved: boolean;
}
export interface FeatureCollection {
  version: string;
  source: Record<string, unknown>;
  features: LunarFeature[];
}
export interface PSRLayer {
  width: number;
  height: number;
  extent_m: [number, number, number, number];
  psr_fraction: number[];
  resolution_m: number;
  source_resolution_m: number;
  row_order: string;
  source: Record<string, unknown>;
}
export interface MapCandidate {
  id: string;
  x_m: number;
  y_m: number;
  score: number;
  illumination_fraction: number;
  earth_visibility_fraction: number;
  slope_deg: number;
  distance_psr_km?: number;
  criteria_scores?: Candidate["criteria_scores"];
}
export type MapLayer =
  | "terrain"
  | "elevation"
  | "score"
  | "illumination"
  | "earth_visibility"
  | "psr";
export interface VisibilityInterval {
  start_utc: string;
  end_utc: string;
  duration_hours: number;
  visible: boolean;
}
export interface SiteDetail {
  site: Pick<
    Candidate,
    | "id"
    | "latitude_deg"
    | "longitude_deg_east"
    | "x_m"
    | "y_m"
    | "elevation_m"
    | "slope_deg"
    | "roughness_m"
  >;
  metrics: Candidate["metrics"];
  timeline: TimeSample[];
  horizon: Candidate["horizon"];
  intervals: { sun: VisibilityInterval[]; earth: VisibilityInterval[] };
  constraint_status: {
    passes: boolean;
    region_pass: boolean;
    terrain_pass: boolean;
    temporal_pass: boolean;
  };
  refinement: {
    tolerance_seconds: number;
    transition_count: number;
    limitations: string[];
  };
  request: SearchRequest;
  provenance: Record<string, unknown>;
  warnings: string[];
}
export interface TerrainData {
  width: number;
  height: number;
  extent_m: [number, number, number, number];
  elevations_m: (number | null)[];
  resolution_m: number;
}
