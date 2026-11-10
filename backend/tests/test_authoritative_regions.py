from datetime import UTC, datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from test_validation import request_for

from app.main import app
from app.models import Coordinate, RegionSelection, SearchRequest, SelectorType
from app.services.ephemeris import KERNEL_FILES
from app.services.proximity import feature_catalog
from app.services.search import search
from app.services.validation import SearchValidationError, validate_search
from app.settings import settings


def named_request():
    request = request_for(datetime(2028, 10, 1, tzinfo=UTC), datetime(2028, 10, 2, tzinfo=UTC))
    request.region = RegionSelection(
        selector_type=SelectorType.feature_radius,
        resolved_feature_id="iau-5450",
        search_radius_km=20,
        center=Coordinate(latitude_deg=0, longitude_deg_east=100),
        input_text="forged name",
    )
    return request


def test_approved_feature_replaces_forged_coordinates_and_name():
    request = named_request()
    approved = next(
        row for row in feature_catalog(settings.data_root)["features"] if row["id"] == "iau-5450"
    )
    response = validate_search(request)
    assert request.region.center.latitude_deg == approved["latitude_deg"]
    assert request.region.center.longitude_deg_east == approved["longitude_deg_east"]
    assert request.region.input_text == approved["name"]
    assert any("supplied coordinates are replaced" in value for value in response.assumptions)


def test_approved_feature_id_resolves_without_client_coordinates():
    request = named_request()
    request.region.center = None
    parsed = SearchRequest.model_validate(request.model_dump())
    validate_search(parsed)
    assert parsed.region.center is not None
    assert parsed.region.input_text == "Shackleton"


def test_unknown_named_feature_is_422_and_cannot_fall_back_to_client_circle():
    request = named_request()
    request.region.resolved_feature_id = "invented-feature"
    with pytest.raises(SearchValidationError, match="approved region feature"):
        validate_search(request)
    result = TestClient(app).post("/api/v1/candidates/search", json=request.model_dump(mode="json"))
    assert result.status_code == 422


def test_equivalent_offset_dates_have_identical_canonical_request_and_search_id():
    if not all((settings.kernel_root / name).exists() for name in KERNEL_FILES):
        pytest.skip("NAIF kernels not installed")
    base = named_request()
    equivalent = named_request()
    offset = timezone(timedelta(hours=-7))
    equivalent.time_range.start_utc = base.time_range.start_utc.astimezone(offset)
    equivalent.time_range.end_utc = base.time_range.end_utc.astimezone(offset)
    baseline, shifted = search(base), search(equivalent)
    assert baseline["request"] == shifted["request"]
    assert baseline["search_id"] == shifted["search_id"]
    assert baseline["request"]["region"]["input_text"] == "Shackleton"
    assert baseline["request"]["region"]["center"]["latitude_deg"] < -89
