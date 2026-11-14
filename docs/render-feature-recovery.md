# Restoring the hosted feature set

The merged app already contained the scene-first UI, site sky, Earth/Sun orbit,
fullscreen, area drawing, local ranking and 3D result locations. The live Render
service served the same frontend bundle as the local build, but its image omitted
the optional global grid and full cap. Consequently `/api/v1/global/terrain` and
`/api/v1/global/rank-area` returned 503, and coverage advertised only 1,680 sites.

## Clean production builds

The Dockerfile now includes a scientific-data build stage. It prepares the pinned
global NASA LOLA grid and installs the published 80 MB cap archive. The installer
checks the archive SHA-256, every file in its authenticated manifest and extraction
paths before publishing the destination. An existing installation is verified,
never silently replaced. GIS preparation libraries and raw downloaded inputs stay
out of the final runtime image.

The runtime defaults to these paths:

- `LUMEN_DATA_ROOT=/app/data/derived/lunar-south-cap-v1`
- `LUMEN_GLOBAL_ROOT=/app/data/derived/global-preview-v1`
- `LUMEN_KERNEL_ROOT` uses the prepared `/app/data/raw/kernels` default.
- `LUMEN_STATIC_DIR=/app/apps/web/dist`

On Render, use the repository-root Dockerfile, track `main` and enable automatic
deploys. Remove any old environment override that forces
`LUMEN_DATA_ROOT=/app/data/derived/pgda-demo-v1`, or change it to the cap path above.
The container respects Render's `PORT`; it defaults to 8000 elsewhere. No separate
custom Docker start command is required. Health check: `/api/v1/health`.

The dataset release is a public scientific-data artifact. It is not an application
release and is excluded from Git history. The pinned source and per-file manifest
remain available for audit; a download/checksum failure stops the build.

## Visible workflows

Local-area ranking is now a full-width panel below the Moon for points outside
detailed polar coverage. Closing Study area on mobile does not hide the ranking
controls or results. The disabled detailed-mission continuation is hidden in that
mode; the available coarse-ranking action remains visible.

Moon landmark and coordinate labels start hidden until the demand-rendered scene
has checked their actual visibility. Back-side labels cannot flash or remain on
screen after loading. Ranked candidate labels receive collision priority.

## Verification

CI builds the production Docker image from a clean checkout, starts it on port
10000 and runs:

```sh
python scripts/verify_hosted_features.py --url http://127.0.0.1:10000
```

This verifies the full 103,996-site catalog, global grid, real 21-location coarse
ranking, real prepared-area search, scene ephemerides and model-asset checksums.
The same command can target `https://lumen-nad0.onrender.com` after deployment.
It fails if a deployment silently falls back to the small demo or lacks a grid.

```sh
python scripts/feature_recovery_smoke.py --url http://127.0.0.1:8000
```

Browser checks exercise desktop and phone layouts, closed-panel ranking,
back-side label suppression, Earth/Sun, the site horizon and all ranked locations
on the 3D Moon. Rendering refinements do not change scientific scoring inputs.

For local use, install `backend[dev]` plus `scripts/data/requirements.txt`, then run
`npm run prepare:all-data`. The basic `prepare:data` command intentionally remains
the smaller bundled-demo setup.
