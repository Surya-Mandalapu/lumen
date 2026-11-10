"""Pinned apparent lunar ephemerides. No fallback or synthetic trajectories."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta
from functools import lru_cache
from pathlib import Path
from threading import RLock

import numpy as np
import spiceypy as spice

FRAME = "MOON_ME_DE440_ME421"
RADIUS_M = 1_737_400.0
SUN_RADIUS_KM = 695_700.0
LOCK = RLock()  # CSPICE's process-wide kernel pool is not thread safe.
KERNEL_FILES = ("naif0012.tls", "de440s.bsp", "moon_pa_de440_200625.bpc", "moon_de440_250416.tf")


@lru_cache(maxsize=4)
def load_kernels(root: Path) -> tuple[dict, ...]:
    manifest = json.loads((root / "manifest.json").read_text())
    by_name = {item["file"]: item for item in manifest}
    with LOCK:
        for name in KERNEL_FILES:
            path = root / name
            if hashlib.sha256(path.read_bytes()).hexdigest() != by_name[name]["sha256"]:
                raise ValueError(f"Kernel checksum mismatch: {name}")
            spice.furnsh(str(path))
        # Fail immediately if orientation or ephemeris coverage is unavailable.
        et = spice.str2et("2028-10-01T00:00:00")
        spice.spkpos("SUN", et, FRAME, "NONE", "MOON")
    return tuple(by_name[name] for name in KERNEL_FILES)


def time_grid(start: datetime, end: datetime, minutes: float) -> list[datetime]:
    seconds = (end - start).total_seconds()
    step_seconds = round(minutes * 60)
    if step_seconds < 1:
        raise ValueError("Time step must be at least one second.")
    times = [start] + [
        start + timedelta(seconds=i) for i in range(step_seconds, int(seconds), step_seconds)
    ]
    if not times or times[-1] != end:
        times.append(end)
    return times


@lru_cache(maxsize=12)
def body_positions(root: Path, start: datetime, end: datetime, minutes: float):
    times = time_grid(start, end, minutes)
    sun, earth = positions_at_times(root, times)
    return times, sun, earth


def positions_at_times(root: Path, times: list[datetime]):
    load_kernels(root)
    with LOCK:
        ets = np.array([spice.str2et(t.strftime("%Y-%m-%dT%H:%M:%S.%f")) for t in times])
        sun, _ = spice.spkpos("SUN", ets, FRAME, "CN+S", "MOON")
        earth, _ = spice.spkpos("EARTH", ets, FRAME, "XCN+S", "MOON")
    return np.asarray(sun), np.asarray(earth)


def local_sky(lat_deg: float, lon_deg: float, elevation_m: float, body_km: np.ndarray):
    lat, lon = np.deg2rad([lat_deg, lon_deg])
    up = np.array([np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)])
    east = np.array([-np.sin(lon), np.cos(lon), 0])
    north = np.cross(up, east)
    vectors = body_km - up * ((RADIUS_M + elevation_m + 2) / 1000)
    distance = np.linalg.norm(vectors, axis=1)
    azimuth = np.rad2deg(np.arctan2(vectors @ east, vectors @ north)) % 360
    altitude = np.rad2deg(np.arcsin(np.clip(vectors @ up / distance, -1, 1)))
    return azimuth, altitude, distance


def horizon_at(profile: np.ndarray, azimuth_deg: np.ndarray) -> np.ndarray:
    """Conservative adjacent-bin maximum, periodic across north."""
    bins = (azimuth_deg % 360) * len(profile) / 360
    lo = np.floor(bins).astype(int) % len(profile)
    return np.maximum(profile[lo], profile[(lo + 1) % len(profile)])


def blocker_coordinates(lat_deg: float, lon_deg: float, azimuth_deg: float, distance_m: float):
    """Approximate destination on reference sphere from sampled bearing/range."""
    lat, lon, bearing = np.deg2rad([lat_deg, lon_deg, azimuth_deg])
    angle = distance_m / RADIUS_M
    destlat = np.arcsin(np.sin(lat) * np.cos(angle) + np.cos(lat) * np.sin(angle) * np.cos(bearing))
    destlon = lon + np.arctan2(
        np.sin(bearing) * np.sin(angle) * np.cos(lat), np.cos(angle) - np.sin(lat) * np.sin(destlat)
    )
    return float(np.rad2deg(destlat)), float((np.rad2deg(destlon) + 180) % 360 - 180)


def solar_disk_fraction(center_clearance_deg: np.ndarray, radius_deg: np.ndarray):
    """Area fraction above a locally horizontal skyline; not an irradiance model."""
    x = np.clip(center_clearance_deg / radius_deg, -1, 1)
    return (np.arccos(-x) + x * np.sqrt(np.maximum(0, 1 - x * x))) / np.pi


def visibility_metrics(
    visible: np.ndarray, interval_hours: np.ndarray
) -> tuple[float, float, float]:
    # Left-endpoint rectangular integration; the final endpoint contributes no duration.
    states = visible[:-1]
    fraction = float(np.sum(interval_hours * states) / np.sum(interval_hours))
    longest = {True: 0.0, False: 0.0}
    duration = 0.0
    previous = None
    for state, hours in zip(states, interval_hours, strict=True):
        state = bool(state)
        duration = duration + float(hours) if state == previous else float(hours)
        longest[state] = max(longest[state], duration)
        previous = state
    return fraction, round(longest[True], 9), round(longest[False], 9)
