"""Prepare an exact, versioned five-minute temporal cache for a mission window."""

from __future__ import annotations

import argparse
import sys
from datetime import UTC, datetime
from pathlib import Path
from time import perf_counter

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))

from app.services.search import precompute_temporal_cache


def utc(value: str) -> datetime:
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        raise argparse.ArgumentTypeError("Dates need an explicit UTC offset")
    return parsed.astimezone(UTC)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start", type=utc, default=utc("2028-10-01T00:00:00Z"))
    parser.add_argument("--end", type=utc, default=utc("2028-10-31T00:00:00Z"))
    args = parser.parse_args()
    if args.start >= args.end:
        parser.error("End must be later than start")
    started = perf_counter()
    path = precompute_temporal_cache(args.start, args.end)
    print(f"Exact temporal cache: {path} ({perf_counter() - started:.2f} s)")


if __name__ == "__main__":
    main()
