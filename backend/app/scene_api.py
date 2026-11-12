"""Bounded visual ephemerides. Scientific search continues to use its own apparent geometry."""

import hashlib
from datetime import UTC, datetime, timedelta
from functools import lru_cache

import numpy as np
import spiceypy as spice
from fastapi import APIRouter, HTTPException
from spiceypy.utils.exceptions import SpiceyError

from app.global_api import hemisphere_landmarks
from app.models import StrictModel, TimeRange
from app.services.ephemeris import FRAME, LOCK, load_kernels
from app.services.validation import VALID_END, VALID_START
from app.settings import PACKAGE_ROOT, settings

router = APIRouter(prefix="/api/v1/scene")
# Shared globe convention: geographic X -> -Z, Y -> +X, Z -> +Y.
DISPLAY = np.array([[0.0, 1.0, 0.0], [0.0, 0.0, 1.0], [-1.0, 0.0, 0.0]])


class SceneRequest(StrictModel):
    time_range: TimeRange


@lru_cache(maxsize=1)
def load_visual_orientation():
    path = PACKAGE_ROOT / "data/pck00011.tpc"
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != "3dff7b1dbeceaa01f25467767d3fa25816051c85d162d1edf04acb310ee28bb1":
        raise ValueError("Visual orientation kernel checksum mismatch")
    with LOCK:
        spice.furnsh(str(path))
    return digest


def display_quaternion(matrix):
    w, x, y, z = spice.m2q(DISPLAY @ matrix @ DISPLAY.T)
    return [float(x), float(y), float(z), float(w)]


@lru_cache(maxsize=8)
def scene_ephemeris(start: datetime, end: datetime):
    kernels = load_kernels(settings.kernel_root)
    pck = load_visual_orientation()
    count = min(193, max(25, int((end - start).total_seconds() / 3600) + 1))
    times = [start + (end - start) * i / (count - 1) for i in range(count)]
    samples = []
    with LOCK:
        for time in times:
            et = spice.str2et(time.strftime("%Y-%m-%dT%H:%M:%S.%f"))
            moon, _ = spice.spkpos("MOON", et, "J2000", "NONE", "EARTH")
            sun, _ = spice.spkpos("SUN", et, "J2000", "NONE", "EARTH")
            moon_rotation = spice.pxform(FRAME, "J2000", et)
            earth_rotation = spice.pxform("IAU_EARTH", "J2000", et)
            samples.append(
                {
                    "time_utc": time.isoformat(),
                    "moon_from_earth_km": (DISPLAY @ moon).tolist(),
                    "sun_from_earth_km": (DISPLAY @ sun).tolist(),
                    "moon_orientation": display_quaternion(moon_rotation),
                    "earth_orientation": display_quaternion(earth_rotation),
                }
            )
    return {
        "samples": samples,
        "provenance": {
            "source": "JPL DE440 / NAIF",
            "frame": "J2000",
            "lunar_frame": FRAME,
            "aberration": "NONE",
            "visual_orientation_pck_sha256": pck,
            "kernels": list(kernels),
            "maximum_interpolation_hours": (end - start).total_seconds() / (count - 1) / 3600,
            "limits": "Interpolated geometric context, not event prediction. Body sizes and distances are rescaled; Earth orientation is the approximate IAU_EARTH model. Search uses terrain horizons and apparent light-time corrections separately.",
        },
    }


@router.post("/ephemeris")
def get_scene(request: SceneRequest):
    start, end = request.time_range.start_utc, request.time_range.end_utc
    if start.tzinfo is None or end.tzinfo is None:
        raise HTTPException(422, "Scene dates require UTC offsets.")
    start, end = start.astimezone(UTC), end.astimezone(UTC)
    if not VALID_START <= start < end <= VALID_END or end - start > timedelta(days=31):
        raise HTTPException(422, "Choose up to 31 days within 2025–2035.")
    try:
        return scene_ephemeris(start, end)
    except (OSError, ValueError, SpiceyError) as exc:
        raise HTTPException(
            503, "Scene ephemerides unavailable. The Moon and location controls remain usable."
        ) from exc


@router.get("/landmarks")
def landmarks():
    index = hemisphere_landmarks()
    names = {
        "Tycho",
        "Tsiolkovskiy",
        "Shackleton",
        "Schrödinger",
        "Von Kármán",
        "Leibnitz",
        "Malapert",
        "Haworth",
        "Cabeus",
        "Amundsen",
        "Nobile",
        "de Gerlache",
        "Faustini",
        "Mare Ingenii",
        "Clavius",
    }
    return {
        "features": [feature for feature in index["features"] if feature["name"] in names],
        "source": index["source"],
    }
