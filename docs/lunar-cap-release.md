# Lunar south cap data release

This implements the data and coverage assignment in team handoff 1. The target is
all 88 nonempty 20 km tiles in the 87–90°S cap at 500 m candidate spacing. A release
is complete only after every one of the 103,996 nonpole grid locations is present
once as a candidate or an explicitly reasoned exclusion. The default legacy patch
remains a separate dataset. The application selects the installed cap when its
catalog is present, otherwise the bundled patch; `LUMEN_DATA_ROOT` overrides this.

## Prepare and verify

Use Python 3.12 and the repository's preprocessing environment. Commands below are
PowerShell commands, issued at the repository root. Large outputs stay out of Git.

```powershell
python -m pip install -e './backend[dev]' -r scripts/data/requirements.txt
python scripts/data/prepare_kernels.py

# Representative measurements, rather than whichever two tiles sort first.
python scripts/data/prepare_terrain.py --cap-tile 5 5
python scripts/data/prepare_terrain.py --cap-tile 0 3

# Resumes only verified artifacts with matching settings. Default workers = 1.
# Allow at least 1 GiB available memory per offline worker; use --workers 2 locally.
python scripts/data/prepare_cap.py --workers 2
python scripts/data/verify_cap_tiles.py --require-complete
python scripts/data/assemble_cap.py

# Fixed October 1 00:00 UTC through October 31 00:00 UTC, 2028, five-minute grid.
python scripts/data/precompute_cap_window.py
# Optional in a second terminal while terrain preparation runs:
# python scripts/data/precompute_cap_window.py --follow

python scripts/data/verify_cap_reference.py
python scripts/data/benchmark_cap_loader.py
python scripts/data/verify_cap_release.py
python scripts/data/package_cap_release.py
```

The two benchmarks on this workstation initially took 32.04 s for 1,599 interior
candidates and 8.25 s for 427 boundary candidates. Peak offline process memory was
about 893 MB. Both had zero exclusions. These measurements imply roughly 35
minutes of serial horizon work, plus process startup and integrity checking, for
the full candidate count; they are not cloud performance promises. Later tiles
can differ. `measurement.json` in each tile records actual preparation timing,
size and memory. `raw_source_bytes_read` in that report is the sum of source file
sizes scanned for integrity (192,183,050 bytes); it is not a measurement of physical
disk traffic, GDAL block requests or OS cache misses. `raster_array_bytes` records
the decoded full-raster payload, 233,997,312 bytes. No windowed raster optimization
is introduced, so the full buffered source remains available to every horizon.

Preparation writes metadata last, using atomic replacement. `prepare_cap.py`
holds `.prepare.lock` to prevent two coordinators writing the same tile. After an
unclean process termination, confirm that no preparation subprocess remains
before removing a stale lock and resuming. Corrupt or incompatible existing tiles
are rejected; a metadata filename alone never makes a tile reusable. Direct
`prepare_terrain.py` commands are for distinct offline benchmark tiles and should
not be run on a tile already being prepared by the coordinator.

`assemble_cap.py` is an offline reference/compatibility tool. It writes a combined
NPZ, display overview, approved feature centers and a frozen catalog. Never run
preparation or assembly at public-service startup. Its combined NPZ is not the
selective runtime loader.

## Catalog and artifact contract

`catalog.json` schema version 1 contains:

| Field | Meaning |
| --- | --- |
| `dataset_version`, `catalog_sha256` | Dataset identity and canonical content checksum |
| `coordinate_frame`, `reference_radius_m`, `projection` | MOON_ME_DE440_ME421, 1,737,400 m sphere and exact south-polar stereographic definition |
| `longitude_convention` | Degrees east in [-180,180) |
| `coverage` | 87–90°S, 500 m candidates, exact pole excluded |
| `tiles` | Stable IDs, metadata paths/hashes, counts, artifacts and validity paths |
| `footprint` | Exact projected rectangle intersected with latitude ≤ -87°, excluding the pole |
| `layers` | Available terrain/horizons/feature centers and explicitly unavailable layers |
| `sources`, `preparation_settings` | Pinned NASA hashes and scientific sampling recipe |
| `scoring_reference` | Named, frozen release-wide 5th/95th percentile utility bounds |
| `verification` | Complete grid accounting, valid/excluded totals and missing tile list |

