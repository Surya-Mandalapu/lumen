from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, status
from spiceypy.utils.exceptions import SpiceyError

from app.models import ScenarioRequest, SearchRequest, SearchValidationResponse
from app.services.dataset import DataUnavailable, dataset
from app.services.ephemeris import load_kernels
from app.services.repository import is_tiled, read_asset, release_metadata
from app.services.search import search
from app.services.sites import SiteNotFound, scenario_analysis, site_analysis
from app.services.validation import SearchValidationError, validate_search
from app.settings import settings

router = APIRouter(prefix="/api/v1")


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "lumen-api"}


@router.get("/region")
def region() -> dict:
    manifest = json.loads(settings.dataset_manifest_path.read_text(encoding="utf-8"))
    try:
        tiled = is_tiled(settings.data_root)
        if tiled:
            metadata, arrays = release_metadata(settings.data_root), {}
        else:
            metadata, arrays = dataset(settings.data_root)
        load_kernels(settings.kernel_root)
        manifest.update(
            status="prepared",
            dataset_version=metadata.get("dataset_version", "polar-patch-mvp-1"),
            prepared_coverage=metadata,
            prepared_candidate_count=metadata["candidate_count"] if tiled else len(arrays["lat_deg"]),
        )
        manifest["analysis"].update(
            horizon_azimuth_step_deg=metadata["horizon_azimuth_step_deg"],
            finalist_time_step_minutes=5,
            coarse_time_step_minutes=5,
        )
        manifest.setdefault("planned_region", manifest["supported_region"].copy())
        coverage = metadata["coverage"]
        coverage_type = coverage["type"]
        region_id = {
            "polar_cap": "lunar-south-pole-87s-cap",
            "polar_cap_tile": "lunar-south-pole-cap-tile",
        }.get(coverage_type, "lola-polar-patch-20km")
        region_label = {
            "polar_cap": "Prepared 87°S–90°S polar cap",
            "polar_cap_tile": "Prepared 20 km polar cap tile",
        }.get(coverage_type, "Prepared 20 km square polar patch")
        manifest["supported_region"].update(
            id=region_id,
            label=region_label,
            minimum_latitude_deg=coverage["latitude_min_deg"],
            maximum_latitude_deg=coverage["latitude_max_deg"],
            boundary_description=coverage["description"],
        )
        manifest["derived_artifacts"].update(
            candidate_table="prepared",
            horizon_profiles="prepared",
            terrain_meshes="prepared",
            feature_index="prepared"
            if (settings.data_root / "features.json").exists()
            else "missing",
            psr_proximity="prepared" if "distance_psr_km" in arrays else "missing",
            psr_display_mask="prepared"
            if (settings.data_root / "psr.json").exists()
            else "missing",
        )
        if coverage_type != "projected_square":
            manifest["disclaimers"] = [
                item
                for item in manifest["disclaimers"]
                if not any(
                    term in item
                    for term in (
                        "Curated 20 km square",
                        "PSR proximity uses",
                        "Mapped PSRs",
                        "Feature proximity uses",
                    )
                )
            ]
        manifest["disclaimers"].append(f"Prepared coverage: {coverage['description']}.")
    except (DataUnavailable, OSError, ValueError, SpiceyError) as exc:
        manifest["status"] = "not_prepared"
        manifest["preparation_error"] = str(exc)
    return manifest


@router.get("/terrain")
def terrain() -> dict:
    try:
        if is_tiled(settings.data_root):
            return read_asset(settings.data_root, "terrain.json")
        dataset(settings.data_root)
        return json.loads((settings.data_root / "terrain.json").read_text())
    except (DataUnavailable, OSError, ValueError) as exc:
        raise HTTPException(
            status_code=503, detail={"code": "scientific_data_not_prepared", "message": str(exc)}
        ) from exc


@router.post("/search/validate", response_model=SearchValidationResponse)
def search_validate(request: SearchRequest) -> SearchValidationResponse:
    try:
        return validate_search(request)
    except SearchValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc


@router.post("/candidates/search")
def candidate_search(request: SearchRequest) -> dict:
    try:
        return search(request)
    except SearchValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except (DataUnavailable, OSError, ValueError, SpiceyError) as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "scientific_data_not_prepared",
                "message": str(exc),
            },
        ) from exc


@router.post("/sites/{site_id}/analysis")
def inspect_site(site_id: str, request: SearchRequest) -> dict:
    try:
        return site_analysis(site_id, request)
    except SiteNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except SearchValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except (DataUnavailable, OSError, ValueError, SpiceyError) as exc:
        raise HTTPException(
            status_code=503, detail={"code": "scientific_data_not_prepared", "message": str(exc)}
        ) from exc


@router.post("/scenarios/analyze")
def inspect_scenarios(request: ScenarioRequest) -> dict:
    try:
        return scenario_analysis(request)
    except SiteNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except SearchValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except (DataUnavailable, OSError, ValueError, SpiceyError) as exc:
        raise HTTPException(
            status_code=503, detail={"code": "scientific_data_not_prepared", "message": str(exc)}
        ) from exc
