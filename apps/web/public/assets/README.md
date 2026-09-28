# Runtime assets

This directory intentionally contains no large NASA models or scientific rasters.

- The current global view uses procedural geometry, so a fresh clone works immediately.
- The recommended NASA SVS Moon model and LOLA data sources are recorded in
  `scripts/data/source_catalog.json` and `backend/app/data/dataset-manifest.json`.
- Source rasters belong under `data/raw/` and generated web assets under `data/derived/`;
  both paths are ignored by Git.
- Any imported asset must retain its source URL, version, checksum, credit, coordinate
  reference information, and permitted usage in the dataset manifest.

Never treat a rendered GLB as an analysis-ready elevation model.

