"""Freeze an integrity-checked, complete cap catalog and release scoring reference."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from prepare_terrain import RADIUS_M, ROOT, candidate_grid, cap_tile_bounds, sha256
from verify_cap_tiles import verify_tiles

sys.path.insert(0, str(ROOT / "backend"))
from app.services.terrain_store import catalog_digest

REFERENCE_ID = "lunar-south-cap-v1-terrain-p05-p95-v1"


def build_catalog(root: Path) -> dict:
    report = verify_tiles(root, azimuth_step_deg=5)
    if not report["complete"]:
        raise ValueError("A partial cap cannot be published as a full release")
    tiles, sources = [], None
    columns = {key: [] for key in ("slope_deg", "roughness_m", "elevation_m")}
    for x in range(10):
        for y in range(10):
            if not len(candidate_grid((x, y))[0]):
                continue
            tile_id = f"tile-{x}-{y}"
            directory = root / tile_id
            metadata_path = directory / "metadata.json"
            metadata = json.loads(metadata_path.read_text())
            sources = metadata["sources"]
            with np.load(directory / "terrain.npz", allow_pickle=False) as arrays:
                for key, values in columns.items():
                    values.append(arrays[key])
            tiles.append(
                {
                    "id": tile_id,
                    "tile_index": [x, y],
                    "metadata_path": f"{tile_id}/metadata.json",
                    "metadata_sha256": sha256(metadata_path),
                    "candidate_count": metadata["candidate_count"],
                    "excluded_count": metadata["excluded_count"],
                    "footprint": {
                        "type": "projected_rectangle_intersect_south_cap",
                        "extent_m": list(cap_tile_bounds(x, y)),
                        "latitude_max_deg": -87,
                        "exclude_pole": True,
                    },
                    "geographic_footprint": {
                        "type": "inverse_projected_rectangle_intersect_latitude_band",
                        "projected_extent_m": list(cap_tile_bounds(x, y)),
                        "latitude_band_deg": [-90, -87],
                        "exclude_pole": True,
                        "projection_reference": "catalog.projection",
                    },
                    "validity_path": f"{tile_id}/exclusions.json",
                    "artifacts": metadata["artifacts"],
                }
            )
    reference = {
        "id": REFERENCE_ID,
        "method": "full prepared dataset 5th/95th percentiles, clipped linear utility",
        "bounds": {
            key: np.percentile(np.concatenate(parts), [5, 95]).tolist()
            for key, parts in columns.items()
        },
    }
    catalog = {
        "schema_version": 1,
        "dataset_version": "lunar-south-cap-v1",
        "coordinate_frame": "MOON_ME_DE440_ME421",
        "reference_radius_m": RADIUS_M,
        "source_frame": "MOON_ME / DE421",
        "profile_id": "south-cap-500m-5deg-5min-v1",
        "projection": {
            "type": "south_polar_stereographic",
            "central_meridian_deg": 0,
            "standard_parallel_deg": -90,
            "units": "metres",
            "definition": "+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +R=1737400 +units=m",
        },
        "longitude_convention": "degrees east in [-180, 180)",
        "coverage": {
            "type": "polar_cap",
            "latitude_min_deg": -90,
            "latitude_max_deg": -87,
            "exclude_pole": True,
            "candidate_spacing_m": 500,
            "extent_m": [-100000, -100000, 100000, 100000],
        },
        "layers": {
            "terrain": True,
            "horizons": True,
            "feature_centers": True,
            "psr_distance": False,
            "psr_display": False,
            "dem_confidence": False,
        },
        "feature_catalog": {"path": "features.json"},
        "sources": sources,
        "preparation_settings": report["preparation_settings"],
        "horizon_dependencies": {
            "source_ids": ["dem"],
            "source_latitude_band_deg": [-90, -80],
            "maximum_range_m": 200000,
            "runtime_raw_dem_required": False,
        },
        "scoring_reference": reference,
        "verification": report,
        "tiles": tiles,
    }
    feature = root / "features.json"
    if feature.exists():
        catalog["feature_catalog"].update(
            sha256=sha256(feature), bytes=feature.stat().st_size
        )
        feature_source = json.loads(feature.read_text())["source"]
        catalog["sources"] = [*sources, feature_source]
    else:
        raise ValueError(
            "Verified feature catalog must be assembled before publication"
        )
    catalog["catalog_sha256"] = catalog_digest(catalog)
    path = root / "catalog.json"
    if path.exists() and json.loads(path.read_text()) != catalog:
        raise ValueError(
            "Refusing to silently change a frozen catalog; create a new release version"
        )
    path.write_text(json.dumps(catalog, indent=2, allow_nan=False), encoding="utf-8")
    (root / "verification.json").write_text(
        json.dumps(report, indent=2), encoding="utf-8"
    )
    return catalog


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root", type=Path, default=ROOT / "data/derived/lunar-south-cap-v1"
    )
    args = parser.parse_args()
    catalog = build_catalog(args.root)
    print(f"Frozen catalog {catalog['catalog_sha256']}: {len(catalog['tiles'])} tiles")
