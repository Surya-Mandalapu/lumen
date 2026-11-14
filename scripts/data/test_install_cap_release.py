"""Synthetic packaging fixtures; these are not lunar scientific data."""

import hashlib
import json
import zipfile

import pytest
from install_cap_release import digest, install_archive, safe_path, verify_install


def package(tmp_path, *, broken_file=False, extra=None):
    content = b"synthetic installer fixture"
    manifest = {
        "files": {
            "tile/data.bin": {
                "bytes": len(content),
                "sha256": hashlib.sha256(content).hexdigest(),
            }
        },
        "validation": {"candidate_count": 1},
    }
    archive = tmp_path / "fixture.zip"
    with zipfile.ZipFile(archive, "w") as output:
        output.writestr("release-manifest.json", json.dumps(manifest))
        output.writestr("tile/data.bin", b"corrupt" if broken_file else content)
        if extra:
            name, value = extra
            output.writestr(name, value)
    return archive


def test_install_authenticates_archive_and_all_declared_files(tmp_path):
    archive = package(tmp_path)
    destination = tmp_path / "installed"
    result = install_archive(archive, destination, digest(archive))
    assert result["validation"]["candidate_count"] == 1
    assert (
        destination / "tile/data.bin"
    ).read_bytes() == b"synthetic installer fixture"
    assert (
        verify_install(destination, digest(destination / "release-manifest.json"))
        == result
    )


def test_bad_archive_never_creates_destination(tmp_path):
    archive = package(tmp_path)
    destination = tmp_path / "installed"
    with pytest.raises(ValueError, match="archive checksum"):
        install_archive(archive, destination, "0" * 64)
    assert not destination.exists()


def test_bad_file_never_publishes_partial_install(tmp_path):
    archive = package(tmp_path, broken_file=True)
    destination = tmp_path / "installed"
    with pytest.raises(ValueError, match="artifact checksum"):
        install_archive(archive, destination, digest(archive))
    assert not destination.exists()
    assert not list(tmp_path.glob(".cap-install-*"))


@pytest.mark.parametrize("name", ["../escape", "/escape", "C:/escape", "tile\\escape"])
def test_paths_cannot_escape_install(tmp_path, name):
    with pytest.raises(ValueError, match="release path|Release path"):
        safe_path(tmp_path, name)


def test_zip_traversal_is_rejected_before_extraction(tmp_path):
    archive = package(tmp_path, extra=("../escape", b"unsafe"))
    with pytest.raises(ValueError, match="release path"):
        install_archive(archive, tmp_path / "installed", digest(archive))
    assert not (tmp_path / "escape").exists()


def test_existing_install_is_not_overwritten(tmp_path):
    archive = package(tmp_path)
    destination = tmp_path / "installed"
    destination.mkdir()
    (destination / "keep.txt").write_text("existing")
    with pytest.raises(ValueError, match="existing cap"):
        install_archive(archive, destination, digest(archive))
    assert (destination / "keep.txt").read_text() == "existing"


def test_existing_manifest_must_be_the_pinned_one(tmp_path):
    archive = package(tmp_path)
    destination = tmp_path / "installed"
    install_archive(archive, destination, digest(archive))
    with pytest.raises(ValueError, match="manifest checksum"):
        verify_install(destination)
