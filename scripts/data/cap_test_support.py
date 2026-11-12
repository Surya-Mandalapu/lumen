"""Explicit synthetic scientific test fixtures; never application data."""

import json
from pathlib import Path

import numpy as np
from prepare_terrain import (
    SOURCE_SHA256,
    candidate_grid,
    projected_to_geographic,
    sha256,
)


def write_tile(root: Path, x: int, y: int, exclude_first: bool = False) -> dict:
    xx, yy, extent = candidate_grid((x, y))
    lat, lon = projected_to_geographic(xx, yy)
    ids = np.array(
        [f"lola-{int(a):+06d}-{int(b):+06d}" for a, b in zip(xx, yy, strict=True)]
    )
    exclusions = []
    keep = np.ones(len(xx), dtype=bool)
    if exclude_first:
        keep[0] = False
        exclusions = [
            {
                "id": ids[0],
                "x_m": int(xx[0]),
                "y_m": int(yy[0]),
                "reason": "missing_horizon_source",
            }
        ]
    n = int(keep.sum())
    directory = root / f"tile-{x}-{y}"
    directory.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        directory / "terrain.npz",
        ids=ids[keep],
        x_m=xx[keep],
        y_m=yy[keep],
        lat_deg=np.rad2deg(lat[keep]),
        lon_deg=(np.rad2deg(lon[keep]) + 180) % 360 - 180,
        elevation_m=(xx[keep] + yy[keep]) / 1000,
        slope_deg=np.abs(xx[keep]) / 10000,
        roughness_m=np.abs(yy[keep]) / 20000,
        horizons_deg=np.zeros((n, 72), dtype=np.float32),
        blocker_distance_m=np.full((n, 72), 800, dtype=np.float32),
        horizon_azimuth_deg=np.arange(0, 360, 5, dtype=np.float32),
    )
    (directory / "terrain.json").write_text("{}")
    (directory / "exclusions.json").write_text(json.dumps(exclusions))
    metadata = {
        "dataset_version": "lunar-south-cap-v1",
        "validity_schema_version": 1,
        "coverage": {"tile_index": [x, y], "extent_m": list(extent)},
        "candidate_count": n,
        "excluded_count": len(exclusions),
        "candidate_spacing_m": 500,
        "terrain_resolution_m": 80,
        "observer_height_m": 2,
        "horizon_azimuth_step_deg": 5,
        "horizon_max_range_m": 200000,
        "horizon_near_step_m": 80,
        "horizon_far_step_m": 320,
        "horizon_near_range_m": 20000,
        "coordinate_frame": "MOON_ME_DE440_ME421",
        "reference_radius_m": 1737400,
        "sources": [
            {"id": key, "sha256": value} for key, value in SOURCE_SHA256.items()
        ],
        "artifacts": {
            name: {
                "sha256": sha256(directory / name),
                "bytes": (directory / name).stat().st_size,
            }
            for name in ("terrain.npz", "terrain.json", "exclusions.json")
        },
    }
    (directory / "metadata.json").write_text(json.dumps(metadata))
    return metadata
