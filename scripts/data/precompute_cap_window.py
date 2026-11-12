"""Prepare exact October 2028 metrics per tile, resuming verified work only.

--follow consumes completed terrain tiles while prepare_cap.py is running.
No service startup or synthetic substitute is involved.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from time import perf_counter, sleep

import numpy as np
from build_cap_catalog import REFERENCE_ID
from prepare_terrain import ROOT, candidate_grid, sha256
from verify_cap_tiles import verify_tiles

sys.path.insert(0, str(ROOT / "backend"))
from app.services.ephemeris import body_positions
from app.services.search import METRIC_KEYS, analyze, analyze_batch
from app.services.tile_metrics import cache_identity, identity_key, load_tile_metrics


def prepare_tile(
    root: Path, tile_id: str, kernel_root: Path, start, end, positions
) -> None:
    directory, output = root / tile_id, root / "demo-cache"
    metadata = json.loads((directory / "metadata.json").read_text())
    with np.load(directory / "terrain.npz", allow_pickle=False) as archive:
        arrays = {key: archive[key] for key in archive.files}
    identity = cache_identity(metadata, kernel_root, start, end, REFERENCE_ID)
    if load_tile_metrics(output, tile_id, identity, arrays["ids"]) is not None:
        return
    started = perf_counter()
    times, sun, earth = positions
    rows = []
    for offset in range(0, len(arrays["ids"]), 32):
        indices = np.arange(offset, min(offset + 32, len(arrays["ids"])))
        rows.extend(analyze_batch(arrays, indices, times, sun, earth))
    columns = {
        key: np.asarray([row[key] for row in rows], dtype=np.float64)
        for key in METRIC_KEYS
    }
    samples = sorted({0, len(rows) // 2, len(rows) - 1}) if rows else []
    maximum_error = 0.0
    for i in samples:
        direct = analyze(arrays, i, times, sun, earth)["metrics"]
        for key in METRIC_KEYS:
            error = abs(columns[key][i] - direct[key])
            maximum_error = max(maximum_error, error)
            if error > 1e-8:
                raise ValueError(
                    f"Cached/direct mismatch: {tile_id} {i} {key}: {error}"
                )
    output.mkdir(parents=True, exist_ok=True)
    path = output / f"{tile_id}.npz"
    temporary = path.with_suffix(".partial.npz")
    key = identity_key(identity)
    np.savez_compressed(temporary, ids=arrays["ids"], key=np.array(key), **columns)
    temporary.replace(path)
    manifest = {
        "key": key,
        "identity": identity,
        "sha256": sha256(path),
        "bytes": path.stat().st_size,
        "candidate_count": len(rows),
        "scalar_reference_site_ids": arrays["ids"][samples].tolist(),
        "maximum_scalar_reference_error": maximum_error,
        "elapsed_seconds": perf_counter() - started,
    }
    manifest_path = output / f"{tile_id}.json"
    temporary_manifest = manifest_path.with_suffix(".partial.json")
    temporary_manifest.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    temporary_manifest.replace(manifest_path)
    print(
        f"Exact demo cache {tile_id}: {len(rows)} sites, {manifest['elapsed_seconds']:.2f}s",
        flush=True,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root", type=Path, default=ROOT / "data/derived/lunar-south-cap-v1"
    )
    parser.add_argument("--kernel-root", type=Path, default=ROOT / "data/raw/kernels")
    parser.add_argument("--follow", action="store_true")
    args = parser.parse_args()
    start, end = datetime(2028, 10, 1, tzinfo=UTC), datetime(2028, 10, 31, tzinfo=UTC)
    positions = body_positions(args.kernel_root, start, end, 5)
    expected = [
        f"tile-{x}-{y}"
        for x in range(10)
        for y in range(10)
        if len(candidate_grid((x, y))[0])
    ]
    completed = set()
    while True:
        verify_tiles(args.root, azimuth_step_deg=5)
        for tile_id in expected:
            if (
                tile_id in completed
                or not (args.root / tile_id / "metadata.json").exists()
            ):
                continue
            prepare_tile(args.root, tile_id, args.kernel_root, start, end, positions)
            completed.add(tile_id)
        if len(completed) == len(expected):
            print(
                f"Verified exact demo metrics for all {len(expected)} tiles", flush=True
            )
            return
        if not args.follow:
            raise SystemExit(
                f"Demo cache incomplete: {len(completed)}/{len(expected)} tiles"
            )
        sleep(5)


if __name__ == "__main__":
    main()
