"""Optional exact per-tile temporal caches, verified before they can be used."""

from __future__ import annotations

import hashlib
import inspect
import json
from pathlib import Path

import numpy as np

from app.services import ephemeris
from app.services.search import (
    METRIC_KEYS,
    TEMPORAL_CACHE_VERSION,
    _longest_runs,
    analyze,
    analyze_batch,
)
from app.services.terrain_store import digest


def cache_identity(metadata: dict, kernel_root: Path, start, end, reference_id: str) -> dict:
    algorithm = "\n".join(inspect.getsource(fn) for fn in (analyze, analyze_batch, _longest_runs))
    return {
        "schema_version": 1,
        "algorithm_version": TEMPORAL_CACHE_VERSION,
        "algorithm_sha256": hashlib.sha256(algorithm.encode()).hexdigest(),
        "ephemeris_sha256": digest(Path(ephemeris.__file__)),
        "dataset_version": metadata["dataset_version"],
        "artifacts": metadata["artifacts"],
        "scoring_reference_id": reference_id,
        "kernels": {item["file"]: item["sha256"] for item in ephemeris.load_kernels(kernel_root)},
        "start_utc": start.isoformat(),
        "end_utc": end.isoformat(),
        "step_minutes": 5,
    }


def identity_key(identity: dict) -> str:
    return hashlib.sha256(
        json.dumps(identity, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def load_tile_metrics(
    directory: Path, tile_id: str, expected_identity: dict, expected_ids: np.ndarray
) -> dict | None:
    """Return None for absent, stale or damaged optional caches; caller computes directly."""
    try:
        manifest = json.loads((directory / f"{tile_id}.json").read_text())
        if manifest["identity"] != expected_identity or manifest["key"] != identity_key(
            expected_identity
        ):
            return None
        path = directory / f"{tile_id}.npz"
        if path.stat().st_size != manifest["bytes"] or digest(path) != manifest["sha256"]:
            return None
        with np.load(path, allow_pickle=False) as archive:
            if str(archive["key"]) != manifest["key"] or not np.array_equal(
                archive["ids"], expected_ids
            ):
                return None
            columns = {key: archive[key] for key in METRIC_KEYS}
        if any(
            values.shape != (len(expected_ids),) or not np.isfinite(values).all()
            for values in columns.values()
        ):
            return None
        return columns
    except (OSError, ValueError, KeyError, TypeError):
        return None
