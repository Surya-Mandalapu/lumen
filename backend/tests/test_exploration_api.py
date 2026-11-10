from fastapi.testclient import TestClient

from app.main import app
from app.services.dataset import DataUnavailable


def test_source_attributed_exploration_layers_are_served():
    client = TestClient(app)
    response = client.get("/api/v1/features")
    assert response.status_code == 200
    catalog = response.json()
    assert len(catalog["features"]) == 30
    assert all(feature["approved"] for feature in catalog["features"])
    assert any(feature["name"] == "Shackleton" for feature in catalog["features"])
    assert catalog["source"]["sha256"]
    response = client.get("/api/v1/layers/psr")
    assert response.status_code == 200
    mask = response.json()
    assert len(mask["psr_fraction"]) == mask["width"] * mask["height"]
    assert all(0 <= value <= 1 for value in mask["psr_fraction"])
    assert mask["source_resolution_m"] == 20


def test_layers_are_not_served_from_an_unverified_bundle(monkeypatch):
    def unavailable(_):
        raise DataUnavailable("Corrupted test bundle")

    monkeypatch.setattr("app.exploration_api.dataset", unavailable)
    client = TestClient(app)
    for path in ("/api/v1/features", "/api/v1/layers/psr"):
        response = client.get(path)
        assert response.status_code == 503
        assert response.json()["detail"]["code"] == "layer_not_prepared"
