"""Coarse global single-point previews, independent of regional candidate ranking."""

from __future__ import annotations

import hashlib
import json
import os
from datetime import UTC
from functools import lru_cache
from pathlib import Path

import numpy as np
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from pydantic import Field, model_validator
from spiceypy.utils.exceptions import SpiceyError

from app.models import Coordinate, StrictModel, TimeRange
from app.services.bounded_analysis import bounded_analysis
from app.services.ephemeris import RADIUS_M, body_positions, load_kernels
from app.services.search import analyze, analyze_batch
from app.services.validation import MAXIMUM_WINDOW, VALID_END, VALID_START
from app.settings import REPOSITORY_ROOT, settings

router = APIRouter(prefix="/api/v1/global")
GLOBAL_ROOT = Path(
    os.getenv("LUMEN_GLOBAL_ROOT", REPOSITORY_ROOT / "data/derived/global-preview-v1")
)


@lru_cache(maxsize=1)
def hemisphere_landmarks():
    artifact = (REPOSITORY_ROOT / "backend/app/data/hemisphere-landmarks.json").read_bytes()
    if (
        hashlib.sha256(artifact).hexdigest()
        != "24c5c3d29dc19156b471f84f4ed97ef4ae431389b0eb6c6fc31ea3695bc33dd4"
    ):
        raise HTTPException(503, "The hemisphere landmark index could not be verified.")
    return json.loads(artifact)


@router.get("/features")
def find_hemisphere_features(q: str = Query(min_length=1, max_length=100)):
    index = hemisphere_landmarks()
    query = q.strip().casefold()
    matches = [
        feature
        for feature in index["features"]
        if query
        and (query in feature["name"].casefold() or query in feature["clean_name"].casefold())
    ]
    matches.sort(
        key=lambda feature: (
            feature["name"].casefold() != query,
            not feature["name"].casefold().startswith(query),
            feature["name"].casefold(),
        )
    )
    return {"features": matches[:20], "total": len(matches), "source": index["source"]}


class GlobalPointRequest(StrictModel):
    coordinate: Coordinate
    time_range: TimeRange


class GlobalAreaRequest(GlobalPointRequest):
    radius_km: float = Field(ge=1, le=5)
    sunlight_weight: float = Field(default=0.5, ge=0, le=1)

    @model_validator(mode="after")
    def southern_area(self):
        if self.coordinate.latitude_deg > 0:
            raise ValueError("Select a southern hemisphere area.")
        return self


@router.post("/rank-area")
async def rank_area(payload: GlobalAreaRequest, request: Request):
    return JSONResponse(
        await bounded_analysis("rank_area", payload.model_dump(mode="json"), request)
    )


def area_ranking_calculation(request: GlobalAreaRequest):
    """Evaluate a bounded 2 km local lattice, never invent fine terrain metrics."""
    start, end = request.time_range.start_utc, request.time_range.end_utc
    if start.tzinfo is None or end.tzinfo is None:
        raise HTTPException(422, "Dates must include a UTC offset.")
    start, end = start.astimezone(UTC), end.astimezone(UTC)
    if not (VALID_START <= start < end <= VALID_END) or (end - start).total_seconds() > 7 * 86400:
        raise HTTPException(422, "Choose 1–7 days within 2025–2035 for local coarse ranking.")
    try:
        metadata, grid = global_grid()
        # Fixed physical spacing avoids presenting interpolated sub-kilometer pixels as evidence.
        offsets = [
            (x, y)
            for y in range(-4000, 4001, 2000)
            for x in range(-4000, 4001, 2000)
            if x * x + y * y <= (request.radius_km * 1000) ** 2
        ]
        x, y = np.asarray(offsets, dtype=float).T
        lat, lon = destinations(
            request.coordinate.latitude_deg,
            request.coordinate.longitude_deg_east,
            np.arctan2(x, y),
            np.hypot(x, y),
        )
        keep = lat <= 0
        lat, lon = lat[keep], lon[keep]
        elevation = sample_global(grid, lat, lon)
        distances = np.arange(2000, 200001, 2000)
        bearings = np.deg2rad(np.arange(0, 360, 5))[:, None]
        angle = distances[None, :] / RADIUS_M
        profiles, blockers = [], []
        for latitude, longitude, height in zip(lat, lon, elevation, strict=True):
            ray_lat, ray_lon = destinations(latitude, longitude, bearings, distances[None, :])
            heights = sample_global(grid, ray_lat, ray_lon)
            angles = np.rad2deg(
                np.arctan2(
                    (RADIUS_M + heights) * np.cos(angle) - (RADIUS_M + height + 2),
                    (RADIUS_M + heights) * np.sin(angle),
                )
            )
            profiles.append(np.max(angles, axis=1))
            blockers.append(distances[np.argmax(angles, axis=1)])
        arrays = {
            "lat_deg": lat,
            "lon_deg": lon,
            "elevation_m": elevation,
            "horizons_deg": np.asarray(profiles),
            "blocker_distance_m": np.asarray(blockers),
        }
        times, sun, earth = body_positions(settings.kernel_root, start, end, 5)
        metrics = analyze_batch(arrays, np.arange(len(lat)), times, sun, earth)
        sites = [
            {
                "id": f"coarse-{i}",
                "latitude_deg": float(latitude),
                "longitude_deg_east": float(longitude),
                "elevation_m": float(height),
                "metrics": metric,
                "score": 100
                * (
                    request.sunlight_weight * metric["illumination_fraction"]
                    + (1 - request.sunlight_weight) * metric["earth_visibility_fraction"]
                ),
            }
            for i, (latitude, longitude, height, metric) in enumerate(
                zip(lat, lon, elevation, metrics, strict=True)
            )
        ]
        sites.sort(key=lambda site: (-site["score"], site["id"]))
        for rank, site in enumerate(sites, 1):
            site["rank"] = rank
        return {
            "request": request.model_dump(mode="json"),
            "sites": sites,
            "candidate_count": len(sites),
            "time_range": {"start_utc": start.isoformat(), "end_utc": end.isoformat()},
            "provenance": {
                **metadata,
                "candidate_spacing_m": 2000,
                "time_step_minutes": 5,
                "horizon_azimuth_step_deg": 5,
                "horizon_radial_step_m": 2000,
                "horizon_maximum_range_m": 200000,
                "kernels": list(load_kernels(settings.kernel_root)),
            },
            "warnings": [
                "Exploratory coarse ranking, separate from detailed polar site rankings. Scores are weighted sunlight and Earth visibility only.",
                "Candidates lie on a 2 km local lattice inside the selected circle. Areas smaller than 2 km radius may contain only the center.",
                "Global elevation grid spacing is about 1.9 km north–south; nearby hazards, small craters and narrow ridges may be missed.",
                "No fine-scale slope, roughness, landing safety, PSR/resource ranking or mission hard-constraint screening is provided.",
                "Only the southern part of a circle crossing the equator is evaluated. Exact-pole azimuth follows the entered longitude.",
            ],
        }
    except (OSError, ValueError, KeyError, SpiceyError) as exc:
        raise HTTPException(
            503, "Verified global terrain or ephemeris data is unavailable."
        ) from exc


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
async def preview(payload: GlobalPointRequest, request: Request):
    return JSONResponse(await bounded_analysis("preview", payload.model_dump(mode="json"), request))


def preview_calculation(request: GlobalPointRequest):
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
