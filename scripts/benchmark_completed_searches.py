"""Measure successful end-to-end API latency by operation; failures never count as fast results."""

import argparse
import json
import statistics
from pathlib import Path
from time import perf_counter
from urllib.request import Request, urlopen


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://127.0.0.1:8000")
    parser.add_argument("--repeat", type=int, default=3)
    parser.add_argument(
        "--operation",
        action="append",
        help="Run only the named operation; repeat for several.",
    )
    parser.add_argument(
        "--output", type=Path, default=Path("data/cache/orbital-qa/search-latency.json")
    )
    args = parser.parse_args()
    window = {"start_utc": "2028-10-01T00:00:00Z", "end_utc": "2028-10-08T00:00:00Z"}
    circle = {
        "selector_type": "circle",
        "center": {"latitude_deg": -89.9, "longitude_deg_east": 0},
        "search_radius_km": 5,
    }
    month = {**window, "end_utc": "2028-10-31T00:00:00Z"}
    cases = [
        ("landmark_lookup", "/api/v1/global/features?q=a", None),
        ("area_coverage", "/api/v1/coverage/preview", circle),
        (
            "local_5km_7day_search",
            "/api/v1/candidates/search",
            {"region": circle, "time_range": window},
        ),
        (
            "full_cap_october_search",
            "/api/v1/candidates/search",
            {"region": {"selector_type": "full_supported_region"}, "time_range": month},
        ),
        (
            "near_side_31day_preview",
            "/api/v1/global/preview",
            {
                "coordinate": {"latitude_deg": -35, "longitude_deg_east": 0},
                "time_range": {**month, "end_utc": "2028-11-01T00:00:00Z"},
            },
        ),
        (
            "far_side_7day_preview",
            "/api/v1/global/preview",
            {
                "coordinate": {"latitude_deg": -35, "longitude_deg_east": -180},
                "time_range": window,
            },
        ),
        ("orbital_ephemeris_30days", "/api/v1/scene/ephemeris", {"time_range": month}),
        (
            "near_side_5km_7day_coarse_ranking",
            "/api/v1/global/rank-area",
            {
                "coordinate": {"latitude_deg": -35, "longitude_deg_east": 0},
                "radius_km": 5,
                "sunlight_weight": 0.5,
                "time_range": window,
            },
        ),
        (
            "far_side_5km_7day_coarse_ranking",
            "/api/v1/global/rank-area",
            {
                "coordinate": {"latitude_deg": -35, "longitude_deg_east": -180},
                "radius_km": 5,
                "sunlight_weight": 0.5,
                "time_range": window,
            },
        ),
    ]
    if args.operation:
        unknown = set(args.operation) - {name for name, _, _ in cases}
        if unknown:
            parser.error(f"Unknown operations: {sorted(unknown)}")
        cases = [case for case in cases if case[0] in args.operation]
    report = {"target_mean_seconds": 30, "repeat": args.repeat, "operations": {}}
    for name, path, payload in cases:
        samples = []
        for _ in range(args.repeat):
            request = Request(
                args.url + path,
                data=json.dumps(payload).encode() if payload is not None else None,
                headers={"Content-Type": "application/json"},
            )
            start = perf_counter()
            with urlopen(request, timeout=125) as response:
                result = json.load(response)
                if "search" in name:
                    assert result["counts"]["region"] > 0 and result["candidates"], (
                        result
                    )
                elif "preview" in name:
                    assert result["timeline"] and "metrics" in result, result
                elif "coarse_ranking" in name:
                    assert (
                        result["candidate_count"] == 21 and len(result["sites"]) == 21
                    ), result
            samples.append(round(perf_counter() - start, 4))
        row = {
            "seconds": samples,
            "mean_seconds": round(statistics.mean(samples), 4),
            "max_seconds": max(samples),
            "completed": len(samples),
        }
        report["operations"][name] = row
        print(json.dumps({"operation": name, **row}), flush=True)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2))
    assert all(item["mean_seconds"] < 30 for item in report["operations"].values()), (
        report
    )


if __name__ == "__main__":
    main()
