"""Assemble verified cap tiles into an opt-in, searchable terrain bundle."""

from __future__ import annotations

import json
import shutil

import numpy as np
import rasterio
from prepare_terrain import ROOT, SOURCE_SHA256, sample_raster, sha256
from verify_cap_tiles import verify_tiles

TILE_ROOT = ROOT / "data/derived/lunar-south-cap-v1"
DEM = ROOT / "data/raw/pgda-product-90/LDEM_80S_80MPP_ADJ.TIF"
FEATURE_SOURCE = ROOT / "data/derived/pgda-demo-v1/features.json"


def main() -> None:
    report = verify_tiles(TILE_ROOT)
    if not report["complete"]:
        raise SystemExit(
            f"Only {report['verified_tiles']}/{report['expected_tiles']} cap tiles verified"
        )
    if sha256(DEM) != SOURCE_SHA256["dem"]:
        raise SystemExit("NASA DEM checksum mismatch")
    directories = sorted(TILE_ROOT.glob("tile-*-*"))
    columns: dict[str, list[np.ndarray]] = {}
    tile_hashes = []
    first_metadata = None
    azimuth = None
    for directory in directories:
        metadata_path = directory / "metadata.json"
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        first_metadata = first_metadata or metadata
        tile_hashes.append(
            {
                "tile_index": metadata["coverage"]["tile_index"],
                "metadata_sha256": sha256(metadata_path),
            }
        )
        with np.load(directory / "terrain.npz", allow_pickle=False) as arrays:
            if azimuth is None:
                azimuth = arrays["horizon_azimuth_deg"].copy()
            elif not np.array_equal(azimuth, arrays["horizon_azimuth_deg"]):
                raise SystemExit("Mixed horizon resolutions cannot be assembled")
            for key in arrays.files:
                if key != "horizon_azimuth_deg":
                    columns.setdefault(key, []).append(arrays[key].copy())
    merged = {key: np.concatenate(values) for key, values in columns.items()}
    merged["horizon_azimuth_deg"] = azimuth
    if len(merged["ids"]) != report["verified_candidates"]:
        raise SystemExit("Merged candidate count differs from verified tile count")
    output = TILE_ROOT / "terrain.npz"
    np.savez_compressed(output, **merged)

    with rasterio.open(DEM) as source:
        axis = np.linspace(-100_000, 100_000, 101)
        x, y = np.meshgrid(axis, axis[::-1])
        mesh = sample_raster(source.read(1), source.transform, x, y)
    if not np.isfinite(mesh).all():
        raise SystemExit("Cap overview has missing NASA DEM samples")
    mesh_path = TILE_ROOT / "terrain.json"
    mesh_path.write_text(
        json.dumps(
            {
                "width": 101,
                "height": 101,
                "extent_m": [-100_000, -100_000, 100_000, 100_000],
                "elevations_m": np.round(mesh.ravel(), 2).tolist(),
                "resolution_m": 2000,
                "source_resolution_m": 80,
                "row_order": "north_to_south",
                "source": "NASA PGDA LOLA LDEM_80S_80MPP_ADJ.TIF",
                "crs": "Lunar south polar stereographic; central meridian 0; radius 1737400 m",
            },
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )

    feature_path = TILE_ROOT / "features.json"
    patch_metadata = json.loads(
        (FEATURE_SOURCE.parent / "metadata.json").read_text(encoding="utf-8")
    )
    if sha256(FEATURE_SOURCE) != patch_metadata["artifacts"]["features.json"]["sha256"]:
        raise SystemExit("Approved-feature catalog failed its bundled checksum")
    shutil.copyfile(FEATURE_SOURCE, feature_path)
    feature_source = json.loads(feature_path.read_text(encoding="utf-8"))["source"]

    metadata = dict(first_metadata)
    metadata.update(
        dataset_version="lunar-south-cap-v1",
        candidate_count=len(merged["ids"]),
        coverage={
            "type": "polar_cap",
            "extent_m": [-100_000, -100_000, 100_000, 100_000],
            "latitude_min_deg": float(np.min(merged["lat_deg"])),
            "latitude_max_deg": float(np.max(merged["lat_deg"])),
            "description": "Verified 87°S–90°S candidate cap; exact pole excluded",
            "source_tiles": len(tile_hashes),
        },
        tiles=tile_hashes,
        sources=[*first_metadata["sources"], feature_source],
        artifacts={
            path.name: {"sha256": sha256(path), "bytes": path.stat().st_size}
            for path in (output, mesh_path, feature_path)
        },
        limitations=[
            "Regional 500 m candidates use NASA 80 m terrain and 1 km slope/roughness grids.",
            "Horizon azimuth spacing is 5 degrees unless all tiles were prepared at a finer common spacing.",
            "A 2 km terrain overview is for display; candidate calculations use source-derived horizons.",
            "DEM confidence masks, 5 m hazard assessment and PSR proximity are not included.",
            "Approved-feature proximity uses official center points, not geological boundaries.",
        ],
    )
    (TILE_ROOT / "metadata.json").write_text(
        json.dumps(metadata, indent=2), encoding="utf-8"
    )
    print(f"Assembled {len(merged['ids'])} verified NASA candidates across 87°S–90°S")


if __name__ == "__main__":
    main()
