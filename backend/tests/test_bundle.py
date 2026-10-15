import hashlib
import json
from pathlib import Path

import pytest

from app.services.dataset import DataUnavailable, dataset, load_dataset
from app.settings import settings


def test_bundled_terrain_is_finite_and_integrity_verified():
    if not settings.data_root.exists():
        pytest.skip("Prepared terrain bundle is not installed")
    metadata, arrays = dataset(settings.data_root)
    assert len(arrays["lat_deg"]) == metadata["candidate_count"]
    assert arrays["horizons_deg"].shape == (metadata["candidate_count"], 72)
    assert all(-90 < lat <= -87 for lat in arrays["lat_deg"])


def test_checksum_corruption_fails_closed(tmp_path: Path):
    (tmp_path / "terrain.npz").write_bytes(b"corrupted")
    (tmp_path / "terrain.json").write_text("{}")
    metadata = {
        "coordinate_frame": "MOON_ME_DE440_ME421",
        "reference_radius_m": 1737400,
        "artifacts": {
            "terrain.npz": {"sha256": hashlib.sha256(b"original").hexdigest()},
            "terrain.json": {"sha256": hashlib.sha256(b"{}").hexdigest()},
        },
    }
    (tmp_path / "metadata.json").write_text(json.dumps(metadata))
    with pytest.raises(DataUnavailable, match="checksum mismatch"):
        load_dataset(tmp_path, ())
