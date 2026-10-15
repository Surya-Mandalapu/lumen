"""Integration regression using the bundled NASA patch and optional pinned NAIF kernels."""

from datetime import datetime
from itertools import pairwise

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.settings import settings

pytestmark = pytest.mark.skipif(
    not (settings.kernel_root / "manifest.json").exists(),
    reason="Run npm run prepare:data to install the pinned scientific kernels.",
)


def test_real_data_search_is_reproducible_and_timeline_agrees_with_metrics():
    client = TestClient(app)
    payload = {
        "region": {"selector_type": "full_supported_region"},
        "time_range": {
            "start_utc": "2028-10-01T00:00:00Z",
            "end_utc": "2028-10-31T00:00:00Z",
        },
        "hard_constraints": {"maximum_slope_deg": 5},
        "preferences": {"illumination": 40, "earth_visibility": 40, "terrain_safety": 20},
    }
    response = client.post("/api/v1/candidates/search", json=payload)
    assert response.status_code == 200
    result = response.json()
    assert result == client.post("/api/v1/candidates/search", json=payload).json()
    assert len(result["candidates"]) == 5
    assert result["counts"]["region"] == 1680
    assert result["provenance"]["aberration_correction"] == {"sun": "CN+S", "earth": "XCN+S"}
    for site in result["candidates"]:
        assert site["slope_deg"] <= 5
        timeline = site["timeline"]
        durations = [
            (
                datetime.fromisoformat(b["time_utc"]) - datetime.fromisoformat(a["time_utc"])
            ).total_seconds()
            for a, b in pairwise(timeline)
        ]
        for state, metric in (
            ("sun_visible", "illumination_fraction"),
            ("earth_visible", "earth_visibility_fraction"),
        ):
            visible = sum(t[state] * d for t, d in zip(timeline, durations, strict=False))
            assert site["metrics"][metric] == pytest.approx(visible / sum(durations))
        assert len(site["horizon"]) == 72
        assert all(point["distance_m"] > 0 for point in site["horizon"])
    impossible = dict(payload, hard_constraints={"maximum_slope_deg": 0})
    empty = client.post("/api/v1/candidates/search", json=impossible).json()
    assert empty["status"] == "empty"
    assert empty["candidates"] == []
