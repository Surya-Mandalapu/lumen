# Lumen area-first expansion proposal

Inspected October 18, 2026. This is a proposed implementation sequence, not a change to the running scientific engine.

**Recommended first release.** Let users select a circle on a georeferenced polar map within the verified 20 × 20 km patch, confirm coverage and analysis settings, then configure dates, constraints and priorities. Partition the existing prepared data so only intersecting candidate tiles and visible display tiles load. Preserve the current calculations. After equivalence tests pass, prepare one adjoining 10 × 10 km tile from the same pinned sources to demonstrate real coverage growth. Broad discovery and hemisphere processing follow separate validation gates.

**What exists and what needs to change**

| Component | Inspected implementation | Expansion implication |
| --- | --- | --- |
| Interface | `App.tsx` fetches the entire terrain display on mount; `MissionForm.tsx` already has area before dates but defaults to the full patch. Coordinate circles and approved-feature radii exist. | Make map selection and coverage review the explicit first action; reuse existing mission controls. |
| Geographic views | `GlobeScene.tsx` is a contextual Moon model with a planned-cap ring, not a geographic selector. `TerrainScene.tsx` includes a hardcoded ±10 km feature boundary. | Start with an accurately georeferenced 2D polar selector and keyboard coordinate controls. Derive extents from metadata. Add globe picking only after texture/frame alignment is verified. |
| Data loading | `dataset.py` verifies all bundle artifacts, decompresses/copies the whole NPZ and caches up to four bundles. `search.py` applies the regional mask afterward. | Add a small verified catalog and indexed tile loading; bound caches by bytes rather than bundle count. |
| Preparation | `prepare_terrain.py` reads entire source rasters and generates a fixed 500 m candidate grid. Horizons are calculated offline using terrain out to 200 km. | Parameterize candidate footprint; use windowed raster reads with interpolation support and explicit terrain dependencies. Keep expensive horizon preparation offline initially. |
| Engine | `search.py` analyzes every terrain-filter survivor at five-minute steps; there is no coarse prefilter. `sites.py` shares analysis code for inspection/scenarios. | Preserve this direct-analysis path and route search, inspection and scenarios through the same tile repository. |
| Ranking | Terrain percentiles are calculated from the complete loaded dataset in both search and inspection. | Persist release-level reference anchors before introducing partial loading. Computing tile-local percentiles would silently change scores. |
| API | `/region` mixes actual coverage and planned scope; validation uses a hardcoded 87–90°S cap and can estimate planned-cap candidates when data is missing. Search responses embed full finalist timelines and all eligible map points. | Separate coverage, readiness and plans; derive support from verified catalog geometry; return unavailable when required inputs are missing. Add compact responses and on-demand detail. |
| Provenance | Verified source/artifact hashes, pinned kernels, frames, algorithm settings, canonical UTC, stable candidate IDs and reproducible exports already exist. | Extend these records rather than replacing them. |

**Keep these quantities separate in controls, results and exports**

| Quantity | Current supported value | Meaning |
| --- | --- | --- |
| Geographic coverage | Prepared 20 × 20 km projected square, excluding the pole candidate | Where supported candidate analysis exists; not the whole polar cap or global Moon texture. |
| Candidate spacing | 500 m | Distance between evaluated locations; not terrain measurement accuracy. |
| Source-data pixel scale | 80 m DEM; slope/roughness on 1 km grids with a 100 m baseline | Source sampling and metric definitions; pixel scale alone is not effective resolution or uncertainty. |
| Horizon sampling | 5° azimuth; 80 m radial steps to 20 km, then 320 m to 200 km | Surrounding-terrain sampling used in visibility calculations. |
| Temporal sampling | 5 minutes; separate inspection refinement of bracketed transitions to ≤60 seconds | Integration grid versus event-time refinement. |
| Display detail | 250 m terrain grid, 1.5× exaggeration; PSR overlay at 200 m | Rendering choices, never substituted for calculation inputs. PSR distances use the 20 m source mask. |

