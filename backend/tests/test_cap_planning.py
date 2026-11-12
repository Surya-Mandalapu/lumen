"""Planning integration against the explicit synthetic 88-tile scientific fixture."""

import json
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient
from test_terrain_store import cap  # noqa: F401 -- shared scientific fixture

from app.main import app as application
from app.services import repository
from app.services.terrain_store import digest
from app.settings import settings


@pytest.fixture
def cap_service(cap, monkeypatch):  # noqa: F811 -- pytest fixture injection
    root, arrays = cap
    catalog = repository.store(root).catalog()
    (root / "terrain.json").write_text('{"test_only": true}')
    meta = json.loads((root / "tile-5-5/metadata.json").read_text())
    meta.update(
        candidate_count=len(arrays["ids"]),
        catalog_sha256=catalog["catalog_sha256"],
        scoring_reference=catalog["scoring_reference"],
        coverage={
            "type": "polar_cap",
            "extent_m": [-100000, -100000, 100000, 100000],
            "latitude_min_deg": -90,
            "latitude_max_deg": -87,
            "description": "Synthetic test cap only",
        },
        artifacts={
            name: {"sha256": digest(root / name), "bytes": (root / name).stat().st_size}
            for name in ("features.json", "terrain.json")
        },
    )
    (root / "metadata.json").write_text(json.dumps(meta))
    import app.api
    import app.coverage_api
    import app.exploration_api
    import app.services.bounded_analysis
    import app.services.search
    import app.services.sites
    import app.services.validation

    for module in (
        app.api,
        app.coverage_api,
        app.exploration_api,
        app.services.search,
        app.services.sites,
        app.services.validation,
        app.services.bounded_analysis,
    ):
        monkeypatch.setattr(module, "settings", replace(settings, data_root=root))

    def monolithic_forbidden(_):
        raise AssertionError("Planning requests must not load the combined cap NPZ")

    monkeypatch.setattr(repository, "dataset", monolithic_forbidden)
    repository.store(root).clear()
    app.coverage_api.catalog_for.cache_clear()
    return TestClient(application), root


def test_cap_coverage_and_assets_do_not_open_candidate_tiles(cap_service):
    client, root = cap_service
    result = client.get("/api/v1/coverage")
    assert result.status_code == 200
    assert result.json()["candidate_count"] == 103995
    assert result.json()["geometry"]["type"] == "cap"
    assert repository.store(root).trace()["loaded_tile_ids"] == []
    assert client.get("/api/v1/terrain").json() == {"test_only": True}
    assert client.get("/api/v1/features").status_code == 200
    assert client.get("/api/v1/layers/psr").status_code == 503


def test_cap_location_search_inspection_and_limits(cap_service):
    client, root = cap_service
    region = {
        "selector_type": "circle",
        "center": {"latitude_deg": -88.2, "longitude_deg_east": 90},
        "search_radius_km": 3,
    }
    coverage = client.post("/api/v1/coverage/preview", json=region).json()
    assert coverage["status"] == "inside" and coverage["candidate_count"] > 0
    assert len(repository.store(root).trace()["loaded_tile_ids"]) < 5
    request = {
        "region": region,
        "time_range": {"start_utc": "2028-10-01T00:00:00Z", "end_utc": "2028-10-02T00:00:00Z"},
    }
    response = client.post("/api/v1/candidates/search", json=request)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["counts"]["region"] == coverage["candidate_count"]
    assert result["counts"]["total"] == 103995
    assert result["candidates"]
    site = result["candidates"][0]
    detail = client.post(f"/api/v1/sites/{site['id']}/analysis", json=request)
    assert detail.status_code == 200, detail.text
    assert detail.json()["metrics"] == site["metrics"]
    assert detail.json()["score"] == site["score"]
    request["region"] = {"selector_type": "full_supported_region"}
    assert client.post("/api/v1/candidates/search", json=request).status_code == 422


def test_named_location_uses_verified_center_instead_of_stale_coordinates(cap_service):
    client, _ = cap_service
    response = client.post(
        "/api/v1/coverage/preview",
        json={
            "selector_type": "feature_radius",
            "resolved_feature_id": "test-cap-landmark",
            "center": {"latitude_deg": -80, "longitude_deg_east": -120},
            "search_radius_km": 3,
        },
    )
    assert response.status_code == 200
    assert response.json()["status"] == "inside"
    assert response.json()["region"]["center"] == {"latitude_deg": -88.2, "longitude_deg_east": 90}
