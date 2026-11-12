"""Package and verify a checksum-addressed full-cap release in a clean directory."""

from __future__ import annotations

import argparse
import importlib.metadata
import json
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path

from prepare_terrain import ROOT, sha256
from verify_cap_release import verify_release


def package_release(root: Path, output: Path, kernel_root: Path) -> Path:
    validation = verify_release(root, kernel_root)
    catalog = json.loads((root / "catalog.json").read_text())
    for name in ("loader-benchmark.json", "source-reference-validation.json"):
        evidence = json.loads((root / name).read_text())
        if evidence["catalog_sha256"] != catalog["catalog_sha256"]:
            raise ValueError(f"Stale release evidence: {name}")
    paths = [
        root / name
        for name in (
            "catalog.json",
            "metadata.json",
            "terrain.npz",
            "terrain.json",
            "features.json",
            "verification.json",
            "release-validation.json",
            "loader-benchmark.json",
            "source-reference-validation.json",
        )
    ]
    for tile in catalog["tiles"]:
        directory = root / tile["id"]
        paths.extend(
            directory / name
            for name in ("metadata.json", "measurement.json", *tile["artifacts"])
        )
        paths.extend(
            root / "demo-cache" / f"{tile['id']}.{suffix}" for suffix in ("npz", "json")
        )
    recipe_sources = [
        *sorted((ROOT / "scripts/data").glob("*.py")),
        *sorted((ROOT / "backend/app").rglob("*.py")),
        ROOT / "scripts/data/requirements.txt",
        ROOT / "scripts/data/source_catalog.json",
        ROOT / "backend/pyproject.toml",
        ROOT / "backend/app/data/dataset-manifest.json",
        ROOT / "backend/app/data/legacy-scoring-reference.json",
        ROOT / "docs/lunar-cap-release.md",
        *[
            ROOT / "data/derived/pgda-demo-v1" / name
            for name in (
                "metadata.json",
                "terrain.npz",
                "terrain.json",
                "features.json",
                "psr.json",
            )
        ],
    ]
    for source in recipe_sources:
        destination = root / "provenance/recipe" / source.relative_to(ROOT)
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)
        paths.append(destination)
    kernel_manifest = root / "provenance/kernel-manifest.json"
    shutil.copyfile(kernel_root / "manifest.json", kernel_manifest)
    paths.append(kernel_manifest)
    files = {
        path.relative_to(root).as_posix(): {
            "sha256": sha256(path),
            "bytes": path.stat().st_size,
        }
        for path in sorted(set(paths))
    }
    manifest = {
        "schema_version": 1,
        "dataset_version": catalog["dataset_version"],
        "catalog_sha256": catalog["catalog_sha256"],
        "files": files,
        "uncompressed_bytes": sum(item["bytes"] for item in files.values()),
        "python_version": sys.version,
        "dependencies": {
            name: importlib.metadata.version(name)
            for name in ("numpy", "rasterio", "scipy", "spiceypy", "psutil")
        },
        "validation": {
            "tiles": validation["exact_cache_tiles"],
            "candidate_count": catalog["verification"]["verified_candidates"],
        },
        "unavailable_layers": [
            name for name, ready in catalog["layers"].items() if not ready
        ],
        "kernels_included": False,
        "preparation_recipe": "provenance/recipe/docs/lunar-cap-release.md",
    }
    manifest_path = root / "release-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    paths.append(manifest_path)
    output.mkdir(parents=True, exist_ok=True)
    # Full content hash also distinguishes operational report/measurement changes.
    identity = sha256(manifest_path)
    archive = output / f"lunar-south-cap-v1-{identity[:16]}.zip"
    temporary = archive.with_suffix(".partial.zip")
    with zipfile.ZipFile(
        temporary, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6
    ) as package:
        for path in sorted(set(paths)):
            info = zipfile.ZipInfo(
                path.relative_to(root).as_posix(), date_time=(1980, 1, 1, 0, 0, 0)
            )
            info.compress_type = zipfile.ZIP_DEFLATED
            package.writestr(info, path.read_bytes())
        readme_info = zipfile.ZipInfo("README.md", date_time=(1980, 1, 1, 0, 0, 0))
        readme_info.compress_type = zipfile.ZIP_DEFLATED
        package.writestr(readme_info, (ROOT / "docs/lunar-cap-release.md").read_bytes())
    if archive.exists():
        if sha256(archive) != sha256(temporary):
            temporary.unlink()
            raise ValueError("Refusing to replace an immutable release with different bytes")
        temporary.unlink()
    else:
        temporary.replace(archive)
    # Round trip from a fresh directory; no prepared files or populated loader cache.
    with tempfile.TemporaryDirectory(prefix="lumen-cap-clean-") as clean:
        clean_root = Path(clean)
        with zipfile.ZipFile(archive) as package:
            package.extractall(clean_root)
        for name, artifact in files.items():
            path = clean_root / name
            if (
                path.stat().st_size != artifact["bytes"]
                or sha256(path) != artifact["sha256"]
            ):
                raise ValueError(f"Clean release checksum failed: {name}")
        verify_release(clean_root, kernel_root)
    receipt = {
        "archive": archive.name,
        "sha256": sha256(archive),
        "bytes": archive.stat().st_size,
        "uncompressed_bytes": manifest["uncompressed_bytes"],
        "clean_reload_verified": True,
    }
    archive.with_suffix(".json").write_text(
        json.dumps(receipt, indent=2), encoding="utf-8"
    )
    shutil.copyfile(manifest_path, output / f"{archive.stem}-manifest.json")
    print(json.dumps(receipt, indent=2))
    return archive


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root", type=Path, default=ROOT / "data/derived/lunar-south-cap-v1"
    )
    parser.add_argument(
        "--output", type=Path, default=ROOT / "deliverables/lunar-cap-release"
    )
    parser.add_argument("--kernel-root", type=Path, default=ROOT / "data/raw/kernels")
    args = parser.parse_args()
    package_release(args.root, args.output, args.kernel_root)