Expose named, versioned analysis profiles with those separate fields. Initially offer only the existing supported profile: 500 m candidates, 80 m DEM and existing horizon/time settings. Requests must identify it; reject unsupported settings with available alternatives. Do not silently downsample an area request, imply 5 m support, or label a denser candidate grid as higher source accuracy. Keep legacy requests mapped explicitly to the legacy profile.

**Primary workflow: selected-area analysis (Annotation 1)**

1. Load a lightweight coverage catalog and contextual preview, without loading the entire analysis dataset. Show prepared candidate coverage, surrounding horizon-terrain coverage, missing-data holes and unavailable layers with distinct legends. Planned coverage has a separate style and cannot be analyzed.
2. User clicks a center and sets a radius, enters coordinates, or chooses an approved named feature. Reuse the backend's authoritative feature resolver. Show the selected geometry, actual supported intersection, estimated candidates, profile and missing-data status before mission setup. Polygon drawing can follow later; it is currently explicitly unsupported.
3. For a partly covered selection, require an explicit choice to analyze the supported intersection and retain both original and effective geometry. An entirely unsupported selection is unavailable, not a successful search with no qualifying sites. Distinguish missing inputs from valid candidates rejected by mission constraints. Display coverage fraction and count definitions separately.
4. Configure dates, constraints and priorities, then analyze every supported candidate in the selected area at the requested profile. Preserve current date limits initially. Apply static and temporal hard constraints before ranking; direct regional analysis has no discovery screening stage.
5. Return compact raw metrics, ranking, rejection counts and coverage/provenance references. Fetch a selected site's full timeline, horizon and refined inspection on demand. Paginate or spatially tile candidate layers as coverage grows. Keep full reproducibility JSON/CSV available through a versioned export path with the same scientific evidence.

**Tiling and horizon dependencies**

Start with four nominal 10 × 10 km candidate partitions of the current patch. Use deterministic ownership at edges, including the outer boundary, so all 1,680 existing IDs occur exactly once. Verify the union against the original bundle. Display tiles are separately addressable and need only a small edge overlap to prevent visual seams.

Create a release catalog containing true projected/geographic footprints, frame/radius, layer availability, candidate validity masks and reason codes, tile IDs, profile IDs, source/derived hashes, source support footprints, metric definitions and fixed scoring anchors. Store candidate arrays/horizon tables per tile using the existing small NPZ approach initially; do not introduce a database just to index four tiles. Validate explicit array schemas instead of relying on matching array lengths to infer candidate fields.

Candidate selection and horizon terrain have different footprints. For preparation or a missing cached horizon, compute the union of the selected candidates' existing great-circle ray sample locations through 200 km. Read only source blocks intersecting those samples plus bilinear-interpolation support. A geodesic 200 km buffer is a conservative dependency envelope; a few adjacent tiles or an arbitrary viewport margin is insufficient. Deduplicate reads and batch candidates with a byte budget. Preserve the same sampling positions and reduction order while establishing equivalence.

For an already prepared profile, request-time analysis loads only intersecting candidate/horizon tiles. It does not need to reload the raw DEM: the horizon artifact records the verified source blocks and preparation recipe that produced it. If on-demand horizon generation becomes necessary, run that same dependency-aware preparation in a worker. Never crop a horizon to the user's selected area. Missing ray samples make the affected candidate unavailable, never clear; retain the exclusion reason for the map and export.

An expanded PSR distance preparation must again prove nearest-feature completeness outside its crop. Simply expanding the display mask or retaining the current 60 km crop is insufficient. Preserve feature-center distance definitions and fail explicitly when a requested hard metric is unavailable.

**Scientific compatibility and provenance**

Keep the pinned ephemerides, `MOON_ME_DE440_ME421`, source-frame convention, 1,737,400 m reference radius, 2 m observer height, Sun `CN+S`, Earth `XCN+S`, parallax, finite-disk geometry, curvature-aware horizon calculation, adjacent-bin maximum, five-minute duration-weighted integration and separate event refinement. Preserve hard filters, utility definitions, deterministic sorting and 1.5 km shortlist separation for the first polar expansion.

