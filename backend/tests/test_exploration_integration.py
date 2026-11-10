from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from test_validation import request_for

from app.main import app
from app.models import HardConstraints, ScenarioRequest, SelectorType
from app.services.ephemeris import KERNEL_FILES
from app.services.search import search
from app.services.sites import scenario_analysis, site_analysis
from app.settings import settings


def test_real_proximity_search_site_and_fixed_scenario_agree():
    if not all((settings.kernel_root / name).exists() for name in KERNEL_FILES):
        pytest.skip("NAIF kernels not installed")
    if not (settings.data_root / "psr.json").exists():
        pytest.skip("PSR extension not installed")
    request = request_for(datetime(2028, 10, 1, tzinfo=UTC), datetime(2028, 10, 2, tzinfo=UTC))
    request.region.selector_type = SelectorType.full_supported_region
    request.hard_constraints = HardConstraints(
        maximum_slope_deg=10,
        maximum_distance_to_psr_km=1,
        maximum_distance_to_science_feature_km=20,
        science_feature_ids=["iau-5450"],
    )
    result = search(request)
    assert len(result["candidates"]) > 0
    assert len(result["map_candidates"]) == result["counts"]["temporal_pass"]
    for row in result["map_candidates"]:
        assert row["distance_psr_km"] <= 1
        assert row["distance_science_feature_km"] <= 20
        assert row["slope_deg"] <= 10
        assert row["criteria_scores"]["science_proximity"] is not None
    candidate = result["candidates"][0]
    detail = site_analysis(candidate["id"], request)
    assert detail["metrics"] == candidate["metrics"]
    assert detail["score"] == candidate["score"]
    assert detail["criteria_scores"] == candidate["criteria_scores"]
    assert detail["constraint_status"]["passes"]
    for intervals in detail["intervals"].values():
        assert sum(row["duration_hours"] for row in intervals) == pytest.approx(24)
    scenarios = scenario_analysis(
        ScenarioRequest(request=request, site_id=candidate["id"], delay_hours=0, offset_radius_m=0)
    )
    assert scenarios["baseline"] == scenarios["shifted"]
    assert all(value == 0 for value in scenarios["metric_deltas"].values())
    assert scenarios["neighbors"] == []
    assert scenarios["sampling_sensitivity"]["refined_step_minutes"] == 2.5


def test_shifted_dates_outside_supported_range_fail_validation_before_analysis():
    request = request_for(datetime(2025, 1, 1, tzinfo=UTC), datetime(2025, 1, 2, tzinfo=UTC))
    result = TestClient(app).post(
        "/api/v1/scenarios/analyze",
        json={
            "request": request.model_dump(mode="json"),
            "site_id": "unused-site",
            "delay_hours": -24,
        },
    )
    assert result.status_code == 422
    assert "2025" in result.json()["detail"]
