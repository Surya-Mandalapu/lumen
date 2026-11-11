"""Verified, selective access to immutable south-cap releases.

This is the data-owner interface. Request/job integration is deliberately left to
the backend owner. No raw raster or neighbouring horizon dependencies are opened.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections import OrderedDict, deque
from pathlib import Path
from threading import RLock

import numpy as np

from app.services.dataset import DataUnavailable

SCALAR_COLUMNS = (
    "ids",
    "x_m",
    "y_m",
    "lat_deg",
    "lon_deg",
    "elevation_m",
    "slope_deg",
    "roughness_m",
)
ROW_COLUMNS = (*SCALAR_COLUMNS, "horizons_deg", "blocker_distance_m")


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


def catalog_digest(catalog: dict) -> str:
    payload = {key: value for key, value in catalog.items() if key != "catalog_sha256"}
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()
    ).hexdigest()


class TerrainStore:
    """One release, with an LRU bounded by decompressed array bytes.

    Returned arrays are read-only. Caller-owned concatenated results and Python
    object overhead are separate from resident_bytes; jobs must budget those too.
    Artifact immutability is checked on each disk load, not each cache hit.
    """

    def __init__(
        self,
        root: Path,
        max_cache_bytes: int = 32 * 1024 * 1024,
        expected_catalog_sha256: str | None = None,
    ):
        self.root = root.resolve()
        if max_cache_bytes <= 0:
            raise ValueError("Cache budget must be positive")
        self.max_cache_bytes = max_cache_bytes
        self._cache: OrderedDict[str, dict] = OrderedDict()
        self._lock = RLock()
        self._resident_bytes = 0
        self._peak_bytes = 0
        self._opened: deque[str] = deque(maxlen=512)
        self._open_count = 0
        self._evictions = 0
        self._artifact_bytes_verified = 0
        self._array_bytes_loaded = 0
        self._hits = 0
        try:
            self._catalog = json.loads((self.root / "catalog.json").read_text())
            c = self._catalog
            if (
                c["schema_version"] != 1
                or c["dataset_version"] != "lunar-south-cap-v1"
                or c["catalog_sha256"] != catalog_digest(c)
                or c["coordinate_frame"] != "MOON_ME_DE440_ME421"
                or c["reference_radius_m"] != 1737400
                or not c["verification"]["complete"]
            ):
                raise ValueError("Invalid or incomplete release catalog")
            if (
                expected_catalog_sha256 is not None
                and c["catalog_sha256"] != expected_catalog_sha256
            ):
                raise ValueError("Release does not match the pinned catalog checksum")
            self._tiles = {tile["id"]: tile for tile in c["tiles"]}
            if len(self._tiles) != 88 or len(c["tiles"]) != 88:
                raise ValueError("Full cap requires exactly 88 unique tiles")
            for tile in self._tiles.values():
                self._path(tile["metadata_path"])
            reference = c["scoring_reference"]
            for key in ("slope_deg", "roughness_m", "elevation_m"):
                bounds = reference["bounds"][key]
                if len(bounds) != 2 or not np.isfinite(bounds).all() or bounds[0] > bounds[1]:
                    raise ValueError("Invalid scoring bounds")
        except (OSError, KeyError, ValueError, TypeError) as exc:
            raise DataUnavailable(f"Cap catalog unavailable: {exc}") from exc

    def _path(self, name: str) -> Path:
        path = (self.root / name).resolve()
        if not path.is_relative_to(self.root):
            raise DataUnavailable("Release artifact escapes the dataset directory")
        return path

    def catalog(self) -> dict:
        return json.loads(json.dumps(self._catalog))

    def features(self) -> dict:
        artifact = self._catalog["feature_catalog"]
        path = self._path(artifact["path"])
        try:
            if path.stat().st_size != artifact["bytes"] or digest(path) != artifact["sha256"]:
                raise ValueError("Feature catalog integrity failed")
            return json.loads(path.read_text())
        except (OSError, ValueError, KeyError) as exc:
            raise DataUnavailable(f"Feature centers unavailable: {exc}") from exc

    def exclusions(self, tile_id: str) -> list[dict]:
        self.load_tile(tile_id)  # Includes checksum validation of the exclusion artifact.
        return json.loads(self._path(self._tiles[tile_id]["validity_path"]).read_text())

    def trace(self) -> dict:
        with self._lock:
            return {
                "loaded_tile_ids": list(self._cache),
                "opened_tile_ids": list(self._opened),
                "resident_bytes": self._resident_bytes,
                "peak_resident_bytes": self._peak_bytes,
                "budget_bytes": self.max_cache_bytes,
                "cache_hits": self._hits,
                "tile_open_count": self._open_count,
                "evictions": self._evictions,
                "artifact_bytes_verified": self._artifact_bytes_verified,
                "cumulative_array_bytes_loaded": self._array_bytes_loaded,
            }

    def clear(self) -> None:
        with self._lock:
            self._cache.clear()
            self._resident_bytes = 0

    def intersecting_tiles(
        self, latitude_deg: float, longitude_deg_east: float, radius_km: float
    ) -> list[str]:
        """Conservative analytic circle/rectangle lookup; load_area filters exactly.

        The stereographic scale bound covers the entire spherical circle. Tile
        rectangles are intersected with the 87-degree cap in the catalog; a tile
        near that boundary can be returned even when it contains no circle sites.
        """
        if (
            not np.isfinite([latitude_deg, longitude_deg_east, radius_km]).all()
            or not -90 <= latitude_deg <= 90
            or radius_km < 0
        ):
            raise ValueError("Invalid spherical circle")
        north = latitude_deg + np.rad2deg(radius_km / 1737.4)
        if north >= 89 or radius_km >= np.pi * 1737.4:
            return sorted(self._tiles)
        lat, lon = np.deg2rad([latitude_deg, longitude_deg_east])
        rho = 2 * 1737400 * np.tan(np.pi / 4 + lat / 2)
        x, y = rho * np.sin(lon), rho * np.cos(lon)
        distance = radius_km * 1000 * 2 / (1 - np.sin(np.deg2rad(north)))
        result = []
        for tile_id, tile in sorted(self._tiles.items()):
            left, bottom, right, top = tile["footprint"]["extent_m"]
            dx, dy = max(left - x, 0, x - right), max(bottom - y, 0, y - top)
            if np.hypot(dx, dy) <= distance + 1e-6:
                result.append(tile_id)
        return result

    def load_tile(self, tile_id: str) -> dict:
        with self._lock:
            if tile_id in self._cache:
                self._hits += 1
                self._cache.move_to_end(tile_id)
                return dict(self._cache[tile_id])
            try:
                tile = self._tiles[tile_id]
                path = self._path(tile["metadata_path"])
                if digest(path) != tile["metadata_sha256"]:
                    raise ValueError("Tile metadata checksum mismatch")
                metadata = json.loads(path.read_text())
                if metadata["artifacts"] != tile["artifacts"]:
                    raise ValueError("Tile artifact catalog mismatch")
                for name, artifact in tile["artifacts"].items():
                    artifact_path = self._path(str(path.parent.relative_to(self.root) / name))
                    if (
                        artifact_path.stat().st_size != artifact["bytes"]
                        or digest(artifact_path) != artifact["sha256"]
                    ):
                        raise ValueError(f"Tile artifact integrity failed: {name}")
                with np.load(path.parent / "terrain.npz", allow_pickle=False) as archive:
                    arrays = {key: archive[key] for key in (*ROW_COLUMNS, "horizon_azimuth_deg")}
                n, bearings = tile["candidate_count"], arrays["horizon_azimuth_deg"]
                if not np.array_equal(bearings, np.arange(0, 360, 5)):
                    raise ValueError("Unsupported horizon profile")
                for key in ROW_COLUMNS:
                    shape = (n, len(bearings)) if key in ROW_COLUMNS[-2:] else (n,)
                    if arrays[key].shape != shape:
                        raise ValueError(f"Invalid tile shape: {key}")
                    if key != "ids" and not np.isfinite(arrays[key]).all():
                        raise ValueError(f"Unknown scientific values: {key}")
                size = sum(value.nbytes for value in arrays.values())
                if size > self.max_cache_bytes:
                    raise DataUnavailable("Tile exceeds configured resident byte budget")
                while self._resident_bytes + size > self.max_cache_bytes:
                    _, old = self._cache.popitem(last=False)
                    self._resident_bytes -= sum(value.nbytes for value in old.values())
                    self._evictions += 1
                for value in arrays.values():
                    value.flags.writeable = False
                self._cache[tile_id] = arrays
                self._resident_bytes += size
                self._peak_bytes = max(self._peak_bytes, self._resident_bytes)
                self._opened.append(tile_id)
                self._open_count += 1
                self._artifact_bytes_verified += sum(
                    item["bytes"] for item in tile["artifacts"].values()
                )
                self._array_bytes_loaded += size
                return dict(arrays)
            except (OSError, KeyError, ValueError, TypeError) as exc:
                raise DataUnavailable(f"Cannot load {tile_id}: {exc}") from exc

    def load_area(self, latitude_deg: float, longitude_deg_east: float, radius_km: float) -> dict:
        tiles = self.intersecting_tiles(latitude_deg, longitude_deg_east, radius_km)
        pieces = {key: [] for key in ROW_COLUMNS}
        lat0, lon0 = np.deg2rad([latitude_deg, longitude_deg_east])
        for tile_id in tiles:
            arrays = self.load_tile(tile_id)
            lat, lon = np.deg2rad(arrays["lat_deg"]), np.deg2rad(arrays["lon_deg"])
            hav = (
                np.sin((lat - lat0) / 2) ** 2
                + np.cos(lat) * np.cos(lat0) * np.sin((lon - lon0) / 2) ** 2
            )
            inside = 2 * 1737.4 * np.arcsin(np.sqrt(np.clip(hav, 0, 1))) <= radius_km
            for key in ROW_COLUMNS:
                pieces[key].append(arrays[key][inside])
        result = {}
        for key, chunks in pieces.items():
            shape = (0, 72) if key in ROW_COLUMNS[-2:] else (0,)
            result[key] = (
                np.concatenate(chunks)
                if chunks
                else np.empty(shape, dtype="U32" if key == "ids" else float)
            )
        order = np.argsort(result["ids"], kind="stable")
        result = {key: values[order] for key, values in result.items()}
        result["horizon_azimuth_deg"] = np.arange(0, 360, 5, dtype=np.float32)
        return result

    def site(self, site_id: str) -> dict:
        match = re.fullmatch(r"lola-([+-]\d{5,6})-([+-]\d{5,6})", site_id)
        if match is None:
            raise DataUnavailable("Unknown stable site ID")
        x, y = map(int, match.groups())
        tile_id = f"tile-{(x + 100000) // 20000}-{(y + 100000) // 20000}"
        arrays = self.load_tile(tile_id)
        indices = np.flatnonzero(arrays["ids"] == site_id)
        if len(indices) != 1:
            raise DataUnavailable("Site is absent or explicitly excluded")
        return {key: arrays[key][indices].copy() for key in ROW_COLUMNS} | {
            "horizon_azimuth_deg": arrays["horizon_azimuth_deg"].copy()
        }
