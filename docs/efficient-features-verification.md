# Efficient presentation features — October 18, 2026

Implemented three compact additions using the existing scientific data and responses:

- An expandable study-area coverage preview with pointer/keyboard circle-center selection, partial/outside footprint disclosure, mission duration and separate geographic coverage, candidate spacing, DEM pixel scale and display detail.
- One expandable explanation for the selected shortlist candidate: strongest weighted contribution, category points and all applied numeric hard constraints. A separate collapsed funnel explains how the region becomes the shortlist. Constraint evidence uses unrounded returned metrics and the result's original request, not the currently edited form.
- A short tradeoff summary above the existing comparison table: sunlight availability, Earth visibility, longest Earth blackout and slope. Comparisons retain the same mission window and sampling. Score gaps below two points are described as near ties, following the existing UI convention.

The existing comparison, date-shift sensitivity and mission library are reused. No dependencies, endpoints, scientific calculations or automatic analyses were added. Scientific input files, filtering/ranking code and provenance/export formats are unchanged. Optional explanations and coverage information start collapsed. Selecting a different shortlist candidate resets the explanation panel. Editing a map selection marks old results as stale through the existing draft mechanism.

Coverage drawing is an approximate local polar-projection preview. Exact circle membership remains the backend's spherical calculation. The map does not fabricate confidence/error coverage: it explicitly identifies those masks as unavailable. Missing scientific inputs retain the current fail-closed API behavior. The current release still analyzes only prepared candidates in the existing 20 × 20 km patch; this change does not implement the larger tiling/discovery roadmap.

**Verification**

- Frontend: 15 tests pass, including all 12 numeric hard constraints, equality/zero/negative bounds, missing distances, unrounded constraint failures, applied score weights, opposing comparison tradeoffs, antimeridian/pole coordinates, footprint boundaries and authoritative named-feature resolution.
- Backend: all 35 tests pass, including real-kernel reproducibility and metric/timeline regressions.
- Production TypeScript/Vite build passes. The existing Three.js chunk-size warning remains; no rendering dependency was added.
- Headless Chrome verifies default collapsed state, map pointer/arrow-key selection, native coordinate-input validity, partial coverage, default search, funnel/explanations, comparison, complete provenance export, stale-result notice, actual submission of a map-selected circle and 390 px mobile layout. No page or console errors were observed.
- Request tracing confirms opening the new evidence/funnel/comparison panels issues zero additional API requests. Browser scientific export retains all 1,680 prepared candidates in the default region and the original five-site shortlist.

The first per-card explanation layout made narrow cards excessively tall when expanded. It was replaced with one full-width explanation for the selected candidate before final verification.

**Performance decision**

Before/after local probes used fresh Windows Python 3.12.7 processes, real pinned kernels, the same 30-day October 2028 full-patch request, three sequential TestClient calls and the same constraints/preferences. OS file caches were not reset. Peaks include the test client, JSON decoding and retained responses. These are small diagnostic samples, not production capacity or statistical significance claims.

| Measurement | Before | After |
| --- | --- | --- |
| First request | 5.312 s | 5.466 s |
| Warm requests | 4.689 / 4.883 s | 4.897 / 4.909 s |
| Warm mean | 4.786 s | 4.903 s |
| JSON response | 14,491,767 bytes | 14,491,767 bytes |
| Offline gzip response | 1,866,398 bytes | 1,866,398 bytes |
| Peak process working set | 198,328,320 bytes | 198,561,792 bytes |

The observed warm difference is about 2.4%, below the 10% local investigation threshold used for this change. No new analysis work exists to remove, no response-size growth occurred, and no material regression was observed. The final browser run also verifies that a map-selected circle reaches the existing area-filtered analysis rather than invoking full-patch or discovery screening.

The production build was compared against a separate copy of the tracked original frontend, using the same installed tooling. Added gzip-compressed entry JavaScript/CSS is 3,579 bytes combined (101,931 → 105,510 bytes). No new application package dependencies were added.

Local QA probes, request trace, downloaded export and screenshots are retained under ignored `data/cache/agent-browser/efficient-features-*`; the timing probe is `data/cache/benchmark_area_expansion.py`. These are local evidence, not runtime assets.
