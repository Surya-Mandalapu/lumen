from fastapi.testclient import TestClient

from app.main import app


def test_hemisphere_landmarks_cover_near_far_and_polar_regions():
    client = TestClient(app)
    for query in ("Tycho", "Tsiolkovskiy", "Shackleton"):
        response = client.get("/api/v1/global/features", params={"q": query})
        assert response.status_code == 200
        result = response.json()
        assert result["features"][0]["name"] == query
        assert result["source"]["sha256"]
        assert all(-90 <= item["latitude_deg"] <= 0 and item["approved"] for item in result["features"])


def test_landmark_search_is_bounded_and_rejects_oversized_queries():
    client = TestClient(app)
    result = client.get("/api/v1/global/features", params={"q": "a"}).json()
    assert 0 < len(result["features"]) <= 20 < result["total"]
    assert client.get("/api/v1/global/features", params={"q": "x" * 101}).status_code == 422
    assert client.get("/api/v1/global/features", params={"q": " "}).json()["features"] == []