The analytic footprint definition is authoritative; a display mesh rectangle is
not evidence that every point in it has usable data. Each tile's `exclusions.json`
lists exact unavailable grid coordinates, stable IDs and reason codes:
`missing_candidate_source` or `missing_horizon_source`. Both producer and verifier
use validity schema 1. This extends the earlier all-points-valid contract: backend
coverage counts must reconcile candidates plus exclusions rather than silently
accepting omissions. Missing buffered horizon samples remain invalid, never clear.

Tile rectangles own their left/bottom edges and exclude their right/top edges.
IDs retain `lola-{x:+06d}-{y:+06d}`. Adjacent tiles never duplicate seam candidates.
Within a tile, scalar arrays have shape `(N,)`; `horizons_deg` and
`blocker_distance_m` have shape `(N,72)`; `horizon_azimuth_deg` is `0,5,...,355`.
All numeric candidate and horizon values must be finite. NPZ uses no pickles.

Small reproducible fixtures live in `scripts/data/cap_test_support.py`; these are
explicitly synthetic scientific tests, never application fallback data. The
`cap` fixture in `backend/tests/test_terrain_store.py` generates the complete
catalog contract, representative seam tiles and a reasoned source exclusion.
Use these fixtures to develop request handling before downloading the release.

## Backend integration interface

```python
from pathlib import Path
from app.services.terrain_store import TerrainStore

store = TerrainStore(
    Path('data/derived/lunar-south-cap-v1'),
    max_cache_bytes=32 * 1024 * 1024,
    expected_catalog_sha256=DEPLOYMENT_PINNED_CATALOG_HASH,
)
catalog = store.catalog()                 # Small verified contract; no tile opened.
tile_ids = store.intersecting_tiles(-89.99, 0, 3)  # Conservative circle lookup.
arrays = store.load_area(-89.99, 0, 3)     # Exact spherical membership; sorted IDs.
site = store.site('lola-+20000-+10000')     # One row; deterministic tile ownership.
centers = store.features()                # Verified official center catalog.
holes = store.exclusions('tile-5-5')       # Explicit unavailable locations.
trace = store.trace()
```

Circle arguments are latitude degrees, longitude degrees east and radius km.
Lookup uses a conservative stereographic scale bound, then exact great-circle
candidate membership. It can open a boundary tile containing no selected sites;
it never opens all neighbour tiles just to obtain surrounding terrain. Cached
horizons already include the surrounding-terrain calculation through 200 km.

The LRU budget counts decompressed resident NumPy arrays. It evicts before adding
a tile, rejects a tile larger than the budget, and returns read-only tile arrays.
`trace()` reports resident/peak bytes, tile IDs, cache hits, evictions, total array
bytes loaded and artifact bytes verified. Open history retains the most recent
512 entries and `tile_open_count` retains the cumulative count. Artifact bytes
verified are file sizes, not measured physical disk traffic. Area results and
caller-retained arrays are separate allocations; the job owner must budget them,
ephemerides, analysis batches and response serialization as well. A 2 MiB cache
benchmark alone does not establish the complete app's hosting memory limit.

The loader verifies hashes when opening a tile. Release directories are immutable;
deploy a new store instance for a new release, rather than editing files under an
active cache. Pin the catalog hash in deployment configuration. A catalog's own
checksum detects accidental changes; the external pin identifies the trusted
release. Missing/corrupt artifacts raise `DataUnavailable`.

The guided planner's coverage, area search and site-inspection endpoints now use
this loader through `repository.py`. Cap requests apply public area/window limits
and use the per-tile exact cache for the full-region demo. The legacy adapter is
retained for the patch. Public job execution and hosting remain separate work;
see [the integration guide](cap-ui-integration.md) for installation and checks.

