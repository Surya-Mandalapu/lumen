"""Release-level utility anchors shared by search and fixed-site inspection."""

import json
from pathlib import Path

import numpy as np

from app.services.dataset import DataUnavailable


def scoring_reference(metadata: dict, arrays: dict) -> dict:
    reference = metadata.get("scoring_reference")
    if reference is None and metadata["dataset_version"] == "pgda-demo-v1.1":
        reference = json.loads(
            (Path(__file__).parents[1] / "data/legacy-scoring-reference.json").read_text()
        )
    if reference is None:
        # Compatibility for the original patch and test fixtures; never for cap subsets.
        if metadata["dataset_version"].startswith("lunar-south-cap"):
            raise DataUnavailable("Cap scoring reference has not been frozen")
        reference = {
            "id": f"{metadata['dataset_version']}-terrain-p05-p95-v1",
            "method": "full prepared dataset 5th/95th percentiles, clipped linear utility",
            "bounds": {
                key: np.percentile(arrays[key], [5, 95]).tolist()
                for key in ("slope_deg", "roughness_m", "elevation_m")
            },
        }
    for key in ("slope_deg", "roughness_m", "elevation_m"):
        bounds = reference["bounds"][key]
        if len(bounds) != 2 or not np.isfinite(bounds).all() or bounds[0] > bounds[1]:
            raise DataUnavailable("Invalid release scoring reference")
    return reference
