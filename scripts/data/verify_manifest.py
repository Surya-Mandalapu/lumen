from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from urllib.parse import urlparse

from prepare_kernels import PINNED

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "backend" / "app" / "data" / "dataset-manifest.json"


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify bundled terrain and optional prepared kernels.")
    parser.add_argument("--require-kernels", action="store_true")
    args = parser.parse_args()
    payload = json.loads(MANIFEST.read_text(encoding="utf-8"))
    required = {
        "application",
        "dataset_version",
        "status",
        "supported_region",
        "coordinate_reference",
        "analysis",
        "valid_time_range",
        "sources",
        "derived_artifacts",
        "disclaimers",
    }
    missing = required - payload.keys()
    if missing:
        raise SystemExit(f"Manifest missing required keys: {sorted(missing)}")

    for source in payload["sources"]:
        parsed = urlparse(source["url"])
        if parsed.scheme != "https" or not parsed.netloc:
            raise SystemExit(f"Source {source['id']} must use a valid HTTPS URL")

    if payload["status"] == "prepared":
        unavailable = [
            name
            for name, artifact_status in payload["derived_artifacts"].items()
            if artifact_status in {"not_built", "missing"}
        ]
        if unavailable:
            raise SystemExit(f"Prepared manifest has unavailable artifacts: {unavailable}")

    bundle = ROOT / "data" / "derived" / payload.get("bundle_directory", payload["dataset_version"])
    metadata = json.loads((bundle / "metadata.json").read_text(encoding="utf-8"))
    for name, artifact in metadata["artifacts"].items():
        path = bundle / name
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest != artifact["sha256"] or path.stat().st_size != artifact["bytes"]:
            raise SystemExit(f"Bundled artifact failed integrity verification: {name}")
    if args.require_kernels:
        kernel_root = ROOT / "data" / "raw" / "kernels"
        recorded = json.loads((kernel_root / "manifest.json").read_text(encoding="utf-8"))
        recorded_hashes = {entry["file"]: entry["sha256"] for entry in recorded}
        for name, expected in PINNED.items():
            digest = hashlib.sha256((kernel_root / name).read_bytes()).hexdigest()
            if digest != expected or recorded_hashes.get(name) != expected:
                raise SystemExit(f"Kernel failed pinned integrity verification: {name}")
    readiness = "terrain and kernels" if args.require_kernels else "bundled terrain"
    print(f"Verified {payload['dataset_version']}: {readiness}; {metadata['candidate_count']} candidates")


if __name__ == "__main__":
    main()

