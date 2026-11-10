"""Read-only planning coverage derived from verified candidate data, never display meshes."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from functools import lru_cache

import numpy as np
from fastapi import APIRouter, HTTPException

from app.models import Coordinate, RegionSelection, SearchRequest, SelectorType, TimeRange
from app.services.dataset import dataset
from app.services.proximity import feature_catalog
from app.services.search import region_mask
from app.settings import settings

router = APIRouter(prefix="/api/v1/coverage")
RADIUS = 1_737_400.0


@lru_cache(maxsize=2)
def catalog_for(root, fingerprint: str):
    del fingerprint
    metadata, arrays = dataset(root)
    coverage = metadata["coverage"]
    spacing = float(metadata["candidate_spacing_m"])
    extent = coverage["extent_m"]
    kind = coverage["type"]
    if kind not in ("projected_square", "polar_cap", "polar_cap_tile"):
        raise ValueError("No supported scientific coverage geometry is declared")
    radius = 2 * RADIUS * np.tan(np.deg2rad(3) / 2)
    geometry = {
        "type": "cap"
        if kind == "polar_cap"
        else "cap_tile"
        if kind == "polar_cap_tile"
        else "rectangle",
        "extent_m": extent,
        "radius_m": float(radius),
    }
    # Missing grid locations are scientific exclusions, not holes inferred from a display mesh.
    x, y = np.meshgrid(
        np.arange(extent[0], extent[2] + 0.1, spacing),
        np.arange(extent[1], extent[3] + 0.1, spacing),
    )
    expected = np.ones(x.shape, dtype=bool)
    if kind in ("polar_cap", "polar_cap_tile"):
        expected &= np.hypot(x, y) <= radius
    if kind == "polar_cap_tile":
        expected &= (x < extent[2]) & (y < extent[3])
    present = set(zip(arrays["x_m"].tolist(), arrays["y_m"].tolist(), strict=True))
    excluded = [
        {
            "x_m": float(a),
            "y_m": float(b),
            "reason": "Exact pole excluded" if a == 0 and b == 0 else "Scientific data unavailable",
            "radius_m": 0 if a == 0 and b == 0 else spacing / np.sqrt(2),
        }
        for a, b in zip(x[expected], y[expected], strict=True)
        if (a, b) not in present
    ]
    return {
        "dataset_version": metadata["dataset_version"],
        "verified": True,
        "label": coverage["description"],
        "geometry": geometry,
        "excluded_locations": excluded,
        "candidate_count": len(arrays["lat_deg"]),
        "candidate_spacing_m": spacing,
        "layers": {
            "psr_distance": "distance_psr_km" in arrays,
            "approved_features": (root / "features.json").exists(),
        },
        "public_limits": {
            "maximum_radius_km": 5,
            "maximum_live_days": 7,
            "full_region_start_utc": "2028-10-01T00:00:00Z",
            "full_region_end_utc": "2028-10-31T00:00:00Z",
        },
        "search_service": {"mode": "synchronous"},
    }


def catalog():
    metadata, _ = dataset(settings.data_root)
    return catalog_for(settings.data_root, json.dumps(metadata, sort_keys=True))


@router.get("")
def get_catalog():
    try:
        return catalog()
    except (OSError, ValueError, KeyError) as exc:
        raise HTTPException(
            503, "Verified coverage is unavailable. Retry when the service is ready."
        ) from exc


@router.post("/preview")
def preview(region: RegionSelection):
    try:
        coverage = catalog()
        _, arrays = dataset(settings.data_root)
        if region.selector_type == SelectorType.feature_radius:
            feature = next(
                (
                    f
                    for f in feature_catalog(settings.data_root)["features"]
                    if f["id"] == region.resolved_feature_id
                ),
                None,
            )
            if feature is None:
                raise HTTPException(422, "Choose an available approved landmark.")
            region.center = Coordinate(
                latitude_deg=feature["latitude_deg"],
                longitude_deg_east=feature["longitude_deg_east"],
            )
            region.input_text = feature["name"]
        if region.selector_type == SelectorType.polygon:
            raise HTTPException(422, "Use a circle or the prepared region.")
        request = SearchRequest(
            region=region,
            time_range=TimeRange(
                start_utc=datetime(2028, 10, 1, tzinfo=UTC),
                end_utc=datetime(2028, 10, 2, tzinfo=UTC),
            ),
        )
        count = int(region_mask(request, arrays).sum())
        if region.center and region.center.latitude_deg > -87:
            count = 0
        status = "inside"
        if not count:
            status = "outside"
        elif region.selector_type != SelectorType.full_supported_region:
            center = region.center
            lat, lon = np.deg2rad([center.latitude_deg, center.longitude_deg_east])
            rho = 2 * RADIUS * np.tan(np.pi / 4 + lat / 2)
            cx, cy = rho * np.sin(lon), rho * np.cos(lon)
            radius = region.search_radius_km * 1000
            geometry = coverage["geometry"]
            if geometry["type"] in ("cap", "cap_tile"):
                angular_radius = np.rad2deg(radius / RADIUS)
                if center.latitude_deg + angular_radius > -87:
                    status = "partial"
            if geometry["type"] != "cap":
                # Conservative projection envelope, including polar scale distortion.
                radius *= 1.001
                left, bottom, right, top = geometry["extent_m"]
                if (
                    cx - radius < left
                    or cx + radius > right
                    or cy - radius < bottom
                    or cy + radius > top
                ):
                    status = "partial"
            if any(
                np.hypot(cx - hole["x_m"], cy - hole["y_m"]) <= radius + hole["radius_m"]
                for hole in coverage["excluded_locations"]
            ):
                status = "partial"
        return {
            "status": status,
            "candidate_count": count,
            "region": region.model_dump(mode="json"),
            "dataset_version": coverage["dataset_version"],
            "message": {
                "inside": "Prepared candidate locations are available in this area.",
                "partial": "Only the supported intersection will be analyzed; excluded locations have no results.",
                "outside": "Choose a center within 87–90°S that overlaps prepared candidate locations.",
            }[status],
        }
    except HTTPException:
        raise
    except (OSError, ValueError, KeyError) as exc:
        raise HTTPException(503, "Scientific coverage cannot be verified. Please retry.") from exc
