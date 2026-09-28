export type DataStatus = "not_downloaded" | "source_available" | "prepared";

export interface RegionManifest {
  application: string;
  dataset_version: string;
  status: DataStatus;
  supported_region: {
    id: string;
    label: string;
    minimum_latitude_deg: number;
    maximum_latitude_deg: number;
    longitude_convention: string;
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
}

export interface Preferences {
  illumination: number;
  earth_visibility: number;
  terrain_safety: number;
  science_proximity: number;
}

export interface SearchValidationResponse {
  valid: boolean;
  normalized_preferences: Preferences;
  assumptions: string[];
  warnings: string[];
  estimated_candidate_count: number;
}

