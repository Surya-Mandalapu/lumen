from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, status

from app.models import SearchRequest, SearchValidationResponse
from app.services.validation import SearchValidationError, validate_search
from app.settings import settings

router = APIRouter(prefix="/api/v1")


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "stealth-lumen-api"}


@router.get("/region")
def region() -> dict:
    return json.loads(settings.dataset_manifest_path.read_text(encoding="utf-8"))


@router.post("/search/validate", response_model=SearchValidationResponse)
def search_validate(request: SearchRequest) -> SearchValidationResponse:
    try:
        return validate_search(request)
    except SearchValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc


@router.post("/candidates/search")
def candidate_search(_: SearchRequest) -> dict:
    manifest = region()
    if manifest["status"] != "prepared":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "scientific_data_not_prepared",
                "message": "Prepare and verify the LOLA-derived regional bundle before ranking sites.",
                "dataset_version": manifest["dataset_version"],
            },
        )
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail={"code": "ranking_engine_not_implemented"},
    )

