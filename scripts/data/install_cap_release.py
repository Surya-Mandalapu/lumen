"""Install the pinned, verified cap release during clean hosting builds."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import tempfile
import urllib.request
import zipfile
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[2]
RELEASE_TAG = "lunar-south-cap-v1-d1ecdd0522df9876"
ARCHIVE_NAME = f"{RELEASE_TAG}.zip"
ARCHIVE_SHA256 = "517e64b1948065e389b5da6f86669a302a7a4349b702d24e264c81b22d294222"
MANIFEST_SHA256 = "d1ecdd0522df98768e35dcd22438ed5537ed39e3790a99a110e31587377bba55"
URL = f"https://github.com/Surya-Mandalapu/lumen/releases/download/{RELEASE_TAG}/{ARCHIVE_NAME}"


def digest(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def safe_path(root: Path, name: str) -> Path:
    relative = PurePosixPath(name)
    if relative.is_absolute() or ".." in relative.parts or "\\" in name or ":" in name:
        raise ValueError(f"Invalid release path: {name}")
    result = (root / name).resolve()
    if not result.is_relative_to(root.resolve()):
        raise ValueError(f"Release path escapes destination: {name}")
    return result


def verify_install(root: Path, manifest_sha256: str = MANIFEST_SHA256) -> dict:
    manifest_path = root / "release-manifest.json"
    if digest(manifest_path) != manifest_sha256:
        raise ValueError("Cap release manifest checksum mismatch")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    for name, artifact in manifest["files"].items():
        path = safe_path(root, name)
        if (
            path.stat().st_size != artifact["bytes"]
            or digest(path) != artifact["sha256"]
        ):
            raise ValueError(f"Cap release artifact checksum mismatch: {name}")
    return manifest


def install_archive(
    archive: Path, destination: Path, expected_sha256: str = ARCHIVE_SHA256
) -> dict:
    if digest(archive) != expected_sha256:
        raise ValueError("Cap release archive checksum mismatch")
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        raise ValueError(
            "Refusing to replace an existing cap; verify it or choose a clean destination"
        )
    with tempfile.TemporaryDirectory(
        prefix=".cap-install-", dir=destination.parent
    ) as temporary:
        staging = Path(temporary) / "cap"
        staging.mkdir()
        with zipfile.ZipFile(archive) as package:
            for member in package.infolist():
                safe_path(staging, member.filename)
                if (member.external_attr >> 16) & 0o170000 == 0o120000:
                    raise ValueError("Release archives cannot contain symbolic links")
            package.extractall(staging)
        # The archive was authenticated before extraction; check every declared file.
        manifest = verify_install(staging, digest(staging / "release-manifest.json"))
        staging.rename(destination)
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--archive", type=Path, help="Use an already downloaded pinned archive"
    )
    parser.add_argument(
        "--output", type=Path, default=ROOT / "data/derived/lunar-south-cap-v1"
    )
    args = parser.parse_args()
    if args.output.exists():
        manifest = verify_install(args.output)
    elif args.archive:
        manifest = install_archive(args.archive, args.output)
    else:
        with tempfile.TemporaryDirectory(prefix="lumen-cap-download-") as directory:
            archive = Path(directory) / ARCHIVE_NAME
            with (
                urllib.request.urlopen(URL, timeout=180) as response,
                archive.open("wb") as target,
            ):
                shutil.copyfileobj(response, target)
            manifest = install_archive(archive, args.output)
    print(
        f"Verified cap installed: {manifest['validation']['candidate_count']:,} locations"
    )


if __name__ == "__main__":
    main()
