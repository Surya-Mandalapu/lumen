from datetime import UTC, datetime

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.global_api import (
    GLOBAL_ROOT,
    GlobalAreaRequest,
    GlobalPointRequest,
    area_ranking_calculation,
    preview_calculation,
)
from app.main import app
from app.settings import settings


def payload(radius=5, lat=-43.3, lon=-11.2, weight=0.5):
    return {
        "coordinate": {"latitude_deg": lat, "longitude_deg_east": lon},
        "radius_km": radius,
        "sunlight_weight": weight,
        "time_range": {"start_utc": "2028-10-01T00:00:00Z", "end_utc": "2028-10-02T00:00:00Z"},
    }


@pytest.mark.parametrize(
    "change",
    [
        {"radius_km": 0.5},
        {"radius_km": 6},
        {"sunlight_weight": 2},
        {"coordinate": {"latitude_deg": 20, "longitude_deg_east": 0}},
        {"time_range": {"start_utc": "2028-10-01T00:00:00Z", "end_utc": "2028-10-09T00:00:00Z"}},
    ],
)
def test_invalid_local_area(change):
    assert (
        TestClient(app).post("/api/v1/global/rank-area", json={**payload(), **change}).status_code
        == 422
    )


def test_area_fails_closed_without_global_data(monkeypatch, tmp_path):
    monkeypatch.setenv("LUMEN_GLOBAL_ROOT", str(tmp_path))
    assert TestClient(app).post("/api/v1/global/rank-area", json=payload()).status_code == 503


@pytest.mark.parametrize(
    "radius,lat,lon,count", [(1, -43.3, -11.2, 1), (3, -30, 179.99, 9), (5, -90, 0, 21)]
)
def test_real_local_lattice_and_scores(radius, lat, lon, count):
    if (
        not (GLOBAL_ROOT / "metadata.json").exists()
        or not (settings.kernel_root / "manifest.json").exists()
    ):
        pytest.skip("Optional verified global data is not installed")
    request = GlobalAreaRequest.model_validate(payload(radius, lat, lon))
    result = area_ranking_calculation(request)
    assert result["candidate_count"] == count
    assert len({site["id"] for site in result["sites"]}) == count
    assert [site["score"] for site in result["sites"]] == sorted(
        [site["score"] for site in result["sites"]], reverse=True
    )
    for rank, site in enumerate(result["sites"], 1):
        a, b = np.deg2rad([lat, site["latitude_deg"]])
        h = (
            np.sin((a - b) / 2) ** 2
            + np.cos(a) * np.cos(b) * np.sin(np.deg2rad(lon - site["longitude_deg_east"]) / 2) ** 2
        )
        assert 2 * 1737.4 * np.arcsin(np.sqrt(np.clip(h, 0, 1))) <= radius + 1e-8
        assert site["rank"] == rank
        assert site["latitude_deg"] <= 0
        assert site["score"] == pytest.approx(
            50
            * (
                site["metrics"]["illumination_fraction"]
                + site["metrics"]["earth_visibility_fraction"]
            )
        )
        assert "slope_deg" not in site
    if radius == 1:
        point = preview_calculation(
            GlobalPointRequest(coordinate=request.coordinate, time_range=request.time_range)
        )
        assert result["sites"][0]["metrics"] == pytest.approx(point["metrics"], abs=1e-12)
    assert result["provenance"]["candidate_spacing_m"] == 2000


def test_local_rank_uses_requested_weight(monkeypatch):
    import app.global_api as module

    monkeypatch.setattr(module, "global_grid", lambda: ({}, np.zeros((4, 8))))
    monkeypatch.setattr(
        module, "body_positions", lambda *_: ([datetime(2028, 10, 1, tzinfo=UTC)], None, None)
    )
    monkeypatch.setattr(module, "load_kernels", lambda *_: ())
    monkeypatch.setattr(
        module,
        "analyze_batch",
        lambda arrays, *_: [
            {
                "illumination_fraction": i / len(arrays["lat_deg"]),
                "earth_visibility_fraction": 1 - i / len(arrays["lat_deg"]),
            }
            for i in range(len(arrays["lat_deg"]))
        ],
    )
    sun = area_ranking_calculation(GlobalAreaRequest.model_validate(payload(3, weight=1)))
    earth = area_ranking_calculation(GlobalAreaRequest.model_validate(payload(3, weight=0)))
    assert sun["sites"][0]["id"] != earth["sites"][0]["id"]
