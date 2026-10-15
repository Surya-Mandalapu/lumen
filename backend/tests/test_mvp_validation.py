from datetime import UTC, datetime

import pytest
from pydantic import ValidationError
from test_validation import request_for

from app.models import HardConstraints, Preferences, SelectorType
from app.services.validation import SearchValidationError, validate_search


def make_request():
    return request_for(datetime(2028, 10, 1, tzinfo=UTC), datetime(2028, 10, 2, tzinfo=UTC))


def test_permissive_maximum_blackout_is_valid():
    request = make_request()
    request.hard_constraints = HardConstraints(
        maximum_continuous_blackout_hours=100, maximum_continuous_darkness_hours=100
    )
    assert validate_search(request).valid


def test_impossible_minimum_communication_is_invalid():
    request = make_request()
    request.hard_constraints = HardConstraints(minimum_continuous_communication_hours=25)
    with pytest.raises(SearchValidationError, match="mission duration"):
        validate_search(request)


def test_unimplemented_polygon_and_unavailable_science_filters_are_explicit(monkeypatch):
    request = make_request()
    request.region.selector_type = SelectorType.polygon
    with pytest.raises(SearchValidationError, match="Polygon"):
        validate_search(request)
    request = make_request()
    request.hard_constraints.maximum_distance_to_psr_km = 1
    from app.services.dataset import DataUnavailable

    def unavailable(_):
        raise DataUnavailable("Missing test proximity bundle")

    monkeypatch.setattr("app.services.validation.dataset", unavailable)
    with pytest.raises(SearchValidationError, match="unavailable"):
        validate_search(request)


def test_rejects_nonfinite_weights():
    with pytest.raises(ValidationError):
        Preferences(illumination=float("inf"))


def test_rejects_naive_datetime_and_outside_cap():
    request = make_request()
    request.time_range.start_utc = datetime(2028, 10, 1, tzinfo=None)  # noqa: DTZ001
    with pytest.raises(SearchValidationError, match="UTC offset"):
        validate_search(request)
    request = make_request()
    request.region.center.latitude_deg = 20
    with pytest.raises(SearchValidationError, match="south-pole"):
        validate_search(request)
