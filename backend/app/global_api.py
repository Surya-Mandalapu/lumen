"""Coarse global single-point previews, independent of regional candidate ranking."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC
from functools import lru_cache

import numpy as np
from fastapi import APIRouter, HTTPException
from spiceypy.utils.exceptions import SpiceyError

from app.models import Coordinate, StrictModel, TimeRange
from app.services.ephemeris import RADIUS_M, body_positions, load_kernels
from app.services.search import analyze
from app.services.validation import MAXIMUM_WINDOW, VALID_END, VALID_START
from app.settings import REPOSITORY_ROOT, settings

router = APIRouter(prefix="/api/v1/global")
GLOBAL_ROOT = REPOSITORY_ROOT / "data/derived/global-preview-v1"


class GlobalPointRequest(StrictModel):
    coordinate: Coordinate
    time_range: TimeRange


@lru_cache(maxsize=1)
def _load_grid(metadata_stamp: int, artifact_stamp: int):
    del metadata_stamp, artifact_stamp
    metadata = json.loads((GLOBAL_ROOT / "metadata.json").read_text())
    artifact = GLOBAL_ROOT / "elevation.npz"
    if hashlib.sha256(artifact.read_bytes()).hexdigest() != metadata["artifact_sha256"]:
        raise ValueError("Global elevation checksum mismatch")
    with np.load(artifact, allow_pickle=False) as archive:
        grid = archive["elevation_m"].copy()
    if grid.shape != (2880, 5760) or not np.isfinite(grid).all():
        raise ValueError("Invalid global elevation grid")
    return metadata, grid


def global_grid():
    return _load_grid(
        (GLOBAL_ROOT / "metadata.json").stat().st_mtime_ns,
        (GLOBAL_ROOT / "elevation.npz").stat().st_mtime_ns,
    )


def sample_global(grid, lat_deg, lon_deg):
    """Bilinear pixel-center sampling, periodic longitude, clamped polar rows."""
    height, width = grid.shape
    row = np.clip((90 - np.asarray(lat_deg)) * height / 180 - 0.5, 0, height - 1)
    col = ((np.asarray(lon_deg) + 180) * width / 360 - 0.5) % width
    low_r, low_c = np.floor(row).astype(int), np.floor(col).astype(int)
    high_r, high_c = np.minimum(low_r + 1, height - 1), (low_c + 1) % width
    dr, dc = row - low_r, col - low_c
    result = (1 - dr) * ((1 - dc) * grid[low_r, low_c] + dc * grid[low_r, high_c]) + dr * (
        (1 - dc) * grid[high_r, low_c] + dc * grid[high_r, high_c]
    )
    # All meridians meet at a pole; avoid inventing longitude-dependent polar heights.
    result = np.where(np.asarray(lat_deg) >= 90, grid[0].mean(), result)
    return np.where(np.asarray(lat_deg) <= -90, grid[-1].mean(), result)


def destinations(lat_deg, lon_deg, bearings, distance_m):
    """Vector destination formula remains defined at both poles and the date line."""
    lat, lon = np.deg2rad([lat_deg, lon_deg])
    up = np.array([np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)])
    east = np.array([-np.sin(lon), np.cos(lon), 0])
    north = np.cross(up, east)
    bearing = np.asarray(bearings)
    angle = np.asarray(distance_m) / RADIUS_M
    direction = np.cos(bearing)[..., None] * north + np.sin(bearing)[..., None] * east
    point = np.cos(angle)[..., None] * up + np.sin(angle)[..., None] * direction
    return np.rad2deg(np.arcsin(np.clip(point[..., 2], -1, 1))), np.rad2deg(
        np.arctan2(point[..., 1], point[..., 0])
    )


@router.get("/terrain")
def overview():
    try:
        metadata, grid = global_grid()
        return {
            "width": 360,
            "height": 180,
            "elevations_m": grid[8::16, 8::16].astype(int).ravel().tolist(),
            "provenance": metadata,
        }
    except (OSError, ValueError, KeyError) as exc:
        raise HTTPException(503, "Global terrain is not prepared. Run prepare_global.py.") from exc


@router.post("/preview")
def preview(request: GlobalPointRequest):
    start, end = request.time_range.start_utc, request.time_range.end_utc
    if start.tzinfo is None or end.tzinfo is None:
        raise HTTPException(422, "Dates must include a UTC offset.")
    start, end = start.astimezone(UTC), end.astimezone(UTC)
    if not (VALID_START <= start < end <= VALID_END) or end - start > MAXIMUM_WINDOW:
        raise HTTPException(422, "Use an increasing window of up to 31 days within 2025–2035.")
    try:
        metadata, grid = global_grid()
        lat, lon = request.coordinate.latitude_deg, request.coordinate.longitude_deg_east
        elevation = float(sample_global(grid, lat, lon))
        distances = np.arange(2000, 200001, 2000)
        bearings = np.deg2rad(np.arange(0, 360, 5))[:, None]
        ray_lat, ray_lon = destinations(lat, lon, bearings, distances[None, :])
        heights = sample_global(grid, ray_lat, ray_lon)
        angle = distances[None, :] / RADIUS_M
        angles = np.rad2deg(
            np.arctan2(
                (RADIUS_M + heights) * np.cos(angle) - (RADIUS_M + elevation + 2),
                (RADIUS_M + heights) * np.sin(angle),
            )
        )
        maximum = np.argmax(angles, axis=1)
        profile = np.max(angles, axis=1)
        arrays = {
            "lat_deg": np.array([lat]),
            "lon_deg": np.array([lon]),
            "elevation_m": np.array([elevation]),
            "horizons_deg": profile[None, :],
            "blocker_distance_m": distances[maximum][None, :],
        }
        times, sun, earth = body_positions(settings.kernel_root, start, end, 5)
        detail = analyze(arrays, 0, times, sun, earth, timeline=True)
        x, y = np.meshgrid(np.linspace(-40000, 40000, 41), np.linspace(40000, -40000, 41))
        mesh_lat, mesh_lon = destinations(lat, lon, np.arctan2(x, y), np.hypot(x, y))
        mesh = sample_global(grid, mesh_lat, mesh_lon)
        return {
            "coordinate": request.coordinate.model_dump(),
            "elevation_m": elevation,
            "time_range": {"start_utc": start.isoformat(), "end_utc": end.isoformat()},
            **detail,
            "terrain": {
                "width": 41,
                "height": 41,
                "extent_m": [-40000, -40000, 40000, 40000],
                "elevations_m": np.round(mesh, 1).ravel().tolist(),
                "resolution_m": 2000,
            },
            "provenance": {
                **metadata,
                "kernels": list(load_kernels(settings.kernel_root)),
                "time_step_minutes": 5,
                "horizon_azimuth_step_deg": 5,
                "horizon_radial_step_m": 2000,
                "horizon_maximum_range_m": 200000,
            },
            "warnings": [
                "Coarse global preview only: 1/16° grid spacing is about 1.9 km north–south; east–west spacing decreases toward the poles.",
                "Horizon rays start at 2 km and use 5° bearings to 200 km. Nearby obstacles, small craters and narrow ridges can be missed.",
                "No landing suitability, fine-scale slope, roughness, PSR or resource assessment is provided.",
                "Five-minute visibility is geometric; it is not usable solar power or an RF link budget.",
                "At an exact pole, azimuth uses the entered longitude as an arbitrary local reference.",
            ],
        }
    except (OSError, ValueError, KeyError, SpiceyError) as exc:
        raise HTTPException(
            503, "Verified global terrain or ephemeris data is unavailable."
        ) from exc
