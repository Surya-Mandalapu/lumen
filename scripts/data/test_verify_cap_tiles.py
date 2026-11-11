import json

import pytest
from cap_test_support import write_tile
from prepare_terrain import sha256
from verify_cap_tiles import verify_tiles


def test_partial_cap_cannot_be_reported_complete_and_corruption_fails(tmp_path):
    metadata = write_tile(tmp_path, 5, 5, exclude_first=True)
    report = verify_tiles(tmp_path)
    assert report["verified_tiles"] == 1
    assert report["verified_candidates"] == metadata["candidate_count"]
    assert report["excluded_candidates"] == 1
    assert report["accounted_grid_points"] == 1599
    assert not report["complete"]
    assert report["missing_tiles"]
    (tmp_path / "tile-5-5/terrain.json").write_text("corrupt")
    with pytest.raises(ValueError, match="Artifact integrity failed"):
        verify_tiles(tmp_path)


@pytest.mark.parametrize("change", ["omit", "duplicate", "reason"])
def test_validity_cannot_hide_missing_grid_points(tmp_path, change):
    metadata = write_tile(tmp_path, 5, 5, exclude_first=True)
    path = tmp_path / "tile-5-5/exclusions.json"
    exclusions = json.loads(path.read_text())
    if change == "omit":
        exclusions = []
    elif change == "duplicate":
        exclusions *= 2
    else:
        exclusions[0]["reason"] = "clear_sky"
    path.write_text(json.dumps(exclusions))
    metadata["excluded_count"] = len(exclusions)
    metadata["artifacts"][path.name] = {
        "sha256": sha256(path),
        "bytes": path.stat().st_size,
    }
    (path.parent / "metadata.json").write_text(json.dumps(metadata))
    with pytest.raises(
        ValueError, match="Invalid source exclusions|grid is incomplete"
    ):
        verify_tiles(tmp_path)


def test_resume_rejects_different_requested_profile(tmp_path):
    write_tile(tmp_path, 5, 5)
    with pytest.raises(ValueError, match="Unsupported preparation settings"):
        verify_tiles(tmp_path, azimuth_step_deg=2)
