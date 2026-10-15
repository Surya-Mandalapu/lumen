from __future__ import annotations

import hashlib
import json
from datetime import UTC
from itertools import pairwise

import numpy as np

from app.models import SearchRequest, SelectorType
from app.services.dataset import dataset
from app.services.ephemeris import (
    FRAME,
    SUN_RADIUS_KM,
    blocker_coordinates,
    body_positions,
    horizon_at,
    load_kernels,
    local_sky,
    solar_disk_fraction,
    visibility_metrics,
)
from app.services.proximity import science_utility, with_proximity
from app.services.validation import SearchValidationError, validate_search
from app.settings import settings


def region_mask(request: SearchRequest, arrays: dict) -> np.ndarray:
    if request.region.selector_type == SelectorType.full_supported_region:
        return np.ones(len(arrays["lat_deg"]), dtype=bool)
    center = request.region.center
    if center is None or request.region.search_radius_km is None:
        raise SearchValidationError("This selector requires a center and radius.")
    lat, lon = np.deg2rad(arrays["lat_deg"]), np.deg2rad(arrays["lon_deg"])
    clat, clon = np.deg2rad([center.latitude_deg, center.longitude_deg_east])
    hav = np.sin((lat - clat) / 2) ** 2 + np.cos(lat) * np.cos(clat) * np.sin((lon - clon) / 2) ** 2
    distance = 2 * 1737.4 * np.arcsin(np.sqrt(np.clip(hav, 0, 1)))
    return distance <= request.region.search_radius_km


def terrain_mask(request: SearchRequest, arrays: dict) -> np.ndarray:
    c = request.hard_constraints
    mask = np.ones(len(arrays["lat_deg"]), dtype=bool)
    checks = [
        ("slope_deg", c.maximum_slope_deg, False),
        ("roughness_m", c.maximum_roughness_m, False),
        ("elevation_m", c.minimum_elevation_m, True),
        ("elevation_m", c.maximum_elevation_m, False),
        ("distance_psr_km", c.maximum_distance_to_psr_km, False),
        ("distance_science_feature_km", c.maximum_distance_to_science_feature_km, False),
    ]
    for key, limit, minimum in checks:
        if limit is not None:
            mask &= arrays[key] >= limit if minimum else arrays[key] <= limit
    return mask


def temporal_pass(request: SearchRequest, metrics: dict) -> bool:
    c = request.hard_constraints
    checks = [
        ("illumination_fraction", c.minimum_illumination_fraction, True),
        ("earth_visibility_fraction", c.minimum_earth_visibility_fraction, True),
        ("longest_sunlight_hours", c.minimum_continuous_sunlight_hours, True),
        ("longest_darkness_hours", c.maximum_continuous_darkness_hours, False),
        ("longest_communication_hours", c.minimum_continuous_communication_hours, True),
        ("longest_blackout_hours", c.maximum_continuous_blackout_hours, False),
    ]
    return all(
        limit is None or (metrics[key] >= limit if minimum else metrics[key] <= limit)
        for key, limit, minimum in checks
    )


def analyze(arrays: dict, i: int, times, sun, earth, *, timeline: bool = False) -> dict:
    lat, lon, height = (float(arrays[key][i]) for key in ("lat_deg", "lon_deg", "elevation_m"))
    saz, sel, sd = local_sky(lat, lon, height, sun)
    eaz, eel, _ = local_sky(lat, lon, height, earth)
    profile = arrays["horizons_deg"][i]
    sh, eh = horizon_at(profile, saz), horizon_at(profile, eaz)
    radius = np.rad2deg(np.arcsin(SUN_RADIUS_KM / sd))
    sf = solar_disk_fraction(sel - sh, radius)
    sunlight, communication = sel + radius > sh, eel > eh
    hours = np.array([(b - a).total_seconds() / 3600 for a, b in pairwise(times)])
    illumination, sunlong, darklong = visibility_metrics(sunlight, hours)
    visibility, earthlong, blackout = visibility_metrics(communication, hours)
    result = {
        "metrics": {
            "illumination_fraction": illumination,
            "earth_visibility_fraction": visibility,
            "longest_sunlight_hours": sunlong,
            "longest_darkness_hours": darklong,
            "longest_communication_hours": earthlong,
            "longest_blackout_hours": blackout,
            "mean_visible_solar_disk_fraction": float(np.sum(sf[:-1] * hours) / hours.sum()),
        }
    }
    if timeline:
        result["timeline"] = [
            {
                "time_utc": t.isoformat().replace("+00:00", "Z"),
                "sun_azimuth_deg": float(saz[j]),
                "sun_elevation_deg": float(sel[j]),
                "earth_azimuth_deg": float(eaz[j]),
                "earth_elevation_deg": float(eel[j]),
                "sun_horizon_deg": float(sh[j]),
                "earth_horizon_deg": float(eh[j]),
                "solar_fraction": float(sf[j]),
                "sun_visible": bool(sunlight[j]),
                "earth_visible": bool(communication[j]),
            }
            for j, t in enumerate(times)
        ]
        result["horizon"] = [
            {
                "azimuth_deg": float(j * 360 / len(profile)),
                "elevation_deg": float(h),
                "distance_m": float(arrays["blocker_distance_m"][i, j]),
            }
            for j, h in enumerate(profile)
        ]
        for row in result["horizon"]:
            blocker_lat, blocker_lon = blocker_coordinates(
                lat, lon, row["azimuth_deg"], row["distance_m"]
            )
            row.update(blocker_latitude_deg=blocker_lat, blocker_longitude_deg_east=blocker_lon)
    return result


