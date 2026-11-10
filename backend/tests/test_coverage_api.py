from pathlib import Path

import numpy as np
from fastapi.testclient import TestClient

import app.coverage_api as coverage
from app.main import app

client = TestClient(app)


def bundle(monkeypatch):
    # Scientific grid has a missing pole; display terrain is deliberately absent.
    x, y = np.meshgrid(np.arange(-2000, 2001, 500), np.arange(-2000, 2001, 500))
    keep = (x != 0) | (y != 0)
    x, y = x[keep], y[keep]
    arrays = {
        "x_m": x,
        "y_m": y,
        "lat_deg": np.rad2deg(2 * np.arctan(np.hypot(x, y) / 3474800) - np.pi / 2),
        "lon_deg": np.rad2deg(np.arctan2(x, y)),
    }
    meta = {
        "coverage": {
            "type": "projected_square",
            "extent_m": [-2000, -2000, 2000, 2000],
            "description": "Verified test patch",
        },
        "candidate_spacing_m": 500,
        "dataset_version": "test",
    }
    monkeypatch.setattr(coverage, "dataset", lambda _: (meta, arrays))
    coverage.catalog_for.cache_clear()
    return arrays


def test_catalog_uses_scientific_grid_and_excludes_missing_pole(monkeypatch):
    arrays = bundle(monkeypatch)
    result = coverage.catalog_for(Path("/nonexistent"), "fixture")
    assert result["verified"] and result["candidate_count"] == len(arrays["x_m"])
    assert result["geometry"]["extent_m"] == [-2000, -2000, 2000, 2000]
    assert result["excluded_locations"] == [
        {"x_m": 0.0, "y_m": 0.0, "radius_m": 0, "reason": "Exact pole excluded"}
    ]
    assert result["layers"]["psr_distance"] is False
    assert result["public_limits"]["maximum_radius_km"] == 5


def test_preview_distinguishes_inside_partial_outside_and_full(monkeypatch):
    bundle(monkeypatch)

    def preview(lat, radius=1):
        return client.post(
            "/api/v1/coverage/preview",
            json={
                "selector_type": "circle",
                "center": {"latitude_deg": lat, "longitude_deg_east": 45},
                "search_radius_km": radius,
            },
        ).json()

    # Around the excluded pole requires acknowledgement; missing is never a zero metric.
    partial = preview(-90)
    assert partial["status"] == "partial" and partial["candidate_count"] > 0
    assert preview(-89.954)["status"] == "inside"
    assert preview(-89.94)["status"] == "partial"
    assert preview(-80)["status"] == "outside"
    full = client.post(
        "/api/v1/coverage/preview", json={"selector_type": "full_supported_region"}
    ).json()
    assert full["status"] == "inside" and full["candidate_count"] == 80


def test_unavailable_science_fails_closed(monkeypatch):
    def missing(_):
        raise ValueError("missing")

    monkeypatch.setattr(coverage, "dataset", missing)
    assert client.get("/api/v1/coverage").status_code == 503
