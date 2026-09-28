from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health() -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_region_manifest_exposes_supported_boundary() -> None:
    response = client.get("/api/v1/region")
    assert response.status_code == 200
    assert response.json()["supported_region"]["maximum_latitude_deg"] == -87


def test_candidate_search_fails_closed_without_prepared_data() -> None:
    response = client.post(
        "/api/v1/candidates/search",
        json={
            "region": {
                "selector_type": "feature_radius",
                "input_text": "near Shackleton crater",
                "resolved_feature_id": "fixture-shackleton",
                "center": {"latitude_deg": -89.9, "longitude_deg_east": 0},
                "search_radius_km": 20
            },
            "time_range": {
                "start_utc": "2028-10-01T00:00:00Z",
                "end_utc": "2028-10-31T00:00:00Z"
            },
            "hard_constraints": {},
            "preferences": {
                "illumination": 0.35,
                "earth_visibility": 0.35,
                "terrain_safety": 0.2,
                "science_proximity": 0.1
            }
        },
    )
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "scientific_data_not_prepared"

