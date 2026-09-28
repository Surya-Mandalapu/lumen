from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "backend" / "app" / "data" / "dataset-manifest.json"


def main() -> None:
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

    print(f"Verified {MANIFEST.relative_to(ROOT)} ({payload['status']})")


if __name__ == "__main__":
    main()

