from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, status
from spiceypy.utils.exceptions import SpiceyError

from app.models import ScenarioRequest, SearchRequest, SearchValidationResponse
from app.services.dataset import DataUnavailable, dataset
from app.services.ephemeris import load_kernels
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
        metadata, arrays = dataset(settings.data_root)
        load_kernels(settings.kernel_root)
        manifest.update(
            status="prepared",
            dataset_version=metadata.get("dataset_version", "polar-patch-mvp-1"),
            prepared_coverage=metadata,
            prepared_candidate_count=len(arrays["lat_deg"]),
        )
        manifest["analysis"].update(
            horizon_azimuth_step_deg=5, finalist_time_step_minutes=5, coarse_time_step_minutes=5
        )
        manifest.setdefault("planned_region", manifest["supported_region"].copy())
        manifest["supported_region"].update(
            id="lola-polar-patch-20km",
            label="Prepared 20 km square polar patch",
            minimum_latitude_deg=metadata["coverage"]["latitude_min_deg"],
            maximum_latitude_deg=metadata["coverage"]["latitude_max_deg"],
            boundary_description=metadata["coverage"]["description"],
        )
        manifest["derived_artifacts"].update(
            candidate_table="prepared", horizon_profiles="prepared", terrain_meshes="prepared"
        )
        manifest["disclaimers"].append(
            "Prepared coverage is a 20 km square polar patch, not the full cap."
        )
    except (DataUnavailable, OSError, ValueError, SpiceyError) as exc:
        manifest["status"] = "not_prepared"
        manifest["preparation_error"] = str(exc)
    return manifest


@router.get("/terrain")
def terrain() -> dict:
    try:
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
