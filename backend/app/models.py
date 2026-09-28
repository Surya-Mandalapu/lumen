from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SelectorType(StrEnum):
    full_supported_region = "full_supported_region"
    feature_radius = "feature_radius"
    circle = "circle"
    polygon = "polygon"


class Coordinate(StrictModel):
    latitude_deg: float = Field(ge=-90, le=90)
    longitude_deg_east: float = Field(ge=-180, lt=180)


class RegionSelection(StrictModel):
    selector_type: SelectorType
    input_text: str | None = Field(default=None, max_length=500)
    resolved_feature_id: str | None = Field(default=None, max_length=200)
    center: Coordinate | None = None
    search_radius_km: float | None = Field(default=None, ge=1, le=50)

    @model_validator(mode="after")
    def validate_spatial_selector(self) -> RegionSelection:
        if self.selector_type in {
            SelectorType.feature_radius,
            SelectorType.circle,
        } and (self.center is None or self.search_radius_km is None):
            raise ValueError("Circle and feature-radius searches require center and radius.")
        return self


class TimeRange(StrictModel):
    start_utc: datetime
    end_utc: datetime


class HardConstraints(StrictModel):
    maximum_slope_deg: float | None = Field(default=None, ge=0, le=90)
    maximum_roughness_m: float | None = Field(default=None, ge=0)
    minimum_elevation_m: float | None = None
    maximum_elevation_m: float | None = None
    minimum_illumination_fraction: float | None = Field(default=None, ge=0, le=1)
    minimum_continuous_sunlight_hours: float | None = Field(default=None, ge=0)
    maximum_continuous_darkness_hours: float | None = Field(default=None, ge=0)
    minimum_earth_visibility_fraction: float | None = Field(default=None, ge=0, le=1)
    minimum_continuous_communication_hours: float | None = Field(default=None, ge=0)
    maximum_continuous_blackout_hours: float | None = Field(default=None, ge=0)
    maximum_distance_to_psr_km: float | None = Field(default=None, ge=0)
    maximum_distance_to_science_feature_km: float | None = Field(default=None, ge=0)
    science_feature_ids: list[str] = Field(default_factory=list, max_length=20)


class Preferences(StrictModel):
    illumination: float = Field(default=0.35, ge=0)
    earth_visibility: float = Field(default=0.35, ge=0)
    terrain_safety: float = Field(default=0.20, ge=0)
    science_proximity: float = Field(default=0.10, ge=0)


class SearchRequest(StrictModel):
    region: RegionSelection
    time_range: TimeRange
    hard_constraints: HardConstraints = Field(default_factory=HardConstraints)
    preferences: Preferences = Field(default_factory=Preferences)


class SearchValidationResponse(StrictModel):
    valid: bool
    normalized_preferences: Preferences
    assumptions: list[str]
    warnings: list[str]
    estimated_candidate_count: int = Field(ge=0)

