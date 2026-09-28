from datetime import UTC, datetime

import pytest

from app.models import (
    Coordinate,
    Preferences,
    RegionSelection,
    SearchRequest,
    SelectorType,
    TimeRange,
)
from app.services.validation import SearchValidationError, validate_search


def request_for(start: datetime, end: datetime) -> SearchRequest:
    return SearchRequest(
        region=RegionSelection(
            selector_type=SelectorType.feature_radius,
            input_text="near Shackleton crater",
            resolved_feature_id="fixture-shackleton",
            center=Coordinate(latitude_deg=-89.9, longitude_deg_east=0),
            search_radius_km=20,
        ),
        time_range=TimeRange(start_utc=start, end_utc=end),
        preferences=Preferences(
            illumination=35,
            earth_visibility=45,
            terrain_safety=15,
            science_proximity=5,
        ),
    )


def test_validates_and_normalizes_demo_request() -> None:
    result = validate_search(
        request_for(
            datetime(2028, 10, 1, tzinfo=UTC),
            datetime(2028, 10, 31, tzinfo=UTC),
        )
    )
    assert result.valid is True
    assert result.normalized_preferences.earth_visibility == pytest.approx(0.45)
    assert result.estimated_candidate_count > 0


def test_rejects_windows_over_31_days() -> None:
    with pytest.raises(SearchValidationError, match="31 days"):
        validate_search(
            request_for(
                datetime(2028, 1, 1, tzinfo=UTC),
                datetime(2028, 2, 2, tzinfo=UTC),
            )
        )

