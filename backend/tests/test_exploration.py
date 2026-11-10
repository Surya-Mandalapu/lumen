from datetime import UTC, datetime, timedelta

import numpy as np
import pytest
from pydantic import ValidationError
from test_validation import request_for

from app.models import ScenarioRequest
from app.services.ephemeris import RADIUS_M, time_grid
from app.services.proximity import great_circle_km, science_utility
from app.services.sites import SiteNotFound, blocker_coordinates, refined_intervals, site_index


def test_half_step_sampling_retains_endpoints_and_sample_nesting():
    start = datetime(2028, 10, 1, tzinfo=UTC)
    end = start + timedelta(minutes=13)
    coarse, fine = time_grid(start, end, 5), time_grid(start, end, 2.5)
    assert set(coarse) <= set(fine)
    assert fine[1] == start + timedelta(seconds=150)
    assert fine[-1] == end


def test_blocker_destination_has_correct_cardinal_geometry_and_wraps():
    degree_distance = RADIUS_M * np.pi / 180
    assert blocker_coordinates(0, 0, 0, degree_distance) == pytest.approx((1, 0))
    assert blocker_coordinates(0, 179.5, 90, degree_distance) == pytest.approx((0, -179.5))
    assert blocker_coordinates(-89.9, 0, 0, 0) == pytest.approx((-89.9, 0))


def test_transition_refinement_brackets_event_and_partitions_window(monkeypatch):
    start = datetime(2028, 10, 1, tzinfo=UTC)
    event = start + timedelta(seconds=92)
    end = start + timedelta(minutes=10)
    timeline = [
        {"time_utc": t.isoformat(), "sun_visible": t >= event, "earth_visible": False}
        for t in [start, start + timedelta(minutes=5), end]
    ]
    monkeypatch.setattr("app.services.sites.visible_at", lambda arrays, index, t, body: t >= event)
    intervals, refinement = refined_intervals({}, 0, timeline)
    transition = refinement["transitions"][0]
    estimated = datetime.fromisoformat(transition["time_utc"])
    assert abs((estimated - event).total_seconds()) <= 30
    assert transition["bracket_seconds"] <= 60
    assert intervals["sun"][0]["visible"] is False
    assert intervals["sun"][1]["visible"] is True
    assert intervals["sun"][0]["end_utc"] == intervals["sun"][1]["start_utc"]
    assert sum(row["duration_hours"] for row in intervals["sun"]) == pytest.approx(1 / 6)
    assert len(intervals["earth"]) == 1


def test_unknown_site_is_not_replaced_by_nearest_candidate():
    with pytest.raises(SiteNotFound):
        site_index({"ids": np.array(["real-site"])}, "unknown")


def test_proximity_uses_fixed_physical_bounds_and_selected_feature_centers():
    assert science_utility(0, 0) == 1
    assert science_utility(10, 50) == 0
    assert science_utility(5, None) == 0.5
    assert science_utility(0, 50) == 0.6
    assert science_utility(None, None) is None
    distance = great_circle_km(np.array([0]), np.array([179.9]), 0, -179.9)[0]
    assert distance == pytest.approx(1737.4 * np.deg2rad(0.2))


def test_scenario_request_bounds_and_nonfinite_inputs():
    request = request_for(datetime(2028, 10, 1, tzinfo=UTC), datetime(2028, 10, 2, tzinfo=UTC))
    with pytest.raises(ValidationError):
        ScenarioRequest(request=request, site_id="a", delay_hours=169)
    with pytest.raises(ValidationError):
        ScenarioRequest(request=request, site_id="a", offset_radius_m=float("nan"))
