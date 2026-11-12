from datetime import UTC, datetime, timedelta

import numpy as np
import pytest
import spiceypy as spice
from fastapi.testclient import TestClient

from app.main import app
from app.scene_api import DISPLAY
from app.services.ephemeris import FRAME, LOCK, load_kernels
from app.settings import settings


@pytest.mark.parametrize(
    "start,end",
    [
        ("2028-10-01T00:00:00", "2028-10-08T00:00:00Z"),
        ("2028-10-08T00:00:00Z", "2028-10-01T00:00:00Z"),
        ("2028-10-01T00:00:00Z", "2028-12-01T00:00:00Z"),
        ("2040-10-01T00:00:00Z", "2040-10-08T00:00:00Z"),
    ],
)
def test_scene_rejects_invalid_dates(start, end):
    response = TestClient(app).post(
        "/api/v1/scene/ephemeris", json={"time_range": {"start_utc": start, "end_utc": end}}
    )
    assert response.status_code == 422


def test_scene_is_real_time_dependent_ephemeris_with_consistent_lunar_axes():
    load_kernels(settings.kernel_root)
    start = datetime(2028, 10, 1, tzinfo=UTC)
    end = start + timedelta(days=30)
    response = TestClient(app).post(
        "/api/v1/scene/ephemeris",
        json={"time_range": {"start_utc": start.isoformat(), "end_utc": end.isoformat()}},
    )
    assert response.status_code == 200
    result = response.json()
    samples = result["samples"]
    assert len(samples) == 193
    distances = [np.linalg.norm(row["moon_from_earth_km"]) for row in samples]
    assert min(distances) > 340_000 and max(distances) < 420_000
    assert max(distances) - min(distances) > 10_000
    assert (
        np.linalg.norm(
            np.array(samples[0]["moon_from_earth_km"]) - samples[-1]["moon_from_earth_km"]
        )
        > 10_000
    )
    for row in samples[::48]:
        assert np.linalg.norm(row["moon_orientation"]) == pytest.approx(1)
        assert np.linalg.norm(row["earth_orientation"]) == pytest.approx(1)
        with LOCK:
            et = spice.str2et(row["time_utc"][:19])
            expected, _ = spice.spkpos("EARTH", et, FRAME, "NONE", "MOON")
        x, y, z, w = row["moon_orientation"]
        # An Earth-centered position transformed into the Moon's displayed frame
        # must point toward the same lunar longitude as independent SPICE output.
        local_earth = spice.q2m([w, x, y, z]).T @ -np.array(row["moon_from_earth_km"])
        np.testing.assert_allclose(local_earth, DISPLAY @ expected, atol=1e-6)
    assert result["provenance"]["aberration"] == "NONE"


def test_labels_are_official_feature_centers_not_invented_positions():
    response = TestClient(app).get("/api/v1/scene/landmarks")
    assert response.status_code == 200
    result = response.json()
    assert {"Tycho", "Shackleton", "Tsiolkovskiy"} <= {item["name"] for item in result["features"]}
    assert all(
        item["approved"] and item["source_url"].startswith("https://planetarynames.wr.usgs.gov/")
        for item in result["features"]
    )
