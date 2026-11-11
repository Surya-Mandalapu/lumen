"""Verify prepared 87°S–90°S tiles; report incomplete coverage explicitly."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from prepare_terrain import (
    CAP_TILE_COUNT,
    SOURCE_SHA256,
    candidate_grid,
    cap_tile_bounds,
    projected_to_geographic,
)

ROOT = Path(__file__).resolve().parents[2]


def verify_tiles(root: Path, *, azimuth_step_deg: int | None = None) -> dict:
    expected = [
        (x, y)
        for x in range(CAP_TILE_COUNT)
        for y in range(CAP_TILE_COUNT)
        if len(candidate_grid((x, y))[0])
    ]
    present, missing = [], []
    all_ids: set[str] = set()
    candidate_count = 0
    excluded_count = 0
    settings = None
    for x, y in expected:
        directory = root / f"tile-{x}-{y}"
        metadata_path = directory / "metadata.json"
        if not metadata_path.exists():
            missing.append([x, y])
            continue
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        if metadata.get("validity_schema_version") != 1:
            raise ValueError(
                f"Explicit source validity accounting required in {directory}"
            )
        recipe_keys = (
            "candidate_spacing_m",
            "terrain_resolution_m",
            "observer_height_m",
            "horizon_azimuth_step_deg",
            "horizon_max_range_m",
            "horizon_near_step_m",
            "horizon_far_step_m",
            "horizon_near_range_m",
            "coordinate_frame",
            "reference_radius_m",
        )
        recipe = {key: metadata[key] for key in recipe_keys}
        if settings is not None and settings != recipe:
            raise ValueError(f"Mixed preparation settings in {directory}")
        settings = recipe
        if (
            recipe["candidate_spacing_m"] != 500
            or recipe["terrain_resolution_m"] != 80
            or recipe["observer_height_m"] != 2
            or recipe["horizon_max_range_m"] != 200000
            or recipe["horizon_near_step_m"] != 80
            or recipe["horizon_far_step_m"] != 320
            or recipe["horizon_near_range_m"] != 20000
            or recipe["coordinate_frame"] != "MOON_ME_DE440_ME421"
            or recipe["reference_radius_m"] != 1737400
            or recipe["horizon_azimuth_step_deg"] not in (1, 2, 5)
            or (
                azimuth_step_deg is not None
                and recipe["horizon_azimuth_step_deg"] != azimuth_step_deg
            )
        ):
            raise ValueError(f"Unsupported preparation settings in {directory}")
        if {
            item["id"]: item["sha256"] for item in metadata["sources"]
        } != SOURCE_SHA256:
            raise ValueError(f"Source provenance mismatch in {directory}")
        coverage = metadata["coverage"]
        if (
            metadata["dataset_version"] != "lunar-south-cap-v1"
            or coverage["tile_index"] != [x, y]
            or coverage["extent_m"] != list(cap_tile_bounds(x, y))
        ):
            raise ValueError(f"Invalid coverage declaration in {directory}")
        if (
            not {"terrain.npz", "terrain.json", "exclusions.json"}
            <= metadata["artifacts"].keys()
        ):
            raise ValueError(f"Missing required artifacts in {directory}")
        for name, artifact in metadata["artifacts"].items():
            path = directory / name
            if not path.resolve().is_relative_to(directory.resolve()):
                raise ValueError(f"Unsafe artifact path in {directory}")
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
            expected_ids = {
                f"lola-{int(a):+06d}-{int(b):+06d}" for a, b in actual_points
            }
            if ids != expected_ids or len(actual_points) != len(ids):
                raise ValueError(f"Unstable IDs or duplicate locations in {directory}")
            row_ids = np.array(
                [
                    f"lola-{int(a):+06d}-{int(b):+06d}"
                    for a, b in zip(arrays["x_m"], arrays["y_m"], strict=True)
                ]
            )
            if not np.array_equal(row_ids, arrays["ids"]):
                raise ValueError(
                    f"Site IDs do not match row coordinates in {directory}"
                )
            lat, lon = projected_to_geographic(arrays["x_m"], arrays["y_m"])
            if not np.allclose(
                arrays["lat_deg"], np.rad2deg(lat), atol=1e-10, rtol=0
            ) or not np.allclose(
                arrays["lon_deg"],
                (np.rad2deg(lon) + 180) % 360 - 180,
                atol=1e-10,
                rtol=0,
            ):
                raise ValueError(
                    f"Geographic/projected coordinates disagree in {directory}"
                )
            exclusions = json.loads((directory / "exclusions.json").read_text())
            excluded_points = {(item["x_m"], item["y_m"]) for item in exclusions}
            if (
                len(excluded_points) != len(exclusions)
                or len(exclusions) != metadata["excluded_count"]
                or actual_points & excluded_points
                or any(
                    item["reason"]
                    not in {"missing_candidate_source", "missing_horizon_source"}
                    or item["id"]
                    != f"lola-{int(item['x_m']):+06d}-{int(item['y_m']):+06d}"
                    for item in exclusions
                )
            ):
                raise ValueError(f"Invalid source exclusions in {directory}")
            if actual_points | excluded_points != expected_points:
                raise ValueError(f"Candidate grid is incomplete in {directory}")
            n = len(ids)
            for key in (
                "x_m",
                "y_m",
                "lat_deg",
                "lon_deg",
                "elevation_m",
                "slope_deg",
                "roughness_m",
            ):
                if arrays[key].shape != (n,) or not np.isfinite(arrays[key]).all():
                    raise ValueError(f"Invalid candidate column {key} in {directory}")
            bearings = np.arange(0, 360, recipe["horizon_azimuth_step_deg"])
            if not np.array_equal(arrays["horizon_azimuth_deg"], bearings):
                raise ValueError(f"Invalid horizon bearings in {directory}")
            for key in ("horizons_deg", "blocker_distance_m"):
                if (
                    arrays[key].shape != (n, len(bearings))
                    or not np.isfinite(arrays[key]).all()
                ):
                    raise ValueError(f"Invalid horizon column {key} in {directory}")
            if (arrays["blocker_distance_m"] < 80).any() or (
                arrays["blocker_distance_m"] > 200000
            ).any():
                raise ValueError(f"Invalid blocker ranges in {directory}")
            all_ids.update(ids)
            candidate_count += len(ids)
            excluded_count += len(exclusions)
        present.append([x, y])
    return {
        "expected_tiles": len(expected),
        "verified_tiles": len(present),
        "verified_candidates": candidate_count,
        "excluded_candidates": excluded_count,
        "accounted_grid_points": candidate_count + excluded_count,
        "preparation_settings": settings,
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
