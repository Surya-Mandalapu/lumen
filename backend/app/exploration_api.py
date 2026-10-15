"""Read-only discovery of locally prepared, source-attributed exploration layers."""

import json

from fastapi import APIRouter, HTTPException

from app.services.dataset import DataUnavailable, dataset
from app.settings import settings

router = APIRouter(prefix="/api/v1")


def prepared_json(name: str) -> dict:
    try:
        dataset(settings.data_root)
        return json.loads((settings.data_root / name).read_text(encoding="utf-8"))
    except (DataUnavailable, OSError, ValueError) as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "layer_not_prepared",
                "message": "This scientific layer is not prepared.",
            },
        ) from exc


@router.get("/features")
def features() -> dict:
    return prepared_json("features.json")


@router.get("/layers/psr")
def psr_layer() -> dict:
    return prepared_json("psr.json")
