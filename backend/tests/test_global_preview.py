from datetime import UTC, datetime

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.global_api import GLOBAL_ROOT, destinations, sample_global
from app.main import app
from app.services.ephemeris import RADIUS_M
from app.settings import settings


def test_global_sampling_wraps_longitude_and_has_one_height_at_poles():
    grid = np.arange(32, dtype=float).reshape(4, 8)
    assert sample_global(grid, 0, -180) == sample_global(grid, 0, 180)
    assert sample_global(grid, 90, 10) == sample_global(grid, 90, -110)
    assert sample_global(grid, -90, 10) == sample_global(grid, -90, 130)
    assert sample_global(grid, 67.5, -157.5) == grid[0, 0]


def test_global_destinations_cross_date_line_and_leave_poles_finitely():
    lat, lon = destinations(0, 179.9, np.pi / 2, np.deg2rad(1) * RADIUS_M)
    assert lat == pytest.approx(0, abs=1e-10)
    assert lon == pytest.approx(-179.1)
    lat, lon = destinations(90, 0, np.deg2rad(np.arange(0, 360, 90)), 2000)
    assert np.isfinite(lat).all() and np.isfinite(lon).all()
    assert np.all(lat < 90)


@pytest.mark.parametrize(
    "start,end",
    [
        ("2028-10-01T00:00:00", "2028-10-02T00:00:00Z"),
        ("2028-10-02T00:00:00Z", "2028-10-01T00:00:00Z"),
        ("2028-10-01T00:00:00Z", "2028-12-01T00:00:00Z"),
    ],
)
def test_global_preview_rejects_invalid_windows(start, end):
    response = TestClient(app).post(
        "/api/v1/global/preview",
        json={
            "coordinate": {"latitude_deg": 0, "longitude_deg_east": 0},
            "time_range": {"start_utc": start, "end_utc": end},
        },
    )
    assert response.status_code == 422


def test_global_preview_fails_closed_without_verified_terrain(monkeypatch):
    def unavailable():
        raise ValueError("Corrupt global artifact")

    monkeypatch.setattr("app.global_api.global_grid", unavailable)
    response = TestClient(app).post(
        "/api/v1/global/preview",
        json={
            "coordinate": {"latitude_deg": 0, "longitude_deg_east": 0},
            "time_range": {"start_utc": "2028-10-01T00:00:00Z", "end_utc": "2028-10-02T00:00:00Z"},
        },
    )
    assert response.status_code == 503


def test_real_global_near_and_far_side_preview():
    if (
        not (GLOBAL_ROOT / "metadata.json").exists()
        or not (settings.kernel_root / "manifest.json").exists()
    ):
        pytest.skip("Prepare the optional global elevation bundle")
    client = TestClient(app)
    results = []
    for latitude, longitude in ((0, 0), (0, 179.9), (90, 45), (-90, 0)):
        response = client.post(
            "/api/v1/global/preview",
            json={
                "coordinate": {"latitude_deg": latitude, "longitude_deg_east": longitude},
                "time_range": {
                    "start_utc": datetime(2028, 10, 1, tzinfo=UTC).isoformat(),
                    "end_utc": datetime(2028, 10, 2, tzinfo=UTC).isoformat(),
                },
            },
        )
        assert response.status_code == 200
        result = response.json()
        assert len(result["timeline"]) == 289
        assert len(result["horizon"]) == 72
        assert result["provenance"]["pixels_per_degree"] == 16
        assert "score" not in result
        results.append(result)
    assert results[0]["metrics"]["earth_visibility_fraction"] == 1
    assert results[1]["metrics"]["earth_visibility_fraction"] == 0