Compute and persist the exact current full-patch 5th/95th percentile scoring bounds before splitting files. Freeze these as a named legacy scoring reference, including for the first adjoining-tile experiment; disclose clipping beyond its bounds. A later broader reference distribution is an explicit versioned scoring change, not an incidental result of which tiles were loaded. Search, site inspection and scenarios must use the same anchors.

Export original/effective area, requested/effective profile, coverage holes and exclusion reasons, dataset/catalog version, used tile IDs/hashes, horizon source dependencies, preparation/engine versions, kernel hashes, frames, applied weights, scoring reference, sampling settings and any discovery lineage. Include these in reproducibility identity; keep operational measurements outside scientific identity. Equivalent area/profile requests must produce the same science regardless of tile partition, tile order, cache state or execution location. Old byte-level exports/IDs may differ under a new schema; verify metrics and ordering explicitly and retain a legacy reader/path.

**Optional discovery workflow (Annotation 2)**

Offer a separate entry: “Help me find an area.” Initially search only verified prepared coverage. Let users choose a coverage extent and an advertised screening profile. Do not route ordinary circles or regional analyses through this workflow.

Use versioned coarser candidate spacing and, if validated, cheaper horizon/time settings to suggest promising regions. Publish each actual screening setting, approximation and coverage gap. Explain that screening can miss small favorable sites and brief opportunities; an unsampled or rejected region has not been proven unsuitable. Evaluate recall against exhaustive direct analysis on manageable representative areas before making discovery a default recommendation.

Retain several spatially diverse regions for refinement, rerun each at the user's supported final profile, and apply final constraints/ranking to those refined results. Preserve screening/refinement lineage. Report completeness only over refined areas, never claim the best location across the entire screened region. Whole-coverage or eventual hemisphere discovery requires both verified scientific coverage and measured compute capacity. A global texture is not an analysis dataset.

The existing south-polar projection and projected-distance diversity rule cannot simply be stretched over a hemisphere. Broader releases need appropriate spatial indexing/projections or spherical distances, frame/longitude/pole checks, validated source mosaics, seam/no-data treatment, surrounding horizon coverage and review of science-layer applicability. No hemisphere data source is selected or claimed ready here.

**Hosting and measurement (Annotation 3)**

Measured local baseline: Windows 11, Python 3.12.7, bundled `pgda-demo-v1.1`, real pinned kernels; October 1–31, 2028; maximum slope 10°; minimum Earth visibility 0.5; priorities 40/40/20. Each case used a fresh process and three serial TestClient requests. First request includes cold application caches; it is not a hosting cold start. File/OS caches were not cleared.

| Request | Region / terrain-pass / temporal-pass / shortlist | First / repeat seconds | JSON bytes | Offline gzip bytes | Process peak working set |
| --- | --- | --- | --- | --- | --- |
| 3 km circle at 89.9°S, 0°E | 110 / 12 / 11 / 2 | 1.487 / 0.295 / 0.384 | 5,755,307 | 732,596 | 127,705,088 bytes (~122 MiB) |
| Full prepared patch | 1,680 / 392 / 265 / 5 | 5.475 / 4.874 / 4.767 | 14,491,767 | 1,866,398 | 198,258,688 bytes (~189 MiB) |

The process peaks include Python, TestClient, JSON serialization/decoding and retained responses; they are neither isolated engine allocations nor deployment capacity estimates. Gzip was applied offline and is not evidence of HTTP compression. The local probe is saved at ignored `data/cache/benchmark_area_expansion.py`. The prepared NPZ is 619,013 bytes and display terrain JSON is 118,411 bytes; small input bundles can still produce large timeline responses.

