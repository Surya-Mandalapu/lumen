# Architecture

React/TypeScript renders a mission form, Three.js terrain and contextual Moon,
candidate shortlist, horizon chart, timeline, comparison table and export controls.
FastAPI validates requests and owns all metrics, filtering, scoring and provenance.
A static frontend build can be served by the same API process or by Vite during development.

## Prepared artifacts

The checked-in `data/derived/pgda-demo-v1/` bundle contains the candidate and horizon
NPZ, display height grid, PSR overlay, approved feature catalog, and source/artifact metadata. Runtime verifies checksums,
frame and reference radius before accepting it. `scripts/data/prepare_terrain.py`
reproduces it from pinned official NASA rasters; rasterio/scipy are preprocessing
requirements rather than runtime dependencies.

`scripts/data/prepare_kernels.py` downloads four pinned NAIF kernels, verifies their
SHA-256 hashes and writes a kernel manifest to ignored `data/raw/kernels/`.
Runtime verifies and loads these kernels; their provenance appears in every result.
The readiness endpoint combines actual terrain and kernel availability. The tracked
manifest is a scope/configuration declaration, not a switch that bypasses verification.

## Search flow

1. Strict Pydantic validation rejects unknown fields, unsupported selectors, invalid
   date ranges, locations outside the planned polar cap, and unavailable hard metrics.
2. Prepared candidate locations are intersected with the requested circle or study area.
3. Static terrain constraints filter candidate locations.
4. Cached Sun/Earth ephemerides are transformed into each observer's local frame.
   Terrain-horizon lookup and finite-disk geometry generate 5-minute sampled states.
5. Duration-weighted availability and continuous intervals apply temporal constraints.
6. Fixed dataset-wide utilities combine with normalized weights; science proximity uses fixed PSR and approved-feature center distance utilities when available.
7. Deterministic score/id sorting and 1.5 km separation return up to five sites.
8. Results include full finalist timelines, horizons, raw metrics, applied weights,
   request and provenance. The browser exports this same response as JSON.

SPICE's process-wide pool is protected with a lock. Dataset and ephemeris caches are
bounded. The MVP needs no database, account system, queue or LLM service. Missing or
corrupt science data fails closed. Static file paths are resolved and constrained to
the frontend distribution directory. See scientific-conventions.md for approximations.

## Extended exploration routes

- `GET /api/v1/features` and `/layers/psr`: attributed, integrity-checked local discovery data.
- `POST /api/v1/sites/{id}/analysis`: a fixed prepared location, its raw metrics and paths,
  approximate blocker coordinates, and separately refined visible/blocked intervals.
- `POST /api/v1/scenarios/analyze`: fixed-location baseline versus a shifted window,
  nearby prepared points and optional 2.5-minute sampling. This endpoint never reranks.

The browser's bounded mission-brief grammar produces an editable SearchRequest. It cannot
call tools, generate coordinates for unknown names, calculate metrics or select sites.
Feature-radius requests are re-resolved server-side against the verified IAU catalog;
client-supplied coordinates and names are replaced. UTC canonicalization makes equivalent
timezone representations reproducible. All routes share validation and scientific code.

Only explicitly saved mission inputs use localStorage (maximum twelve configurations).
Scientific responses remain in memory or are exported as JSON/CSV. Scenario reports always
retain the original request and site, preventing accidental cross-window comparisons.
Scene annotations use native Three sprites and textures, avoiding nested ReactDOM roots
and their teardown races when switching analytical views.
