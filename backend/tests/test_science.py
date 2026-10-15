from datetime import UTC, datetime, timedelta

import numpy as np
import pytest
from test_validation import request_for

from app.models import HardConstraints
from app.services.ephemeris import (
    horizon_at,
    local_sky,
    solar_disk_fraction,
    time_grid,
    visibility_metrics,
)
from app.services.search import category_scores, region_mask, temporal_pass, terrain_mask


def test_sky_uses_east_north_radial_frame_and_observer_parallax():
    # At lat0 lon0: radial+x east+y north+z. Target placed at observer + local vector.
    body = np.array([[1737.402, 10, 0], [1737.402, 0, 10], [1747.402, 0, 0]])
    az, elevation, distance = local_sky(0, 0, 0, body)
    assert az[:2] == pytest.approx([90, 0])
    assert elevation == pytest.approx([0, 0, 90])
    assert distance == pytest.approx([10, 10, 10])


def test_horizon_conservatively_wraps_across_north():
    profile = np.array([8, 2, 3, 4])
    assert horizon_at(profile, np.array([359.9, 0, 89.9, 180])) == pytest.approx([8, 8, 8, 4])


def test_finite_solar_disk_visible_fraction():
    assert solar_disk_fraction(np.array([-2, -1, 0, 1, 2]), np.ones(5)) == pytest.approx(
        [0, 0, 0.5, 1, 1]
    )


def test_visibility_clips_last_interval_and_does_not_wrap_mission_edges():
    # Endpoint state has no duration; intervals at mission edges are distinct.
    fraction, longest_on, longest_off = visibility_metrics(
        np.array([True, False, True, False]), np.array([1, 1, 0.25])
    )
    assert fraction == pytest.approx(1.25 / 2.25)
    assert longest_on == 1
    assert longest_off == 1


def test_time_grid_includes_exact_nonaligned_end():
    start = datetime(2028, 10, 1, tzinfo=UTC)
    end = start + timedelta(minutes=12, seconds=1)
    grid = time_grid(start, end, 5)
    assert grid == [start, start + timedelta(minutes=5), start + timedelta(minutes=10), end]
    assert time_grid(start, start + timedelta(microseconds=1), 5) == [
        start,
        start + timedelta(microseconds=1),
    ]


def test_hard_filters_are_independent_from_ranking():
    request = request_for(datetime(2028, 10, 1, tzinfo=UTC), datetime(2028, 10, 2, tzinfo=UTC))
    request.hard_constraints = HardConstraints(
        maximum_slope_deg=10, minimum_illumination_fraction=0.5
    )
    arrays = {
        "lat_deg": np.array([-89.9, -89.8]),
        "slope_deg": np.array([5, 11]),
        "roughness_m": np.zeros(2),
        "elevation_m": np.zeros(2),
    }
    assert terrain_mask(request, arrays).tolist() == [True, False]
    assert not temporal_pass(request, {"illumination_fraction": 0.49})
    assert temporal_pass(request, {"illumination_fraction": 0.5})


def test_fixed_category_anchors_and_unavailable_science():
    score = category_scores(
        {
            "illumination_fraction": 0.8,
            "earth_visibility_fraction": 0.6,
            "longest_sunlight_hours": 8,
            "longest_darkness_hours": 2,
            "longest_communication_hours": 6,
            "longest_blackout_hours": 4,
        },
        15,
        1,
        0,
        10,
        {"slope_deg": [0, 30], "roughness_m": [0, 2], "elevation_m": [-100, 100]},
    )
    assert score["illumination"] == pytest.approx(0.8)
    assert score["earth_visibility"] == pytest.approx(0.6)
    assert score["terrain_safety"] == pytest.approx(0.5)
    assert score["science_proximity"] is None


def test_region_radius_handles_antimeridian():
    request = request_for(datetime(2028, 10, 1, tzinfo=UTC), datetime(2028, 10, 2, tzinfo=UTC))
    request.region.center.longitude_deg_east = 179.9
    request.region.search_radius_km = 1
    assert region_mask(
        request, {"lat_deg": np.array([-89.9, -87]), "lon_deg": np.array([-179.9, 0])}
    ).tolist() == [True, False]
