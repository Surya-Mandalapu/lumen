# MVP verification - October 14, 2026

Verified in the local Windows workspace on branch `codex/lumen-mvp`.

## Automated checks

- `npm test`: 2 frontend tests and 21 backend tests pass.
- `python -m pytest scripts/data/test_prepare_terrain.py`: 3 data-geometry regressions pass.
- `npm run build`: TypeScript and production Vite build pass.
- `python -m ruff check backend scripts`: passes.
- `npm run prepare:data`: verifies all four pinned kernels and both prepared artifact hashes.
- `npm run verify:data`: verifies the bundled 1,680-candidate terrain dataset.

The integration regression runs actual October 2028 SPICE calculations against the bundled
NASA patch, checks repeat-response equality, validates duration-weighted timeline fractions,
checks terrain filters and horizon/blocker output, and exercises an impossible empty query.
CI downloads pinned kernels before running the API suite.

## Independent review and browser checks

Separate implementation and verification agents reviewed the coordinate projection, local
axes, spherical horizons, solar disk, unknown-data exclusion, temporal integration, score
contributions and 1.5 km candidate separation. Static path traversal was identified and
fixed; the reported traversal now returns 404.

Headless Chrome exercised the complete default monthly search, five-site shortlist,
unpin/repin and comparison, selected-site changes, keyboard time control, 2D keyboard
map selection, NASA Moon context, methods dialog and Escape, downloaded/parsed JSON,
changed-parameter notice, empty constraints, reset and rerun. A 390 px mobile viewport
had no horizontal overflow. Final browser checks after the compass SVG fix reported no
console or uncaught JavaScript errors. The mobile mission form expands, submits and
collapses successfully.

The built frontend and asset were also served successfully by FastAPI at port 8000;
readiness reports `prepared` with 1,680 candidates. Local QA screenshots/reports are under
ignored `data/cache/`; these files are not required for runtime.

## Scope and unexercised packaging

This release analyzes a prepared 20 km polar square, not the full planned 87-90 degree
cap. Five-degree terrain horizons and five-minute time steps are approximations. There
is no transition refinement, quality/confidence mask, PSR/feature proximity or 5 m tile
analysis. These limits appear in the UI, dataset metadata, exports and scientific docs.

Docker configuration includes the small bundle and downloads pinned kernels at build
time. Docker is unavailable on this workstation, so the container build was not executed.


## Exploration expansion verification - October 14, 2026

The expanded application passes 49 automated checks: 35 API/science tests, 8 frontend
normalization/brief-parser tests, and 6 terrain/science preprocessing regressions.
Production build, Ruff, and all bundled artifact hashes pass. The official feature
resolver replaces forged coordinates, rejects unknown IDs, and canonicalizes UTC offsets.
The new API tests verify discovery data attribution and fail-closed layer serving.

Independent browser QA passed the expanded mission journey: delay +12/+24 hours,
500 m/1 km spatial checks, 2.5-minute sampling toggle, scenario deltas/export, edited-date
application, local mission save/load/import/export, reviewable mission brief application,
Shackleton radius plus PSR/advanced filters, score/availability/PSR layers, unshortlisted
map-point inspection, refined events/blockers, and 390 px mobile layout.

Repeated 3D -> 2D -> Moon -> local sky switches, slider interaction while sky is active,
and site changes pass with no uncaught errors. An injected scenario 503 recovers on retry.
A nested ReactDOM teardown race was reproduced with drei Html and removed by replacing
all scene labels with native Three sprites/CanvasTexture. The final clean expanded browser
run reports zero page errors and zero console errors. QA evidence remains in ignored
`data/cache/agent-browser/`.

Current data release is `pgda-demo-v1.1` (the stable folder stays `pgda-demo-v1`). It adds
verified NASA PSR distances/mask and 30 approved IAU feature centers. Coverage is still
20 km square, and terrain horizons remain 5 degrees. Event bracketing refinement and
sampling/spatial sensitivity are now implemented; formal confidence bounds, full-cap
ranking, 5 m terrain, fine azimuth refinement and date-specific regional shadow frames
remain outside this release. Mission text interpretation uses a transparent local grammar,
not a hosted LLM. The container build remains unexercised because Docker is unavailable.
