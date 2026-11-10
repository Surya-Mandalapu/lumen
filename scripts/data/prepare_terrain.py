"""Prepare a small, real LOLA south-pole demonstration dataset.

Install numpy<2, rasterio==1.4.3 and scipy before running. No fabricated terrain,
PSR distances or confidence values are supplied. See the generated metadata for
the deliberately narrower MVP coverage and horizon sampling limits.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import urllib.request
from pathlib import Path

import numpy as np
import rasterio
from scipy.ndimage import map_coordinates

ROOT = Path(__file__).resolve().parents[2]
VERSION = "pgda-demo-v1"
RADIUS_M = 1_737_400.0
CAP_LATITUDE_DEG = -87.0
CAP_TILE_SIZE_M = 20_000
CAP_TILE_COUNT = 10
SOURCE_ROOT = "https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/"
FILENAMES = {
    "dem": "LDEM_80S_80MPP_ADJ.TIF",
    "roughness": "LDRM_80S_1000MPP_ADJ_ROUGH_100M.TIF",
    "slope": "LDRM_80S_1000MPP_ADJ_SLP_100M.TIF",
}
SOURCE_SHA256 = {
    "dem": "82030dcbdd7c4bb0c7d858e9b4b293b9f2cda5a543ba31ec0f42784bd6beee5a",
    "roughness": "5f4428628d78637f4ef67f383422cd200b270f51f31c2abe47bf0d3c239446ec",
    "slope": "5913b99d83d1158d83085c17083b0a86413457b2a352ca837cd8930ef5123c18",
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def projected_to_geographic(x, y):
    rho = np.hypot(x, y)
    return -np.pi / 2 + 2 * np.arctan(rho / (2 * RADIUS_M)), np.arctan2(x, y)


def geographic_to_projected(lat, lon):
    rho = 2 * RADIUS_M * np.tan(np.pi / 4 + lat / 2)
    return rho * np.sin(lon), rho * np.cos(lon)


def sample_raster(values, transform, x, y, order=1):
    """Bilinear DEM samples; nearest-cell sampling for published metric maps."""
    col = (np.asarray(x) - transform.c) / transform.a - 0.5
    row = (np.asarray(y) - transform.f) / transform.e - 0.5
    return map_coordinates(
        values, [row, col], order=order, mode="constant", cval=np.nan
    )


def cap_tile_bounds(tile_x: int, tile_y: int) -> tuple[int, int, int, int]:
    if not (0 <= tile_x < CAP_TILE_COUNT and 0 <= tile_y < CAP_TILE_COUNT):
        raise ValueError("Cap tile indices must be 0 through 9")
    left = -100_000 + tile_x * CAP_TILE_SIZE_M
    bottom = -100_000 + tile_y * CAP_TILE_SIZE_M
    return left, bottom, left + CAP_TILE_SIZE_M, bottom + CAP_TILE_SIZE_M


def candidate_grid(cap_tile: tuple[int, int] | None):
    if cap_tile is None:
        axis = np.arange(-10_000, 10_001, 500)
        xx, yy = np.meshgrid(axis, axis)
        x, y = xx.ravel(), yy.ravel()
        nonpole = np.hypot(x, y) > 0
        return x[nonpole], y[nonpole], (-10_000, -10_000, 10_000, 10_000)
    bounds = cap_tile_bounds(*cap_tile)
    left, bottom, right, top = bounds
    xx, yy = np.meshgrid(np.arange(left, right, 500), np.arange(bottom, top, 500))
    x, y = xx.ravel(), yy.ravel()
    lat, _ = projected_to_geographic(x, y)
    inside = (np.hypot(x, y) > 0) & (np.rad2deg(lat) <= CAP_LATITUDE_DEG)
    return x[inside], y[inside], bounds


def horizon_profiles(dem, transform, lat, lon, elevation, azimuth_step_deg=5):
    """Great-circle rays, radial terrain heights and a spherical local tangent.

    Every sample is converted back into the source polar stereographic raster.
    The 2 m observer height is applied before computing the elevation angle.
    Missing samples invalidate the whole candidate rather than implying clear sky.
    """
    azimuth_deg = np.arange(0, 360, azimuth_step_deg, dtype=np.float64)
    azimuth = np.deg2rad(azimuth_deg)[None, :, None]
    distances = np.r_[
        np.arange(80, 20_001, 80), np.arange(20_320, 200_000, 320), 200_000
    ]
    delta = distances[None, None, :] / RADIUS_M
    sd, cd = np.sin(delta), np.cos(delta)
    horizon = np.empty((len(lat), len(azimuth_deg)), np.float32)
    blockers = np.empty_like(horizon)
    valid = np.ones(len(lat), dtype=bool)
    for start in range(0, len(lat), 16):
        stop = min(start + 16, len(lat))
        lat0, lon0 = lat[start:stop, None, None], lon[start:stop, None, None]
        slat, clat = np.sin(lat0), np.cos(lat0)
        lat1 = np.arcsin(np.clip(slat * cd + clat * sd * np.cos(azimuth), -1, 1))
        lon1 = lon0 + np.arctan2(np.sin(azimuth) * sd * clat, cd - slat * np.sin(lat1))
        x1, y1 = geographic_to_projected(lat1, lon1)
        height = sample_raster(dem, transform, x1, y1)
        valid[start:stop] = np.isfinite(height).all(axis=(1, 2))
        radial = RADIUS_M + height
        angle = np.rad2deg(
            np.arctan2(
                radial * cd - (RADIUS_M + elevation[start:stop, None, None] + 2),
                radial * sd,
            )
        )
        maximum = np.argmax(angle, axis=2)
        horizon[start:stop] = np.take_along_axis(angle, maximum[..., None], axis=2)[
            ..., 0
        ]
        blockers[start:stop] = distances[maximum]
        if start % 160 == 0:
            print(f"Horizon candidates {stop}/{len(lat)}", flush=True)
    return azimuth_deg.astype(np.float32), horizon, blockers, valid


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw", type=Path, default=ROOT / "data/raw/pgda-product-90")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--cap-tile", type=int, nargs=2, metavar=("X", "Y"))
    parser.add_argument("--azimuth-step-deg", type=int, choices=(1, 2, 5), default=5)
    args = parser.parse_args()
    cap_tile = tuple(args.cap_tile) if args.cap_tile is not None else None
    if cap_tile is not None:
        cap_tile_bounds(*cap_tile)
    if args.output is None:
        args.output = (
            ROOT / "data/derived" / VERSION
            if cap_tile is None
            else ROOT
            / "data/derived/lunar-south-cap-v1"
            / f"tile-{cap_tile[0]}-{cap_tile[1]}"
        )
    args.raw.mkdir(parents=True, exist_ok=True)
    args.output.mkdir(parents=True, exist_ok=True)
    sources = []
    rasters = {}
    for key, filename in FILENAMES.items():
        path = args.raw / filename
        if not path.exists():
            print(f"Downloading {filename}", flush=True)
            partial = path.with_suffix(".partial")
            urllib.request.urlretrieve(SOURCE_ROOT + filename, partial)
            partial.replace(path)
        digest = sha256(path)
        if digest != SOURCE_SHA256[key]:
            raise RuntimeError(
                f"Source checksum mismatch: {filename}. Remove a partial download or review "
                "an upstream source update before preparing a new dataset version."
            )
        with rasterio.open(path) as dataset:
            rasters[key] = (dataset.read(1), dataset.transform)
            sources.append(
                {
                    "id": key,
                    "filename": filename,
                    "url": SOURCE_ROOT + filename,
                    "sha256": digest,
                    "bytes": path.stat().st_size,
                    "crs_wkt": dataset.crs.to_wkt(),
                    "resolution_m": abs(dataset.transform.a),
                    "nodata": "NaN" if np.isnan(dataset.nodata) else dataset.nodata,
                    "units": "degrees" if key == "slope" else "metres",
                }
            )
    x, y, extent = candidate_grid(cap_tile)
    if not len(x):
        print(f"Tile {cap_tile} has no candidates inside 87°S–90°S", flush=True)
        return
    lat, lon = projected_to_geographic(x, y)
    dem, transform = rasters["dem"]
    elevation = sample_raster(dem, transform, x, y)
    slope = sample_raster(*rasters["slope"], x, y, order=0)
    roughness = sample_raster(*rasters["roughness"], x, y, order=0)
    finite = np.isfinite(elevation) & np.isfinite(slope) & np.isfinite(roughness)
    x, y, lat, lon, elevation, slope, roughness = (
        a[finite] for a in (x, y, lat, lon, elevation, slope, roughness)
    )
    azimuth, horizons, blockers, valid = horizon_profiles(
        dem, transform, lat, lon, elevation, args.azimuth_step_deg
    )
    candidate_path = args.output / "terrain.npz"
    ids = np.array([f"lola-{int(a):+06d}-{int(b):+06d}" for a, b in zip(x, y)])
    np.savez_compressed(
        candidate_path,
        ids=ids[valid],
        x_m=x[valid],
        y_m=y[valid],
        lat_deg=np.rad2deg(lat[valid]),
        lon_deg=(np.rad2deg(lon[valid]) + 180) % 360 - 180,
        elevation_m=elevation[valid],
        slope_deg=slope[valid],
        roughness_m=roughness[valid],
        horizons_deg=horizons[valid],
        horizon_azimuth_deg=azimuth,
        blocker_distance_m=blockers[valid],
    )
    left, bottom, right, top = extent
    mx, my = np.meshgrid(np.linspace(left, right, 81), np.linspace(top, bottom, 81))
    mesh = sample_raster(dem, transform, mx, my)
    if not np.isfinite(mesh).all():
        raise RuntimeError("Mesh contains missing source pixels")
    mesh_path = args.output / "terrain.json"
    mesh_payload = {
        "width": 81,
        "height": 81,
        "extent_m": list(extent),
        "elevations_m": np.round(mesh.ravel(), 2).tolist(),
        "resolution_m": 250,
        "source_resolution_m": 80,
        "row_order": "north_to_south",
        "source": "NASA PGDA LOLA LDEM_80S_80MPP_ADJ.TIF",
        "crs": "Lunar south polar stereographic; central meridian 0; radius 1737400 m",
    }
    mesh_path.write_text(
        json.dumps(mesh_payload, separators=(",", ":")), encoding="utf-8"
    )
    metadata = {
        "dataset_version": VERSION if cap_tile is None else "lunar-south-cap-v1",
        "preprocessing_version": "1.0.0",
        "coordinate_frame": "MOON_ME_DE440_ME421",
        "source_frame": "MOON_ME / DE421",
        "reference_radius_m": RADIUS_M,
        "coverage": {
            "type": "projected_square" if cap_tile is None else "polar_cap_tile",
            "extent_m": list(extent),
            "latitude_min_deg": float(np.rad2deg(lat[valid]).min()),
            "latitude_max_deg": float(np.rad2deg(lat[valid]).max()),
            "description": (
                "20 km square around the lunar south pole; excludes the pole point"
                if cap_tile is None
                else "20 km projection tile clipped to 87°S–90°S; excludes the pole point"
            ),
            **(
                {
                    "tile_index": list(cap_tile),
                    "cap_minimum_latitude_deg": -90,
                    "cap_maximum_latitude_deg": CAP_LATITUDE_DEG,
                }
                if cap_tile is not None
                else {}
            ),
        },
        "candidate_count": int(valid.sum()),
        "candidate_spacing_m": 500,
        "terrain_resolution_m": 80,
        "metric_sampling_resolution_m": 1000,
        "metric_baseline_m": 100,
        "observer_height_m": 2,
        "horizon_azimuth_step_deg": args.azimuth_step_deg,
        "horizon_max_range_m": 200000,
        "horizon_near_step_m": 80,
        "horizon_far_step_m": 320,
        "horizon_near_range_m": 20000,
        "sources": sources,
        "citation": "Barker et al. (2023), Planet. Sci. J. 4,183; doi:10.3847/PSJ/acf3e1",
        "source_landing_page": "https://pgda.gsfc.nasa.gov/products/90",
        "artifacts": {
            p.name: {"sha256": sha256(p), "bytes": p.stat().st_size}
            for p in (candidate_path, mesh_path)
        },
        "limitations": [
            (
                "Curated 20 km square only, not the complete 87-90 degree south polar cap."
                if cap_tile is None
                else "This is one cap tile; full-cap search requires all verified tiles."
            ),
            f"{args.azimuth_step_deg} degree horizon bins and 80/320 m radial sampling can miss narrow blockers; comparative prototype only.",
            "Terrain beyond 200 km and subpixel obstacles are not modeled.",
            "Slope and roughness use published 100 m baseline products sampled on a 1 km output grid; not a landing hazard assessment.",
            "DEM quality/error/count masks are not included; absence of these masks prevents confidence claims.",
            "PSR proximity and named-feature distance are unavailable and must not be inferred.",
        ],
    }
    (args.output / "metadata.json").write_text(
        json.dumps(metadata, indent=2), encoding="utf-8"
    )
    print(
        f"Prepared {int(valid.sum())} real LOLA candidates in {args.output}", flush=True
    )


if __name__ == "__main__":
    main()
