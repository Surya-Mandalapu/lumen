"""Time a representative full-patch search with the prepared local science bundle."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from time import perf_counter

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.models import RegionSelection, SearchRequest, SelectorType, TimeRange
from app.services.search import search


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repeat", type=int, default=2)
    args = parser.parse_args()
    if args.repeat < 1:
        parser.error("--repeat must be positive")
    request = SearchRequest(
        region=RegionSelection(selector_type=SelectorType.full_supported_region),
        time_range=TimeRange(
            start_utc=datetime(2028, 10, 1, tzinfo=UTC),
            end_utc=datetime(2028, 10, 31, tzinfo=UTC),
        ),
    )
    for run in range(1, args.repeat + 1):
        timings: dict[str, float] = {}
        started = perf_counter()
        result = search(request, timings=timings)
        print(
            json.dumps(
                {
                    "run": run,
                    "total_s": round(perf_counter() - started, 3),
                    "stages_s": {
                        key: round(value, 3) for key, value in timings.items()
                    },
                    "counts": result["counts"],
                    "search_id": result["search_id"],
                },
                sort_keys=True,
            )
        )


if __name__ == "__main__":
    main()
