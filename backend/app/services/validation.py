from __future__ import annotations

from datetime import UTC, datetime, timedelta
from math import pi

from app.models import Preferences, SearchRequest, SearchValidationResponse, SelectorType

DEFAULT_PREFERENCES = Preferences(
    illumination=0.35,
    earth_visibility=0.35,
    terrain_safety=0.20,
    science_proximity=0.10,
)
VALID_START = datetime(2025, 1, 1, tzinfo=UTC)
VALID_END = datetime(2036, 1, 1, tzinfo=UTC)
MAXIMUM_WINDOW = timedelta(days=31)
CANDIDATE_SPACING_KM = 0.5
SUPPORTED_CAP_AREA_KM2 = 25_900


class SearchValidationError(ValueError):
    pass


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        raise SearchValidationError("Dates must include a UTC offset.")
    return value.astimezone(UTC)


def normalize_preferences(preferences: Preferences) -> tuple[Preferences, list[str]]:
    values = preferences.model_dump()
    total = sum(values.values())
    if total == 0:
        return DEFAULT_PREFERENCES, ["All weights were zero; documented defaults were applied."]

    return Preferences(**{key: value / total for key, value in values.items()}), []


def _estimate_candidates(request: SearchRequest) -> int:
    if request.region.selector_type == SelectorType.full_supported_region:
        area_km2 = SUPPORTED_CAP_AREA_KM2
    elif request.region.search_radius_km is not None:
        area_km2 = pi * request.region.search_radius_km**2
    else:
        area_km2 = 0
    return round(area_km2 / CANDIDATE_SPACING_KM**2)


def validate_search(request: SearchRequest) -> SearchValidationResponse:
    start = _as_utc(request.time_range.start_utc)
    end = _as_utc(request.time_range.end_utc)

    if start >= end:
        raise SearchValidationError("The mission start must be earlier than the mission end.")
    if end - start > MAXIMUM_WINDOW:
        raise SearchValidationError("Mission windows are limited to 31 days in the prototype.")
    if start < VALID_START or end > VALID_END:
        raise SearchValidationError("Mission dates must fall within the validated 2025–2035 range.")

    constraints = request.hard_constraints
    if (
        constraints.minimum_elevation_m is not None
        and constraints.maximum_elevation_m is not None
        and constraints.minimum_elevation_m > constraints.maximum_elevation_m
    ):
        raise SearchValidationError("Minimum elevation cannot exceed maximum elevation.")

    duration_hours = (end - start).total_seconds() / 3600
    continuous_requirements = {
        "minimum continuous sunlight": constraints.minimum_continuous_sunlight_hours,
        "maximum continuous darkness": constraints.maximum_continuous_darkness_hours,
        "minimum continuous communication": constraints.minimum_continuous_communication_hours,
        "maximum continuous blackout": constraints.maximum_continuous_blackout_hours,
    }
    for label, value in continuous_requirements.items():
        if value is not None and value > duration_hours:
            raise SearchValidationError(f"{label.title()} cannot exceed the mission duration.")

    normalized, assumptions = normalize_preferences(request.preferences)
    warnings: list[str] = []
    if max(normalized.model_dump().values()) == 1:
        warnings.append("One category has 100% weight; all other preferences are ignored.")

    return SearchValidationResponse(
        valid=True,
        normalized_preferences=normalized,
        assumptions=assumptions,
        warnings=warnings,
        estimated_candidate_count=_estimate_candidates(request),
    )