Initially retain the static React build and existing Python/FastAPI runtime, with local preparation and immutable prepared artifacts. The existing Docker packaging is an available deployment starting point, not a verified hosting result. Free static hosting is a feasibility target; live Python/SPICE analysis still needs a compatible compute runtime. A static-only deployment can present clearly labeled precomputed cases but cannot promise arbitrary date analysis. Choose no vendor or paid infrastructure until deployment measurements and current limits are checked.

Before host selection, measure cold startup, RSS/peak memory, CPU/wall time, uncompressed/compressed responses, serialization time, tile reads/bytes, cache hit rate and browser memory for short and 31-day windows, broad/strict constraints, cross-tile requests and bounded concurrent load. Instrument preparation separately, including raw-source read volume and horizon-generation peak memory/runtime. Establish headroom against the chosen provider's actual memory, timeout, storage and egress limits; three local samples do not establish p95 or concurrency capacity.

Define a local/remote `TerrainStore` interface now. As measured limits require, move immutable tile artifacts into separate object storage with checksum-addressed URLs and bounded local caches. Move long analyses into Python worker processes behind a durable job interface: submit, status/progress, cancellation and result/export retrieval. Carry full request/catalog/profile versions into every job and make retries idempotent. Keep SPICE's process-global lock within each process and budget concurrency by memory. Client AbortController cancellation alone does not cancel running backend work.

Restrict supported area/profile/window combinations to measured budgets and return an explicit limit or queued-job option when exceeded. Account for preparation, worker CPU, storage, requests and egress. Hemisphere processing has no free-cost commitment.

**Build order and verification checkpoints**

1. **Freeze compatibility and measure.** Save representative real-data outputs and exact scoring anchors. Record baseline science/coverage/size/timing measurements. Gate: current scientific tests and checksum verification pass; selected-site metrics and rankings are available for comparison.
2. **Tile the existing patch.** Generate four candidate tiles, separate display tiles, a validity/coverage catalog and dependency records. Add bounded indexed loading behind the legacy interface. Gate: candidate union is exactly 1,680 unique IDs; cross-boundary circles give identical metrics, horizon/blocker arrays, constraints and shortlist ordering; loader traces show unrelated candidate tiles are not opened.
3. **Ship the area-first interface and explicit profile.** Add map center/radius, accessible coordinate editing, supported-intersection review and missing-data states. Add compact summary/on-demand-detail responses with full exports. Gate: choose area → configure mission → inspect → compare → export works on desktop/mobile; unsupported profiles fail clearly; regional requests never invoke screening; stale requests cannot overwrite newer results.
4. **Prove actual growth with one adjoining 10 × 10 km tile.** Prepare only from the already pinned NASA products after checking valid source cells and full horizon/PSR dependencies. Keep existing profile/reference anchors. Gate: source/derived hashes verify; boundary and monolithic-reference comparisons pass; missing buffered terrain excludes affected candidates; measured input memory follows needed blocks rather than complete rasters. Publish the tile only after these checks.
5. **Validate optional discovery.** Add the distinct coarse-to-refined path over available coverage, disclosures and recall experiments against exhaustive selected-area analysis. Gate: approximations/omissions are visible and exported, and every final result is recomputed at its stated final profile.
6. **Scale only from evidence.** Benchmark expanded coverage and concurrency, then select separate storage/workers if needed. Broader polar coverage and hemisphere work require new verified releases and scientific/geospatial validation before being offered.

Current verification completed during inspection: 35 backend tests and 8 frontend tests pass; `verify_manifest.py --require-kernels` verifies terrain and kernels. No new UI, deployment, expanded terrain or browser QA is claimed by this planning change.

**Verified external source context**

[NASA PGDA product 90](https://pgda.gsfc.nasa.gov/products/90) documents cloud-optimized GeoTIFFs, the DE421 Mean Earth source frame, multiple polar terrain products and their different pixel scales and metric baselines. This supports investigating windowed reads and additional source-backed polar coverage; it does not establish arbitrary hemisphere coverage or scientific accuracy at the display/candidate spacing.
