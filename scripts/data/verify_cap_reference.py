"""Replay sampled cap sites directly against pinned full NASA source rasters."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import rasterio
from prepare_terrain import (
    FILENAMES,
    ROOT,
    SOURCE_SHA256,
    horizon_profiles,
    sample_raster,
    sha256,
)


def verify_reference(root: Path, raw: Path) -> dict:
    rasters = {}
    for key, name in FILENAMES.items():
        path = raw / name
        if sha256(path) != SOURCE_SHA256[key]:
            raise ValueError(f"Reference source checksum failed: {name}")
        with rasterio.open(path) as source:
            # Original full-raster implementation, without window/read optimizations.
            rasters[key] = source.read(1), source.transform
    cases = []
    for tile_id in ("tile-0-3", "tile-5-5", "tile-9-6"):
        with np.load(root / tile_id / "terrain.npz", allow_pickle=False) as archive:
            arrays = {key: archive[key] for key in archive.files}
        indices = np.array(sorted({0, len(arrays["ids"]) // 2, len(arrays["ids"]) - 1}))
        x, y = arrays["x_m"][indices], arrays["y_m"][indices]
        for source_key, column in (
            ("dem", "elevation_m"),
            ("slope", "slope_deg"),
            ("roughness", "roughness_m"),
        ):
            values = sample_raster(
                *rasters[source_key], x, y, order=1 if source_key == "dem" else 0
            )
            np.testing.assert_array_equal(values, arrays[column][indices])
        bearings, horizons, blockers, valid = horizon_profiles(
            *rasters["dem"],
            np.deg2rad(arrays["lat_deg"][indices]),
            np.deg2rad(arrays["lon_deg"][indices]),
            arrays["elevation_m"][indices],
            5,
        )
        if not valid.all():
            raise ValueError("Reference horizon has missing source samples")
        np.testing.assert_array_equal(bearings, arrays["horizon_azimuth_deg"])
        np.testing.assert_allclose(
            horizons, arrays["horizons_deg"][indices], atol=1e-6, rtol=0
        )
        np.testing.assert_array_equal(blockers, arrays["blocker_distance_m"][indices])
        cases.append(
            {
                "tile_id": tile_id,
                "site_ids": arrays["ids"][indices].tolist(),
                "maximum_horizon_error_deg": float(
                    np.max(abs(horizons - arrays["horizons_deg"][indices]))
                ),
                "blocker_ranges_equal": True,
                "source_metrics_equal": True,
            }
        )
    report = {
        "catalog_sha256": json.loads((root / "catalog.json").read_text())["catalog_sha256"],
        "source_hashes": SOURCE_SHA256,
        "full_raster_reference": True,
        "cases": cases,
    }
    (root / "source-reference-validation.json").write_text(
        json.dumps(report, indent=2), encoding="utf-8"
    )
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root", type=Path, default=ROOT / "data/derived/lunar-south-cap-v1"
    )
    parser.add_argument("--raw", type=Path, default=ROOT / "data/raw/pgda-product-90")
    args = parser.parse_args()
    print(json.dumps(verify_reference(args.root, args.raw), indent=2))
