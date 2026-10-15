from __future__ import annotations

import hashlib
import json
from functools import lru_cache
from pathlib import Path

import numpy as np


class DataUnavailable(ValueError):
    pass


@lru_cache(maxsize=4)
def load_dataset(root: Path, modified_ns: tuple) -> tuple[dict, dict]:
    del modified_ns  # Cache key refreshes after data preparation.
    try:
        metadata = json.loads((root / "metadata.json").read_text())
        if (
            metadata["coordinate_frame"] != "MOON_ME_DE440_ME421"
            or metadata["reference_radius_m"] != 1737400
        ):
            raise ValueError("Unsupported coordinate frame or lunar reference radius")
        for name in metadata["artifacts"]:
            if not (root / name).resolve().is_relative_to(root.resolve()):
                raise ValueError("Artifact path must remain inside the dataset bundle")
            expected = metadata["artifacts"][name]["sha256"]
            if hashlib.sha256((root / name).read_bytes()).hexdigest() != expected:
                raise ValueError(f"Artifact checksum mismatch: {name}")
        with np.load(root / "terrain.npz", allow_pickle=False) as archive:
            arrays = {key: archive[key].copy() for key in archive.files}
        required = (
            "lat_deg",
            "lon_deg",
            "x_m",
            "y_m",
            "elevation_m",
            "slope_deg",
            "roughness_m",
            "horizons_deg",
        )
        n = len(arrays["lat_deg"])
        if n == 0 or any(len(arrays[k]) != n for k in required):
            raise ValueError("Inconsistent or empty candidate table")
        if arrays["horizons_deg"].ndim != 2:
            raise ValueError("Invalid horizon table")
        if "distance_psr_km" in arrays and (
            len(arrays["distance_psr_km"]) != n
            or not np.isfinite(arrays["distance_psr_km"]).all()
            or (arrays["distance_psr_km"] < 0).any()
        ):
            raise ValueError("Invalid or unknown PSR distance table")
        valid = np.ones(n, dtype=bool)
        for key in required:
            values = arrays[key]
            valid &= np.isfinite(values).all(axis=1) if values.ndim > 1 else np.isfinite(values)
        for key, values in arrays.items():
            if len(values) == n:
                arrays[key] = values[valid]
        arrays.setdefault("ids", np.array([f"site-{i:05d}" for i in np.where(valid)[0]]))
        return metadata, arrays
    except (OSError, ValueError, KeyError) as exc:
        raise DataUnavailable(f"Terrain bundle is not prepared or is invalid: {exc}") from exc


def dataset(root: Path) -> tuple[dict, dict]:
    try:
        metadata = json.loads((root / "metadata.json").read_text())
        names = sorted({"metadata.json", "terrain.npz", "terrain.json", *metadata["artifacts"]})
        stamp = tuple((root / name).stat().st_mtime_ns for name in names)
    except (OSError, KeyError, ValueError) as exc:
        raise DataUnavailable("Prepare the NASA terrain bundle before searching.") from exc
    return load_dataset(root, stamp)
