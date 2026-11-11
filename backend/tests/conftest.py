"""Keep legacy scientific regressions independent of optional local cap installs."""

import os
from pathlib import Path

os.environ.setdefault(
    "LUMEN_DATA_ROOT", str(Path(__file__).resolve().parents[2] / "data/derived/pgda-demo-v1")
)