## Scoring and exact demo metrics

The cap has its own named reference
`lunar-south-cap-v1-terrain-p05-p95-v1`. Catalog construction computes its bounds
once across all valid cap candidates. Search and site inspection share
`scoring_reference.py`; cap data without a frozen reference is rejected. Legacy
`pgda-demo-v1.1` retains its original full-patch bounds in
`backend/app/data/legacy-scoring-reference.json`. Scores must never recompute
percentiles from just the circle or the tiles currently in the cache.

`demo-cache/tile-X-Y.npz` holds seven exact temporal metric columns keyed by
stable candidate IDs, with a companion JSON manifest. Identity includes terrain
artifact hashes, named scoring reference, pinned kernel hashes, UTC start/end,
five-minute step, temporal algorithm version/source hash and ephemeris code hash.
The preparation script checks three representative sites per tile against the
scalar engine before accepting its cache. These are sampled numerical checks,
not independent validation of the physical model.

Backend code uses `tile_metrics.cache_identity` and `load_tile_metrics` with the
expected tile metadata, reference ID, kernels, dates and complete tile ID array.
The reader verifies identity, bytes, SHA-256, row order, shapes and finiteness. It
returns `None` for an absent, stale or damaged optional cache; the job must then
compute directly or report that the requested job exceeds its budget. Do not
substitute another mission window. Raw temporal metrics are independent of
ranking preferences; apply hard constraints and release-wide scoring afterward.

The original assembled `precompute_window.py` path remains available. Its cache
now also requires an integrity sidecar, and its key includes scoring reference
and catalog identity. The cap release uses the selective per-tile layout instead.

## Validation and distribution

`verify_cap_tiles.py` checks every tile's pinned sources, common recipe, artifact
hashes, grid membership, ID/coordinate agreement, array schemas, blocker ranges
and exact candidate/exclusion partition. Full completion requires all 88 tiles.

`verify_cap_reference.py` replays nine sampled sites from interior and boundary
tiles against the original full NASA rasters, checking elevation, slope,
roughness, horizon angles and blocker ranges. It preserves the original method;
it does not introduce or claim a new independent science model.

`verify_cap_release.py` compares every tile row with the assembled reference,
checks all 88 exact caches, checks seam/pole/wrap/boundary circle membership and
compares the full eligible set and shortlist ordering of a tractable seam search
with cached versus uncached metrics. `loader-benchmark.json` measures a fresh
process separately from offline source replay. Unit tests additionally check
corrupt inputs, invalid exclusions, stale/damaged caches and loader order/eviction.

`package_cap_release.py` requires these reports, bundles all tiles, display and
feature data, exact caches, source/code provenance, checksums and dependency
versions. Its archive name includes the release-manifest hash. It verifies every
file after clean extraction and reruns release validation from that directory.
The adjacent JSON receipt gives the archive SHA-256, compressed/uncompressed size
and clean-reload result. The package includes kernel provenance, but not the large
kernel binaries: prepare them separately using their pinned manifest.

Generated packages appear under `deliverables/lunar-cap-release/`; generated
source data remains under ignored `data/derived/lunar-south-cap-v1/`. Share the
archive together with its receipt, and pin both the archive and catalog hashes.
Publishing to an immutable artifact URL is a distribution step after review;
local generation does not publish anything to GitHub or change a hosted app.

PSR distance/display across the cap, DEM confidence masks and 5 m hazard analysis
are unavailable. The legacy PSR crop is never reused to suggest cap-wide support.
Feature distances refer to approved center points rather than crater rims or
routes. Candidate spacing, 80 m source DEM, published 1 km slope/roughness grids
with 100 m baselines, 5° horizons, 2 m observer, lunar frame/radius, curvature,
finite solar disk and Sun/Earth corrections keep their existing meanings. Whole
Moon coarse previews remain separate from detailed cap candidate ranking.
