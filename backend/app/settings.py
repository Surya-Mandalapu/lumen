from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

PACKAGE_ROOT = Path(__file__).resolve().parent
REPOSITORY_ROOT = PACKAGE_ROOT.parent.parent


@dataclass(frozen=True)
class Settings:
    environment: str = os.getenv("LUMEN_ENV", "development")
    dataset_manifest_path: Path = PACKAGE_ROOT / "data" / "dataset-manifest.json"
    data_root: Path = Path(
        os.getenv("LUMEN_DATA_ROOT", REPOSITORY_ROOT / "data" / "derived")
    )
    static_dir: Path = Path(
        os.getenv("LUMEN_STATIC_DIR", REPOSITORY_ROOT / "apps" / "web" / "dist")
    )


settings = Settings()

