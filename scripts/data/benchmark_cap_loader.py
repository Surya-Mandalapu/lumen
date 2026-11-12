"""Measure selective runtime data loading in a fresh process, without raw DEMs."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from time import perf_counter

import psutil

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
from app.services.terrain_store import TerrainStore


def benchmark(root: Path) -> dict:
    process = psutil.Process()
    initial = process.memory_info().rss
    store = TerrainStore(root, max_cache_bytes=2 * 1024 * 1024)
    cases = []
    for latitude, longitude, radius in [
        (-89.99, 0, 3),
        (-89.8, 180, 5),
        (-87.01, 40, 5),
    ]:
        started = perf_counter()
        arrays = store.load_area(latitude, longitude, radius)
        cases.append(
            {
                "latitude_deg": latitude,
                "longitude_deg_east": longitude,
                "radius_km": radius,
                "candidate_count": len(arrays["ids"]),
                "elapsed_seconds": perf_counter() - started,
                "trace": store.trace(),
            }
        )
        del arrays
    memory = process.memory_info()
    report = {
        "catalog_sha256": store.catalog()["catalog_sha256"],
        "initial_rss_bytes": initial,
        "final_rss_bytes": memory.rss,
        "peak_process_bytes": getattr(memory, "peak_wset", memory.rss),
        "scope": "Data loader only; excludes ephemeris, analysis and response serialization",
        "cases": cases,
        "final_trace": store.trace(),
    }
    (root / "loader-benchmark.json").write_text(
        json.dumps(report, indent=2), encoding="utf-8"
    )
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root", type=Path, default=ROOT / "data/derived/lunar-south-cap-v1"
    )
    args = parser.parse_args()
    print(json.dumps(benchmark(args.root), indent=2))
