"""Verify prepared 87°S–90°S tiles; report incomplete coverage explicitly."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from prepare_terrain import CAP_TILE_COUNT, candidate_grid, cap_tile_bounds

ROOT = Path(__file__).resolve().parents[2]


def verify_tiles(root: Path) -> dict:
    expected = [
        (x, y)
        for x in range(CAP_TILE_COUNT)
        for y in range(CAP_TILE_COUNT)
        if len(candidate_grid((x, y))[0])
    ]
    present, missing = [], []
    all_ids: set[str] = set()
    candidate_count = 0
    for x, y in expected:
        directory = root / f"tile-{x}-{y}"
        metadata_path = directory / "metadata.json"
        if not metadata_path.exists():
            missing.append([x, y])
            continue
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        coverage = metadata["coverage"]
        if (
            metadata["dataset_version"] != "lunar-south-cap-v1"
            or coverage["tile_index"] != [x, y]
            or coverage["extent_m"] != list(cap_tile_bounds(x, y))
        ):
            raise ValueError(f"Invalid coverage declaration in {directory}")
        for name, artifact in metadata["artifacts"].items():
            path = directory / name
            if (
                path.stat().st_size != artifact["bytes"]
                or hashlib.sha256(path.read_bytes()).hexdigest() != artifact["sha256"]
            ):
                raise ValueError(f"Artifact integrity failed: {path}")
        with np.load(directory / "terrain.npz", allow_pickle=False) as arrays:
            ids = set(arrays["ids"].tolist())
            if len(ids) != len(arrays["ids"]) or ids & all_ids:
                raise ValueError(f"Duplicate candidate IDs in {directory}")
            if len(ids) != metadata["candidate_count"] or not np.all(
                arrays["lat_deg"] <= -87
            ):
                raise ValueError(
                    f"Candidate count or cap latitude failed in {directory}"
                )
            expected_x, expected_y, _ = candidate_grid((x, y))
            expected_points = set(
                zip(expected_x.tolist(), expected_y.tolist(), strict=True)
            )
            actual_points = set(
                zip(arrays["x_m"].tolist(), arrays["y_m"].tolist(), strict=True)
            )
            if actual_points != expected_points:
                raise ValueError(f"Candidate grid is incomplete in {directory}")
            all_ids.update(ids)
            candidate_count += len(ids)
        present.append([x, y])
    return {
        "expected_tiles": len(expected),
        "verified_tiles": len(present),
        "verified_candidates": candidate_count,
        "missing_tiles": missing,
        "complete": not missing,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root", type=Path, default=ROOT / "data/derived/lunar-south-cap-v1"
    )
    parser.add_argument("--require-complete", action="store_true")
    args = parser.parse_args()
    report = verify_tiles(args.root)
    print(json.dumps(report, indent=2))
    if args.require_complete and not report["complete"]:
        raise SystemExit(
            "Cap coverage is incomplete; do not expose it as a supported region."
        )


if __name__ == "__main__":
    main()
