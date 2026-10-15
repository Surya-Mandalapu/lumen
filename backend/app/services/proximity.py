"""Distances to prepared PSR pixels and approved named-feature center points."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np


def feature_catalog(root: Path) -> dict:
    path = root / "features.json"
    if not path.exists():
        return {"features": []}
    catalog = json.loads(path.read_text(encoding="utf-8"))
    catalog["features"] = [row for row in catalog["features"] if row.get("approved") is True]
    return catalog


def great_circle_km(lat, lon, target_lat: float, target_lon: float) -> np.ndarray:
    lat, lon = np.deg2rad(lat), np.deg2rad(lon)
    tlat, tlon = np.deg2rad([target_lat, target_lon])
    hav = np.sin((lat - tlat) / 2) ** 2 + np.cos(lat) * np.cos(tlat) * np.sin((lon - tlon) / 2) ** 2
    return 3474.8 * np.arcsin(np.sqrt(np.clip(hav, 0, 1)))


def with_proximity(arrays: dict, feature_ids: list[str], root: Path) -> dict:
    if not feature_ids:
        return arrays
    selected = [f for f in feature_catalog(root)["features"] if f["id"] in feature_ids]
    if not selected:
        return arrays
    distance = np.minimum.reduce(
        [
            great_circle_km(
                arrays["lat_deg"], arrays["lon_deg"], row["latitude_deg"], row["longitude_deg_east"]
            )
            for row in selected
        ]
    )
    return {**arrays, "distance_science_feature_km": distance}


def science_utility(psr_distance: float | None, feature_distance: float | None) -> float | None:
    psr = float(np.clip(1 - psr_distance / 10, 0, 1)) if psr_distance is not None else None
    feature = (
        float(np.clip(1 - feature_distance / 50, 0, 1)) if feature_distance is not None else None
    )
    if psr is not None and feature is not None:
        return 0.6 * psr + 0.4 * feature
    return psr if psr is not None else feature
