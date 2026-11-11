"""Scientific fixtures only: selective membership, seams and immutable releases."""

import json
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts/data"))
from build_cap_catalog import build_catalog
from cap_test_support import write_tile
from prepare_terrain import candidate_grid, projected_to_geographic

from app.services.dataset import DataUnavailable
from app.services.scoring_reference import scoring_reference
from app.services.terrain_store import ROW_COLUMNS, TerrainStore, catalog_digest, digest
from app.services.tile_metrics import identity_key, load_tile_metrics


@pytest.fixture(scope="module")
def cap(tmp_path_factory):
    root = tmp_path_factory.mktemp("cap")
    for x in range(10):
        for y in range(10):
            if len(candidate_grid((x, y))[0]):
                write_tile(root, x, y, exclude_first=(x, y) == (5, 5))
    (root / "features.json").write_text(
        json.dumps(
            {
                "features": [
                    {
                        "id": "test-cap-landmark",
                        "name": "Synthetic test landmark",
                        "approved": True,
                        "latitude_deg": -88.2,
                        "longitude_deg_east": 90,
                    }
                ],
                "source": {"id": "synthetic-test-only"},
            }
        )
    )
    catalog = build_catalog(root)
    columns = {key: [] for key in ROW_COLUMNS}
    for tile in catalog["tiles"]:
        with np.load(root / tile["id"] / "terrain.npz") as arrays:
            for key, chunks in columns.items():
                chunks.append(arrays[key])
    return root, {key: np.concatenate(chunks) for key, chunks in columns.items()}


@pytest.mark.parametrize(
    "latitude,longitude,radius",
    [
        (-89.98, 0, 3),
        (-89.8, 179.99, 8),
        (-89.8, -180.01, 8),
        (-87.01, 40, 5),
        (-86.99, -90, 5),
        (-90, 0, 1),
        (-88.8, 90, 4),
    ],
)
def test_circles_match_monolithic_reference_without_unrelated_reads(
    cap, latitude, longitude, radius
):
    root, all_arrays = cap
    store = TerrainStore(root, max_cache_bytes=2 * 1024 * 1024)
    result = store.load_area(latitude, longitude, radius)
    lat0, lon0 = np.deg2rad([latitude, longitude])
    lat, lon = np.deg2rad(all_arrays["lat_deg"]), np.deg2rad(all_arrays["lon_deg"])
    hav = np.sin((lat - lat0) / 2) ** 2 + np.cos(lat) * np.cos(lat0) * np.sin((lon - lon0) / 2) ** 2
    mask = 2 * 1737.4 * np.arcsin(np.sqrt(np.clip(hav, 0, 1))) <= radius
    indices = np.flatnonzero(mask)
    indices = indices[np.argsort(all_arrays["ids"][indices])]
    for key in ROW_COLUMNS:
        np.testing.assert_array_equal(result[key], all_arrays[key][indices])
    trace = store.trace()
    assert trace["opened_tile_ids"] == store.intersecting_tiles(latitude, longitude, radius)
    assert len(trace["opened_tile_ids"]) < 12
    assert trace["peak_resident_bytes"] <= trace["budget_bytes"]


def test_stable_sites_scores_eviction_and_readonly_arrays(cap):
    root, arrays = cap
    store = TerrainStore(root, max_cache_bytes=2 * 1024 * 1024)
    site_id = "lola-+20000-+10000"  # deterministic edge ownership in tile-6-5
    first = store.site(site_id)
    assert store.trace()["opened_tile_ids"] == ["tile-6-5"]
    for tile_id in reversed(list(store._tiles)):
        store.load_tile(tile_id)
    second = store.site(site_id)
    for key in first:
        np.testing.assert_array_equal(first[key], second[key])
    with pytest.raises(ValueError, match="read-only"):
        store.load_tile("tile-6-5")["slope_deg"][0] = 900
    reference = store.catalog()["scoring_reference"]
    metadata = {"dataset_version": "lunar-south-cap-v1", "scoring_reference": reference}
    assert scoring_reference(metadata, first) == scoring_reference(metadata, arrays)
    with pytest.raises(DataUnavailable, match="has not been frozen"):
        scoring_reference({"dataset_version": "lunar-south-cap-v1"}, first)
    with pytest.raises(DataUnavailable, match="absent or explicitly excluded"):
        store.site("lola-+00500-+00000")  # first grid point after excluded pole
    assert store.trace()["resident_bytes"] <= 2 * 1024 * 1024


def test_missing_corrupt_tiles_and_bad_catalog_fail_closed(cap, tmp_path):
    root, _ = cap
    catalog = json.loads((root / "catalog.json").read_text())
    (tmp_path / "catalog.json").write_text(json.dumps(catalog))
    store = TerrainStore(tmp_path)
    with pytest.raises(DataUnavailable, match="pinned"):
        TerrainStore(tmp_path, expected_catalog_sha256="incorrect-release")
    with pytest.raises(DataUnavailable, match="Cannot load"):
        store.load_tile("tile-5-5")
    catalog["tiles"][0]["metadata_path"] = "../outside/metadata.json"
    catalog["catalog_sha256"] = catalog_digest(catalog)
    (tmp_path / "catalog.json").write_text(json.dumps(catalog))
    with pytest.raises(DataUnavailable, match="escapes"):
        TerrainStore(tmp_path)
    catalog["tiles"][0]["metadata_path"] = "tampered"
    (tmp_path / "catalog.json").write_text(json.dumps(catalog))
    with pytest.raises(DataUnavailable, match="Invalid or incomplete"):
        TerrainStore(tmp_path)


def test_optional_cache_rejects_stale_and_damaged_values(tmp_path):
    from app.services.search import METRIC_KEYS

    identity = {"start": datetime(2028, 10, 1, tzinfo=UTC).isoformat(), "algorithm_version": 1}
    ids = np.array(["a", "b"])
    path = tmp_path / "tile-5-5.npz"
    columns = {key: np.array([0.25, 0.5]) for key in METRIC_KEYS}
    np.savez_compressed(path, key=np.array(identity_key(identity)), ids=ids, **columns)
    manifest = {
        "identity": identity,
        "key": identity_key(identity),
        "sha256": digest(path),
        "bytes": path.stat().st_size,
    }
    (tmp_path / "tile-5-5.json").write_text(json.dumps(manifest))
    assert load_tile_metrics(tmp_path, "tile-5-5", identity, ids) is not None
    changed = identity | {
        "start": (datetime(2028, 10, 1, tzinfo=UTC) + timedelta(days=1)).isoformat()
    }
    assert load_tile_metrics(tmp_path, "tile-5-5", changed, ids) is None
    assert load_tile_metrics(tmp_path, "tile-5-5", identity, ids[::-1]) is None
    columns["illumination_fraction"] = np.array([0.99, 0.99])
    np.savez_compressed(path, key=np.array(identity_key(identity)), ids=ids, **columns)
    assert load_tile_metrics(tmp_path, "tile-5-5", identity, ids) is None


def test_cap_catalog_rejects_incomplete_release(tmp_path):
    write_tile(tmp_path, 5, 5)
    with pytest.raises(ValueError, match="partial cap"):
        build_catalog(tmp_path)


def test_polar_projection_wrap_roundtrip():
    lat, lon = projected_to_geographic(np.array([0, -0.001, 0.001]), np.array([-500, -500, -500]))
    assert np.all(np.rad2deg(lat) < -89)
    assert np.rad2deg(lon)[0] == 180
