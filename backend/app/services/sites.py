"""Inspect fixed prepared locations and perturb their inputs without re-ranking."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from itertools import pairwise

import numpy as np

from app.models import ScenarioRequest, SearchRequest
from app.services.dataset import dataset
from app.services.ephemeris import (
    FRAME,
    SUN_RADIUS_KM,
    blocker_coordinates,
    body_positions,
    horizon_at,
    load_kernels,
    local_sky,
    positions_at_times,
)
from app.services.proximity import science_utility, with_proximity
from app.services.search import analyze, category_scores, region_mask, temporal_pass, terrain_mask
from app.services.validation import normalize_preferences, validate_search
from app.settings import settings


class SiteNotFound(ValueError):
    pass


def site_index(arrays: dict, site_id: str) -> int:
    matches = np.flatnonzero(arrays["ids"] == site_id)
    if not len(matches):
        raise SiteNotFound("The site is not in the prepared candidate bundle.")
    return int(matches[0])


def site_summary(arrays: dict, index: int) -> dict:
    result = {
        "id": str(arrays["ids"][index]),
        "latitude_deg": float(arrays["lat_deg"][index]),
        "longitude_deg_east": float(arrays["lon_deg"][index]),
    }
    result.update(
        {
            key: float(arrays[key][index])
            for key in ("x_m", "y_m", "elevation_m", "slope_deg", "roughness_m")
        }
    )
    if "distance_psr_km" in arrays:
        result["distance_psr_km"] = float(arrays["distance_psr_km"][index])
    if "distance_science_feature_km" in arrays:
        result["distance_science_feature_km"] = float(arrays["distance_science_feature_km"][index])
    return result


def constraint_status(request: SearchRequest, arrays: dict, index: int, metrics: dict) -> dict:
    region_pass = bool(region_mask(request, arrays)[index])
    terrain_pass = bool(terrain_mask(request, arrays)[index])
    time_pass = temporal_pass(request, metrics)
    return {
        "passes": region_pass and terrain_pass and time_pass,
        "region_pass": region_pass,
        "terrain_pass": terrain_pass,
        "temporal_pass": time_pass,
    }


def visible_at(arrays: dict, index: int, instant: datetime, body: str) -> bool:
    sun, earth = positions_at_times(settings.kernel_root, [instant])
    lat, lon, height = (float(arrays[key][index]) for key in ("lat_deg", "lon_deg", "elevation_m"))
    az, el, distance = local_sky(lat, lon, height, sun if body == "sun" else earth)
    clearance = el - horizon_at(arrays["horizons_deg"][index], az)
    if body == "sun":
        clearance += np.rad2deg(np.arcsin(SUN_RADIUS_KM / distance))
    return bool(clearance[0] > 0)


def refined_intervals(arrays: dict, index: int, timeline: list[dict]) -> tuple[dict, dict]:
    intervals, transitions = {}, []
    for body, state_key in (("sun", "sun_visible"), ("earth", "earth_visible")):
        start = datetime.fromisoformat(timeline[0]["time_utc"])
        state = timeline[0][state_key]
        output = []
        for before, after in pairwise(timeline):
            if before[state_key] == after[state_key]:
                continue
            low, high = (datetime.fromisoformat(row["time_utc"]) for row in (before, after))
            while (high - low).total_seconds() > 60:
                mid = low + (high - low) / 2
                if visible_at(arrays, index, mid, body) == before[state_key]:
                    low = mid
                else:
                    high = mid
            transition = low + (high - low) / 2
            output.append(
                {
                    "start_utc": start.isoformat(),
                    "end_utc": transition.isoformat(),
                    "duration_hours": (transition - start).total_seconds() / 3600,
                    "visible": state,
                }
            )
            transitions.append(
                {
                    "body": body,
                    "time_utc": transition.isoformat(),
                    "visible_after": after[state_key],
                    "bracket_seconds": (high - low).total_seconds(),
                }
            )
            start, state = transition, after[state_key]
        end = datetime.fromisoformat(timeline[-1]["time_utc"])
        if end > start:
            output.append(
                {
                    "start_utc": start.isoformat(),
                    "end_utc": end.isoformat(),
                    "duration_hours": (end - start).total_seconds() / 3600,
                    "visible": state,
                }
            )
        intervals[body] = output
    transitions.sort(key=lambda item: item["time_utc"])
    return intervals, {
        "tolerance_seconds": 60,
        "transition_count": len(transitions),
        "transitions": transitions,
        "limitations": [
            "Only state changes bracketed by adjacent five-minute samples are refined; shorter events can be missed.",
            "Refinement holds the sampled five-degree terrain horizon fixed and does not improve terrain accuracy.",
            "Metrics and constraint status retain the five-minute sampled integration; intervals are separately refined.",
        ],
    }


def provenance(metadata: dict) -> dict:
    return {
        "engine_version": "exploration-1.1.0",
        "dataset_version": metadata["dataset_version"],
        "terrain_artifacts": metadata["artifacts"],
        "terrain": metadata,
        "kernels": list(load_kernels(settings.kernel_root)),
        "calculation_frame": FRAME,
        "observer_height_m": 2,
        "aberration_correction": {"sun": "CN+S", "earth": "XCN+S"},
        "horizon_interpolation": "maximum of adjacent azimuth bins",
        "parallax": "Site position subtracted from apparent Moon-center vectors; lunar-surface observer velocity is not modeled.",
    }


def site_analysis(site_id: str, request: SearchRequest) -> dict:
    validate_search(request)
    metadata, arrays = dataset(settings.data_root)
    arrays = with_proximity(
        arrays, request.hard_constraints.science_feature_ids, settings.data_root
    )
    index = site_index(arrays, site_id)
    start, end = (
        value.astimezone(UTC)
        for value in (request.time_range.start_utc, request.time_range.end_utc)
    )
    times, sun, earth = body_positions(settings.kernel_root, start, end, 5)
    detail = analyze(arrays, index, times, sun, earth, timeline=True)
    for row in detail["horizon"]:
        lat, lon = blocker_coordinates(
            float(arrays["lat_deg"][index]),
            float(arrays["lon_deg"][index]),
            row["azimuth_deg"],
            row["distance_m"],
        )
        row.update(blocker_latitude_deg=lat, blocker_longitude_deg_east=lon)
    intervals, refinement = refined_intervals(arrays, index, detail["timeline"])
    anchors = {
        key: np.percentile(arrays[key], [5, 95])
        for key in ("slope_deg", "roughness_m", "elevation_m")
    }
    scores = category_scores(
        detail["metrics"],
        float(arrays["slope_deg"][index]),
        float(arrays["roughness_m"][index]),
        float(arrays["elevation_m"][index]),
        (end - start).total_seconds() / 3600,
        anchors,
    )
    scores["science_proximity"] = science_utility(
        float(arrays["distance_psr_km"][index]) if "distance_psr_km" in arrays else None,
        float(arrays["distance_science_feature_km"][index])
        if "distance_science_feature_km" in arrays
        else None,
    )
    weights = normalize_preferences(request.preferences)[0].model_dump()
    if scores["science_proximity"] is None:
        weights["science_proximity"] = 0
    if not sum(weights.values()):
        weights.update(illumination=0.4, earth_visibility=0.4, terrain_safety=0.2)
    total = sum(weights.values())
    weights = {key: value / total for key, value in weights.items()}
    return {
        "site": site_summary(arrays, index),
        "score": 100 * sum(weights[key] * (value or 0) for key, value in scores.items()),
        "criteria_scores": scores,
        "normalized_preferences": weights,
        **detail,
        "intervals": intervals,
        "constraint_status": constraint_status(request, arrays, index, detail["metrics"]),
        "refinement": refinement,
        "request": request.model_dump(mode="json"),
        "provenance": provenance(metadata),
        "warnings": [
            "Blocker coordinates are approximate spherical projections of sampled ray bearing and range, not named ridge identifications.",
            "Geometric visibility does not establish usable solar power, communications availability, or landing safety.",
        ],
    }


def metric_deltas(base: dict, changed: dict) -> dict:
    return {key: changed[key] - value for key, value in base.items()}


def scenario_analysis(scenario: ScenarioRequest) -> dict:
    request = scenario.request
    validate_search(request)
    shifted = request.model_copy(deep=True)
    shifted.time_range.start_utc += timedelta(hours=scenario.delay_hours)
    shifted.time_range.end_utc += timedelta(hours=scenario.delay_hours)
    validate_search(shifted)
    metadata, arrays = dataset(settings.data_root)
    arrays = with_proximity(
        arrays, request.hard_constraints.science_feature_ids, settings.data_root
    )
    index = site_index(arrays, scenario.site_id)

    def evaluation(i: int, mission: SearchRequest, step: float = 5) -> dict:
        start, end = (
            value.astimezone(UTC)
            for value in (mission.time_range.start_utc, mission.time_range.end_utc)
        )
        times, sun, earth = body_positions(settings.kernel_root, start, end, step)
        metrics = analyze(arrays, i, times, sun, earth)["metrics"]
        return {
            "window": {
                "start_utc": start.isoformat(),
                "end_utc": end.isoformat(),
                "step_minutes": step,
            },
            "metrics": metrics,
            "constraint_status": constraint_status(mission, arrays, i, metrics),
        }

    baseline = evaluation(index, request)
    delayed = evaluation(index, shifted)
    distances = np.hypot(arrays["x_m"] - arrays["x_m"][index], arrays["y_m"] - arrays["y_m"][index])
    available = np.flatnonzero((distances > 0) & (distances <= scenario.offset_radius_m + 1e-6))
    ordered = sorted(available, key=lambda i: (float(distances[i]), str(arrays["ids"][i])))
    neighbors = []
    for i in ordered[:24]:
        evaluated = evaluation(int(i), request)
        neighbors.append(
            {
                "site": site_summary(arrays, int(i)),
                "distance_m": float(distances[i]),
                "metrics": evaluated["metrics"],
                "constraint_status": evaluated["constraint_status"],
                "metric_deltas": metric_deltas(baseline["metrics"], evaluated["metrics"]),
            }
        )
    ranges = {
        key: {
            "min": min([value] + [row["metrics"][key] for row in neighbors]),
            "max": max([value] + [row["metrics"][key] for row in neighbors]),
        }
        for key, value in baseline["metrics"].items()
    }
    sensitivity = None
    if scenario.include_sampling_sensitivity:
        fine = evaluation(index, request, 2.5)
        sensitivity = {
            "baseline_step_minutes": 5,
            "refined_step_minutes": 2.5,
            "metrics": fine["metrics"],
            "constraint_status": fine["constraint_status"],
            "metric_deltas": metric_deltas(baseline["metrics"], fine["metrics"]),
        }
    return {
        "site_id": scenario.site_id,
        "site": site_summary(arrays, index),
        "baseline": baseline,
        "shifted": delayed,
        "metric_deltas": metric_deltas(baseline["metrics"], delayed["metrics"]),
        "neighbors": neighbors,
        "neighbor_ranges": ranges,
        "neighbor_count_total": len(ordered),
        "sampling_sensitivity": sensitivity,
        "request": scenario.model_dump(mode="json"),
        "provenance": provenance(metadata),
        "warnings": [
            "The baseline site remains fixed: scenarios do not reselect or rerank locations.",
            "Off-target results sample prepared 500 m grid candidates within the radius, limited to the nearest 24; this is not a continuous landing ellipse model.",
            "Neighbor ranges include the baseline site and shown neighbors only; they are not regional uncertainty bounds.",
            "Halving the time step tests time discretization only; it does not improve DEM, skyline, or physical model accuracy.",
        ],
    }
