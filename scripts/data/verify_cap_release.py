"""Independently check tile/assembled equivalence, exact caches and selected-area science."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
from prepare_terrain import ROOT
from verify_cap_tiles import verify_tiles

sys.path.insert(0, str(ROOT / "backend"))
from app.services.dataset import dataset
from app.services.ephemeris import body_positions
from app.services.search import METRIC_KEYS, analyze_batch, category_scores
from app.services.terrain_store import ROW_COLUMNS, TerrainStore
from app.services.tile_metrics import cache_identity, load_tile_metrics


def shortlist(arrays, metrics, reference):
    ranked = []
    for i, row in enumerate(metrics):
        if arrays["slope_deg"][i] > 10 or row["earth_visibility_fraction"] < 0.5:
            continue
        scores = category_scores(
            row,
            arrays["slope_deg"][i],
            arrays["roughness_m"][i],
            arrays["elevation_m"][i],
            720,
            reference["bounds"],
        )
        score = 100 * (
            0.4 * scores["illumination"]
            + 0.4 * scores["earth_visibility"]
            + 0.2 * scores["terrain_safety"]
        )
        ranked.append((score, str(arrays["ids"][i]), i))
    ranked.sort(key=lambda row: (-row[0], row[1]))
    selected = []
    for score, site_id, i in ranked:
        if all(
            np.hypot(
                arrays["x_m"][i] - arrays["x_m"][j], arrays["y_m"][i] - arrays["y_m"][j]
            )
            >= 1500
            for _, _, j in selected
        ):
            selected.append((score, site_id, i))
        if len(selected) == 5:
            break
    return [site_id for _, site_id, _ in ranked], [
        site_id for _, site_id, _ in selected
    ]


def verify_release(root: Path, kernel_root: Path) -> dict:
    report = verify_tiles(root, azimuth_step_deg=5)
    if not report["complete"]:
        raise ValueError("Incomplete tile release")
    store = TerrainStore(root, max_cache_bytes=2 * 1024 * 1024)
    catalog = store.catalog()
    store.features()
    metadata, assembled = dataset(root)
    if metadata["scoring_reference"] != catalog["scoring_reference"]:
        raise ValueError("Assembled/catalog scoring references disagree")
    lookup = {str(site_id): i for i, site_id in enumerate(assembled["ids"])}
    start, end = datetime(2028, 10, 1, tzinfo=UTC), datetime(2028, 10, 31, tzinfo=UTC)
    scalar_samples, maximum_scalar_error = 0, 0.0
    for tile in catalog["tiles"]:
        arrays = store.load_tile(tile["id"])
        indices = np.array(
            [lookup[str(site_id)] for site_id in arrays["ids"]], dtype=int
        )
        for key in ROW_COLUMNS:
            np.testing.assert_array_equal(arrays[key], assembled[key][indices])
        tile_metadata = json.loads((root / tile["metadata_path"]).read_text())
        identity = cache_identity(
            tile_metadata, kernel_root, start, end, catalog["scoring_reference"]["id"]
        )
        cached = load_tile_metrics(
            root / "demo-cache", tile["id"], identity, arrays["ids"]
        )
        if cached is None:
            raise ValueError(f"Missing/stale/damaged exact cache for {tile['id']}")
        manifest = json.loads((root / "demo-cache" / f"{tile['id']}.json").read_text())
        scalar_samples += len(manifest["scalar_reference_site_ids"])
        maximum_scalar_error = max(
            maximum_scalar_error, manifest["maximum_scalar_reference_error"]
        )
    cases = []
    for lat0, lon0, radius in [
        (-89.99, 0, 3),
        (-89.8, 179.99, 5),
        (-89.8, -180.01, 5),
        (-87.01, 40, 5),
        (-90, 0, 1),
    ]:
        store.clear()
        arrays = store.load_area(lat0, lon0, radius)
        lat, lon = np.deg2rad(assembled["lat_deg"]), np.deg2rad(assembled["lon_deg"])
        center_lat, center_lon = np.deg2rad([lat0, lon0])
        hav = (
            np.sin((lat - center_lat) / 2) ** 2
            + np.cos(lat) * np.cos(center_lat) * np.sin((lon - center_lon) / 2) ** 2
        )
        inside = 2 * 1737.4 * np.arcsin(np.sqrt(np.clip(hav, 0, 1))) <= radius
        expected = np.flatnonzero(inside)
        expected = expected[np.argsort(assembled["ids"][expected])]
        for key in ROW_COLUMNS:
            np.testing.assert_array_equal(arrays[key], assembled[key][expected])
        cases.append(
            {
                "latitude_deg": lat0,
                "longitude_deg_east": lon0,
                "radius_km": radius,
                "candidate_count": len(expected),
                "loaded_tiles": store.trace()["loaded_tile_ids"],
                "intersecting_tiles": store.intersecting_tiles(lat0, lon0, radius),
            }
        )
    # Complete eligible set and shortlist equivalence on a tractable seam circle.
    arrays = store.load_area(-89.99, 0, 3)
    positions = body_positions(kernel_root, start, end, 5)
    direct = []
    for offset in range(0, len(arrays["ids"]), 32):
        direct.extend(
            analyze_batch(
                arrays,
                np.arange(offset, min(offset + 32, len(arrays["ids"]))),
                *positions,
            )
        )
    by_id = {}
    for tile_id in store.intersecting_tiles(-89.99, 0, 3):
        tile_arrays = store.load_tile(tile_id)
        tile_metadata = json.loads((root / tile_id / "metadata.json").read_text())
        identity = cache_identity(
            tile_metadata, kernel_root, start, end, catalog["scoring_reference"]["id"]
        )
        cached = load_tile_metrics(
            root / "demo-cache", tile_id, identity, tile_arrays["ids"]
        )
        for i, site_id in enumerate(tile_arrays["ids"]):
            by_id[str(site_id)] = {key: float(cached[key][i]) for key in METRIC_KEYS}
    cached_rows = [by_id[str(site_id)] for site_id in arrays["ids"]]
    maximum_cache_error = 0.0
    for computed, cached in zip(direct, cached_rows, strict=True):
        for key in METRIC_KEYS:
            error = abs(computed[key] - cached[key])
            maximum_cache_error = max(maximum_cache_error, error)
            if error > 1e-8:
                raise ValueError("Cached/direct metric equivalence failed")
    eligible, selected = shortlist(arrays, direct, catalog["scoring_reference"])
    if (eligible, selected) != shortlist(
        arrays, cached_rows, catalog["scoring_reference"]
    ):
        raise ValueError("Cached/direct eligible set or shortlist order changed")
    result = {
        "schema_version": 1,
        "catalog_sha256": catalog["catalog_sha256"],
        "tile_verification": report,
        "assembled_equivalence": True,
        "exact_cache_tiles": len(catalog["tiles"]),
        "scalar_reference_sites": scalar_samples,
        "maximum_scalar_reference_error": maximum_scalar_error,
        "maximum_cache_reference_error": maximum_cache_error,
        "circles": cases,
        "reference_eligible_count": len(eligible),
        "reference_shortlist": selected,
        "loader": store.trace(),
    }
    (root / "release-validation.json").write_text(
        json.dumps(result, indent=2), encoding="utf-8"
    )
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root", type=Path, default=ROOT / "data/derived/lunar-south-cap-v1"
    )
    parser.add_argument("--kernel-root", type=Path, default=ROOT / "data/raw/kernels")
    args = parser.parse_args()
    print(json.dumps(verify_release(args.root, args.kernel_root), indent=2))