def category_scores(
    metrics: dict,
    slope: float,
    roughness: float,
    elevation: float,
    duration_hours: float,
    anchors: dict,
) -> dict:
    def utility(value: float, key: str, higher: bool = False) -> float:
        low, high = anchors[key]
        if high <= low:
            return 0.5
        normalized = float(np.clip((value - low) / (high - low), 0, 1))
        return normalized if higher else 1 - normalized

    safety = (
        0.45 * utility(slope, "slope_deg")
        + 0.35 * utility(roughness, "roughness_m")
        + 0.20 * utility(elevation, "elevation_m", True)
    )
    return {
        "illumination": 0.5 * metrics["illumination_fraction"]
        + 0.25 * metrics["longest_sunlight_hours"] / duration_hours
        + 0.25 * (1 - metrics["longest_darkness_hours"] / duration_hours),
        "earth_visibility": 0.5 * metrics["earth_visibility_fraction"]
        + 0.25 * metrics["longest_communication_hours"] / duration_hours
        + 0.25 * (1 - metrics["longest_blackout_hours"] / duration_hours),
        "terrain_safety": float(safety),
        "science_proximity": None,
    }


def search(request: SearchRequest) -> dict:
    validation = validate_search(request)
    metadata, arrays = dataset(settings.data_root)
    arrays = with_proximity(
        arrays, request.hard_constraints.science_feature_ids, settings.data_root
    )
    kernels = load_kernels(settings.kernel_root)
    weights = validation.normalized_preferences.model_dump()
    science_available = "distance_psr_km" in arrays or "distance_science_feature_km" in arrays
    if not science_available:
        weights["science_proximity"] = 0
    total = sum(weights.values())
    if total == 0:
        weights.update(illumination=0.4, earth_visibility=0.4, terrain_safety=0.2)
        total = 1
    weights = {k: v / total for k, v in weights.items()}
    warnings = validation.warnings + [
        "Coverage is limited to the prepared 20 km polar patch; full-region means this patch.",
        "Visibility uses 5-minute samples; transition and longest-interval uncertainty is at least one sample.",
        "A solar upper-limb sighting counts as sunlight; disk fraction is geometric, not usable power.",
        "Earth visibility is geometric Earth-center line of sight, not a communications link budget.",
        "Blocker coordinates approximate sampled ray bearings and ranges on the reference sphere; they are not surveyed ridge locations.",
    ]
    if request.preferences.science_proximity > 0 and not science_available:
        warnings.append(
            "Science/PSR proximity is unavailable; its preference weight is redistributed."
        )
    if "distance_psr_km" in arrays:
        warnings.append(
            "PSR proximity is distance to modeled permanent-shadow pixel areas, not evidence of ice, resources, or traversability."
        )
    if request.hard_constraints.science_feature_ids:
        warnings.append(
            "Named-feature distance is to the nearest selected approved center point, not a crater rim or a surface route."
        )
    start, end = (
        t.astimezone(UTC) for t in (request.time_range.start_utc, request.time_range.end_utc)
    )
    anchors = {
        key: [float(v) for v in np.percentile(arrays[key], [5, 95])]
        for key in ("slope_deg", "roughness_m", "elevation_m")
    }
    duration_hours = (end - start).total_seconds() / 3600
    mask = region_mask(request, arrays)
    terrain = mask & terrain_mask(request, arrays)
    indices = np.flatnonzero(terrain)
    times, sun, earth = body_positions(settings.kernel_root, start, end, 5)
    ranked = []
    for i in indices:
        metrics = analyze(arrays, i, times, sun, earth)["metrics"]
        if not temporal_pass(request, metrics):
            continue
        scores = category_scores(
            metrics,
            float(arrays["slope_deg"][i]),
            float(arrays["roughness_m"][i]),
            float(arrays["elevation_m"][i]),
            duration_hours,
            anchors,
        )
        scores["science_proximity"] = science_utility(
            float(arrays["distance_psr_km"][i]) if "distance_psr_km" in arrays else None,
            float(arrays["distance_science_feature_km"][i])
            if "distance_science_feature_km" in arrays
            else None,
        )
        score = 100 * sum(weights[k] * (v or 0) for k, v in scores.items())
        ranked.append((score, str(arrays["ids"][i]), int(i), scores, metrics))
    ranked.sort(key=lambda item: (-item[0], item[1]))
    selected = []
    for row in ranked:
        i = row[2]
        if all(
            np.hypot(arrays["x_m"][i] - arrays["x_m"][r[2]], arrays["y_m"][i] - arrays["y_m"][r[2]])
            >= 1500
            for r in selected
        ):
            selected.append(row)
        if len(selected) == 5:
            break
    candidates = []
    for rank, (score, site_id, i, scores, metrics) in enumerate(selected, 1):
        detail = analyze(arrays, i, times, sun, earth, timeline=True)
        candidates.append(
            {
                "id": site_id,
                "rank": rank,
                "score": score,
                "latitude_deg": float(arrays["lat_deg"][i]),
                "longitude_deg_east": float(arrays["lon_deg"][i]),
                **{
                    key: float(arrays[key][i])
                    for key in ("x_m", "y_m", "elevation_m", "slope_deg", "roughness_m")
                },
                "criteria_scores": scores,
                **{
                    key: float(arrays[key][i])
                    for key in ("distance_psr_km", "distance_science_feature_km")
                    if key in arrays
                },
                **detail,
            }
        )
    request_json = request.model_dump(mode="json")
    provenance = {
        "engine_version": "exploration-1.1.0",
        "terrain": metadata,
        "kernels": list(kernels),
        "calculation_frame": FRAME,
        "aberration_correction": {"sun": "CN+S", "earth": "XCN+S"},
        "parallax": "Site position subtracted from apparent Moon-center vectors; lunar-surface observer velocity is not modeled.",
        "observer_height_m": 2,
        "horizon_interpolation": "maximum of adjacent azimuth bins",
        "shortlist_minimum_separation_m": 1500,
        "score_anchors": {
            "method": "full prepared dataset 5th/95th percentiles, clipped linear utility",
            "bounds": anchors,
            "terrain_weights": {"slope": 0.45, "roughness": 0.35, "elevation": 0.20},
            "elevation_preference": "higher elevation",
            "temporal_weights": {
                "fraction": 0.5,
                "longest_visible_fraction": 0.25,
                "inverse_longest_blocked_fraction": 0.25,
            },
            "science_proximity": {
                "psr_zero_utility_km": 10,
                "feature_zero_utility_km": 50,
                "weights_when_both": {"psr": 0.6, "selected_features": 0.4},
                "feature_distance_definition": "nearest selected approved feature center; not crater edge or travel distance",
            },
        },
        "time_integration": "left sample, duration weighted, mission-end clipped",
    }
    digest = hashlib.sha256(
        json.dumps({"request": request_json, "provenance": provenance}, sort_keys=True).encode()
    ).hexdigest()[:20]
    result = {
        "search_id": digest,
        "status": "complete" if candidates else "empty",
        "request": request_json,
        "candidates": candidates,
        "map_candidates": [
            {
                "id": site_id,
                "x_m": float(arrays["x_m"][i]),
                "y_m": float(arrays["y_m"][i]),
                "latitude_deg": float(arrays["lat_deg"][i]),
                "longitude_deg_east": float(arrays["lon_deg"][i]),
                "score": score,
                "illumination_fraction": metrics["illumination_fraction"],
                "earth_visibility_fraction": metrics["earth_visibility_fraction"],
                "slope_deg": float(arrays["slope_deg"][i]),
                "criteria_scores": scores,
                **{
                    key: float(arrays[key][i])
                    for key in ("distance_psr_km", "distance_science_feature_km")
                    if key in arrays
                },
            }
            for score, site_id, i, scores, metrics in ranked
        ],
        "rejections": {
            "outside_region": int((~mask).sum()),
            "terrain_or_proximity": int(mask.sum()) - len(indices),
            "temporal": len(indices) - len(ranked),
        },
        "counts": {
            "total": len(arrays["lat_deg"]),
            "region": int(mask.sum()),
            "terrain_pass": len(indices),
            "temporal_pass": len(ranked),
            "shortlisted": len(candidates),
        },
        "normalized_preferences": weights,
        "assumptions": validation.assumptions,
        "warnings": warnings,
        "provenance": provenance,
        "common_window": {
            "start_utc": start.isoformat(),
            "end_utc": end.isoformat(),
            "step_minutes": 5,
        },
    }
    if not candidates:
        result["empty_reason"] = (
            "No prepared candidates intersect the selected region."
            if not mask.any()
            else "No candidates satisfy all hard constraints in this mission window."
        )
    return result
