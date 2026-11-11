# Lunar cap implementation verification

The data workstream is implemented on `codex/lunar-data-coverage`. It provides the
complete cap dataset and backend data-access contract. The guided interface and
selective request integration are now connected, as described in
[the integration verification](cap-ui-integration.md). Public job execution and
hosting remain separate work.

## Prepared coverage

- Dataset: `lunar-south-cap-v1`, 87–90°S, all 88 nonempty 20 km tiles.
- Grid accounting: 103,996 valid sites, zero source-validity exclusions, no missing
  grid locations or duplicate IDs. Exact pole excluded by the original convention.
- Profile: 500 m candidates, 80 m DEM, published 1 km slope/roughness products with
  100 m baselines, 5° horizon bearings, 2 m observer, terrain rays through 200 km.
- Available: terrain, cached horizons, display terrain and approved feature centers.
- Unavailable: cap PSR proximity/display, DEM confidence and 5 m hazards.
- Catalog SHA-256:
  `1f888d6b6daa4a4b550b0017fe60064d027385ecd4de200d90abd560d0fd759f`.

The default `pgda-demo-v1.1` patch remains independently usable with all 1,680
candidates, its original PSR layer and its original frozen scoring bounds.

All 88 preparation measurements are retained. Their summed worker elapsed time
was 1,727.63 seconds; peak offline process memory was 894,623,744 bytes. Summed
worker time is not end-to-end elapsed time when workers run concurrently.

## Evidence

The backend and preprocessing suite passes 69 tests. Ruff passes, and the original
terrain/kernel manifest verifies. New checks cover exact validity accounting,
corruption, coordinate/ID agreement, missing artifacts, stable site lookup,
longitude wrap, pole/boundary/seam circles, order-independent area membership,
byte-budget eviction, release-wide scoring references and stale/damaged caches.

Source replay checked nine sites in tiles 0–3, 5–5 and 9–6 directly against the
original full rasters. Elevation, slope, roughness and blocker ranges matched
exactly; maximum horizon-angle difference was zero degrees. The analytic flat
sphere, directional ridge and missing-terrain regression fixtures also pass.

A fresh-process loader benchmark used a 2 MiB resident array budget. Peak process
working set was 41,467,904 bytes (39.55 MiB). The three sampled circles opened
four, two and two intersecting tiles, respectively. Resident scientific arrays
peaked at 1,184,288 bytes; the benchmark did not read raw DEMs or load the whole
cap. This measurement covers the loader, excluding ephemeris computation,
temporal analysis, request concurrency and JSON serialization.

Complete exact-cache, assembled-reference and clean-package evidence is recorded
in the generated `release-validation.json`, `release-manifest.json` and adjacent
archive receipt. Those files are the authority for the final package's hashes,
download size, sampled scalar/batch differences and shortlist equivalence.

All 88 exact October 2028 caches pass verification. Across 264 scalar spot checks,
the maximum metric difference was 1.11e-16. The 109-site seam circle had zero
cached/direct metric difference and identical eligible-set and shortlist order.
Every tile row matched the offline assembled reference. The release package
passed checksum verification and scientific reload after clean extraction.

## Handoff

Follow [the release guide](lunar-cap-release.md) for commands, array schemas,
catalog geometry, exclusion reasons, scoring references, loader calls, exact
cache consumption and packaging. Generated archives are under
`deliverables/lunar-cap-release/`; the archive receipt records a successful clean
extraction and reload. Large artifacts are intentionally excluded from normal
Git commits. The immutable local package is ready for distribution after review;
this implementation does not publish a release or modify a hosted deployment.
