from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

PACKAGE_ROOT = Path(__file__).resolve().parent
REPOSITORY_ROOT = PACKAGE_ROOT.parent.parent


def default_data_root() -> Path:
    cap = REPOSITORY_ROOT / "data/derived/lunar-south-cap-v1"
    # Installing a complete release enables the cap; corrupt installed releases
    # fail verification rather than silently reverting to a different dataset.
    return cap if (cap / "catalog.json").exists() else REPOSITORY_ROOT / "data/derived/pgda-demo-v1"


@dataclass(frozen=True)
class Settings:
    environment: str = os.getenv("LUMEN_ENV", "development")
    dataset_manifest_path: Path = PACKAGE_ROOT / "data" / "dataset-manifest.json"
    data_root: Path = Path(os.getenv("LUMEN_DATA_ROOT", default_data_root()))
    kernel_root: Path = Path(
        os.getenv("LUMEN_KERNEL_ROOT", REPOSITORY_ROOT / "data" / "raw" / "kernels")
    )
    static_dir: Path = Path(
        os.getenv("LUMEN_STATIC_DIR", REPOSITORY_ROOT / "apps" / "web" / "dist")
    )


settings = Settings()
