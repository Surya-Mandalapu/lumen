import hashlib
import json

import numpy as np
import pytest
from prepare_terrain import candidate_grid, projected_to_geographic
from verify_cap_tiles import verify_tiles


def test_partial_cap_cannot_be_reported_complete_and_corruption_fails(tmp_path):
    x, y, extent = candidate_grid((5, 5))
    lat, _ = projected_to_geographic(x, y)
    directory = tmp_path / "tile-5-5"
    directory.mkdir()
    np.savez_compressed(
        directory / "terrain.npz",
        ids=np.array([f"sample-{i}" for i in range(len(x))]),
        x_m=x,
        y_m=y,
        lat_deg=np.rad2deg(lat),
    )
    (directory / "terrain.json").write_text("{}")
    artifacts = {
        name: {
            "sha256": hashlib.sha256((directory / name).read_bytes()).hexdigest(),
            "bytes": (directory / name).stat().st_size,
        }
        for name in ("terrain.npz", "terrain.json")
    }
    (directory / "metadata.json").write_text(
        json.dumps(
            {
                "dataset_version": "lunar-south-cap-v1",
                "coverage": {"tile_index": [5, 5], "extent_m": list(extent)},
                "candidate_count": len(x),
                "artifacts": artifacts,
            }
        )
    )
    report = verify_tiles(tmp_path)
    assert report["verified_tiles"] == 1
    assert report["verified_candidates"] == len(x)
    assert not report["complete"]
    assert report["missing_tiles"]
    (directory / "terrain.json").write_text("corrupt")
    with pytest.raises(ValueError, match="Artifact integrity failed"):
        verify_tiles(tmp_path)
