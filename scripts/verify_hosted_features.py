"""Check the data-backed features of a built or deployed Lumen service."""

import argparse
import hashlib
import json
from time import perf_counter
from urllib.request import Request, urlopen


def verify(base: str):
    def call(path, payload=None):
        request = Request(
            base.rstrip("/") + path,
            data=json.dumps(payload).encode() if payload is not None else None,
            headers={"Content-Type": "application/json"},
        )
        with urlopen(request, timeout=125) as response:
            return json.load(response)

    assert call("/api/v1/health")["status"] == "ok"
    coverage = call("/api/v1/coverage")
    assert coverage["verified"] and coverage["candidate_count"] == 103996, coverage
    assert coverage["dataset_version"] == "lunar-south-cap-v1", coverage
    assert call("/api/v1/global/terrain")["provenance"]["pixels_per_degree"] == 16
    window = {"start_utc": "2028-10-01T00:00:00Z", "end_utc": "2028-10-02T00:00:00Z"}
    scene = call("/api/v1/scene/ephemeris", {"time_range": window})
    assert len(scene["samples"]) >= 25
    started = perf_counter()
    ranking = call(
        "/api/v1/global/rank-area",
        {
            "coordinate": {"latitude_deg": -43.3, "longitude_deg_east": -11.2},
            "radius_km": 5,
            "sunlight_weight": 0.5,
            "time_range": window,
        },
    )
    seconds = perf_counter() - started
    assert len(ranking["sites"]) == 21, ranking
    result = call(
        "/api/v1/candidates/search",
        {
            "region": {
                "selector_type": "circle",
                "center": {"latitude_deg": -89.9, "longitude_deg_east": 0},
                "search_radius_km": 3,
            },
            "time_range": window,
        },
    )
    assert result["counts"]["region"] > 0 and result["candidates"], result
    assert result["map_candidates"] and all(
        "latitude_deg" in point for point in result["map_candidates"]
    )
    expected_assets = {
        "moon-height.i16": "ccc3b215bcd0fac3d8003e6aeb70cfc962512579f6411db5ad4d72405f973f45",
        "earth-visual.glb": "472de6535d973a0b1b178f7b06eb1edfca3aa15936bb130d6fff9cf05e3c0c01",
        "sun-visual.glb": "1c369fea924a6833ed7c7e74b8544954e17b115c8c4fcf925bb481fc8152f9fd",
    }
    for name, expected in expected_assets.items():
        with urlopen(base.rstrip("/") + "/assets/" + name, timeout=30) as response:
            assert hashlib.sha256(response.read()).hexdigest() == expected, name
    return {
        "url": base,
        "prepared_locations": coverage["candidate_count"],
        "coarse_candidates": len(ranking["sites"]),
        "completed_area_ranking_seconds": round(seconds, 3),
        "scene": "ok",
        "prepared_search": "ok",
        "model_assets": "verified",
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://127.0.0.1:8000")
    print(json.dumps(verify(parser.parse_args().url), indent=2))
