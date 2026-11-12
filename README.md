# Lumen

A lunar southern-hemisphere explorer and detailed south-pole comparison app based on the
[GitHub implementation plan](https://github.com/Surya-Mandalapu/lumen/blob/main/LUNAR_LANDING_SITE_PLAN.md).
Configure a mission, filter and rank real candidate locations, inspect terrain and sky
geometry, and compare two sites under the same window.

The workspace opens on a topographic Moon with labeled landmarks, textured Earth
and Sun models, native fullscreen, and a JPL-driven orbital timeline. Place lookup
and saved areas are compact tools beside the model. Narrow to prepared polar
coverage for detailed site comparisons. The performance target is a successful
average below 30 seconds for each search type; a separate two-minute watchdog
protects against stalled calculations. See [3D planner details](docs/orbital-planner.md).

## Run locally

Requires Node.js 22.12+ and Python 3.12+. From the repository folder:

```powershell
npm install
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -e "./backend[dev]"
npm run prepare:data
npm run dev
```

Open [Lumen](http://localhost:5173). The API is at
[http://localhost:8000/docs](http://localhost:8000/docs).

The small NASA-derived terrain bundle and context Moon model are included.
`prepare:data` downloads and verifies approximately 44 MB of pinned JPL kernels once.
After preparation, searches run locally without external science-data services.
Missing or corrupt science inputs return an explicit unavailable error.

The guided planner opens the topographic 3D Moon first. Select **Go to my site** to
inspect your area, or use coordinates and **Find a place** beside the model.
**Earth orbit** shows lunar motion as you scrub or play the scene timeline.
An installed, verified `data/derived/lunar-south-cap-v1/catalog.json` enables the
full 88-tile, 103,996-site cap automatically. Without that release the app clearly
advertises the smaller bundled patch. `LUMEN_DATA_ROOT` explicitly overrides the
selection. See [cap/UI integration and installation](docs/cap-ui-integration.md)
for the release package, scientific checks and hosting instructions.

## Try the MVP

### Global point preview

Choose a southern-hemisphere point outside detailed polar coverage, then use
**Preview this point** in the study-area panel. It previews coarse terrain,
sunlight and geometric Earth visibility for the selected dates. This uses a separate 16-pixel
per degree LOLA grid (about 1.9 km north–south), not the regional landing-site
ranking engine. It provides no landing-safety, fine slope/roughness or PSR assessment.

Prepare the optional global bundle once, after installing the preprocessing
requirements and preparing the JPL kernels:

```powershell
python -m pip install -r scripts/data/requirements.txt
npm run prepare:global
```

The source TIFF and generated global bundle stay outside Git. The script verifies
the pinned NASA source hash and records the elevation encoding and artifact hash.
Source and grid conventions: [NASA SVS CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/).

### Regional search

1. Choose a circle within the advertised prepared coverage. Local cap searches
   allow up to 5 km radius and seven days. A partial intersection requires explicit acknowledgment.
2. Continue to the mission, set dates and priorities, review, then select
   **Find candidate sites**. The full-cap option uses the exact October 1–31, 2028
   cache. Supported local searches calculate their own requested window.
3. Start with three candidate cards. Select **Inspect site** for terrain, timeline,
   horizon and source evidence; reveal the remaining candidates when needed.
4. Pin two sites for a same-window comparison. Adjust priorities and rerun to
   change ranking without changing the underlying science metrics.
5. Export the full JSON analysis: request, raw metrics, timelines, horizons, applied
   weights, algorithm assumptions, kernel hashes and terrain provenance.

## Exploration workspace

The plan's next workflows are now available:

- **Area preview**: an expandable polar coverage map selects a circle center by click or
  keyboard, with partial-coverage disclosure and separate source, candidate and display scales.
- **Result explanations**: the selected shortlist site's weighted score contributions and
  applied constraint evidence, a selection funnel, and same-window comparison tradeoffs.
  These use existing results without additional analysis requests.
- **Mission briefs**: a local, documented phrase parser turns dates, approved landmarks,
  numeric constraints and priorities into a reviewable draft. Apply it to the form before
  running a search. This is deterministic text interpretation, not an LLM or a science engine.
- **Mission library**: four representative presets, named browser-local configurations,
  and validated JSON import/export. Results are not persisted or mixed across windows.
- **Advanced filters**: roughness, elevation bounds, continuous sunlight/Earth opportunity,
  mapped PSR distance and selected approved-feature center distance.
- **Real science proximity**: a NASA 20 m PSR mask and 30 IAU-adopted feature centers.
  The PSR overlay displays 200 m area fractions; feature distances are to official centers.
- **Candidate layers**: planning score, sunlight and Earth visibility at every eligible
  candidate point. Select any point for its actual site analysis, including unshortlisted sites.
- **Local sky**: interactive 3D east/north/up directions, horizon and apparent Sun/Earth
  paths, synchronized with the selected site's timeline. Diagram sizes are not physical scale.
- **Timeline playback and CSV**: animate the mission and export the complete sampled series.
- **Events and blockers**: refine bracketed state changes to at most 60 seconds, inspect
  intervals and approximate blocking-terrain coordinates, and export site evidence.
- **Scenario lab**: compare +12/+24-hour arrival shifts, nearby 500 m/1 km grid locations,
  and a 2.5-minute time grid, with metric deltas and constraint status. The original search
  stays unchanged until shifted dates are explicitly applied and rerun.

## Implemented scope

- 1,680 real NASA LOLA candidate locations, spaced 500 m across a 20 x 20 km polar square.
- Orbitable 3D terrain, accessible 2D candidate map, NASA textured Moon context.
- Dates, coordinate/radius searches, constraints, normalized priorities and explicit empty states.
- Sun `CN+S` and outgoing Earth `XCN+S` directions in `MOON_ME_DE440_ME421`.
- Curvature-aware horizons to 200 km, finite solar disk, 5-minute timelines and local sky paths.
- Hard filtering before fixed-utility scoring, five-site shortlist with 1.5 km separation.
- Two-site comparison, raw metrics, weighted contributions and reproducibility export.
- Responsive layout, keyboard controls, chart table equivalents and methods disclosure.

This is a **curated MVP**, not completion of the entire regional plan. Full 87-90 degrees
south coverage, 1-degree/refined terrain horizons, DEM quality masks, formal confidence/uncertainty
propagation and optional 5 m tiles remain future work. Detected time transitions are now
refined, while shortlist scores retain the reproducible five-minute integration. Horizon bins are 5 degrees and can miss narrow ridges. Terrain source is
80 m; published 100 m-baseline slope/roughness are sampled from 1 km output grids.
Displayed terrain uses a 250 m grid with 1.5x vertical exaggeration and illustrative lighting.
See [scientific conventions](docs/scientific-conventions.md).

## Verification

```powershell
npm test
npm run build
npm run verify:data
python -m ruff check backend scripts
# Optional preprocessing regressions (requires scripts/data/requirements.txt):
python -m pytest scripts/data/test_prepare_terrain.py scripts/data/test_prepare_science_layers.py
```

For repeatable local search timings after preparing the kernels, run
`python scripts/benchmark_search.py --repeat 2`. It reports loading/filtering,
ephemeris, site-analysis and response-assembly times for the October 2028
full-patch search. The first run includes cold cache work; later runs reuse
the in-process dataset and ephemeris caches.

Actual-kernel integration tests run when `prepare:data` has completed; CI prepares kernels
and the optional global terrain before API tests, including the real near-side, far-side
and polar previews. CI also runs the data-preparation regressions.

To repeat the desktop/mobile browser checks against the production build:

```powershell
python -m pip install playwright
python -m playwright install chromium
npm run build
# In a separate terminal with the virtual environment active:
python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
# Then:
python scripts/browser_smoke.py
```

The browser check covers regional coverage selection, explanations, comparison,
exports, stale/empty results, global terrain/timelines, service-error recovery and
390 px mobile layouts. Reports, exports and screenshots stay in ignored
`data/cache/demo-qa/`. See [demo verification](docs/demo-integration-verification.md).

## Docker

```powershell
docker compose up --build
```

Open [http://localhost:8000](http://localhost:8000). The image downloads and verifies
pinned kernels during its first build and includes the prepared terrain bundle.

## Rebuild scientific inputs

The raw raster files are not committed. To reproduce the curated terrain bundle:

```powershell
python -m pip install -r scripts/data/requirements.txt
python scripts/data/prepare_terrain.py
python scripts/data/prepare_science_layers.py
npm run prepare:data
```

See [the data workflow](scripts/data/README.md) for checksums, source products and sampling.

### Opt-in 87°S–90°S terrain bundle

The cap builder partitions 500 m candidate locations into 88 nonempty, 20 km
projection tiles. Each tile derives real terrain and horizon values from the
pinned NASA rasters. The assembler refuses incomplete or corrupt coverage.

```powershell
python -m pip install -r scripts/data/requirements.txt
python scripts/data/prepare_cap.py
python scripts/data/verify_cap_tiles.py --require-complete
python scripts/data/assemble_cap.py
```

Set `LUMEN_DATA_ROOT` to `data/derived/lunar-south-cap-v1` to run against the
assembled cap instead of the bundled 20 km patch. Large cap artifacts remain
outside Git. It reuses the verified IAU feature-center catalog but does not
include PSR proximity, DEM confidence masks, or 5 m hazard assessment. A 2 km
NASA terrain overview is for display only. The default
checkout continues to use the small curated patch.

Before a live full-cap demo, run `python scripts/data/precompute_window.py`
with `LUMEN_DATA_ROOT` set. This computes exact five-minute metrics for every
candidate in the October 2028 window once and stores a versioned cache under
ignored `data/cache/`. Searches with that window can then change constraints
and priorities without repeating Sun/Earth calculations. Other windows still
run the exact calculation and may have a long first-search delay.
Terrain: [NASA PGDA product 90](https://pgda.gsfc.nasa.gov/products/90), Barker et al.
(2023), PSJ 4, 183. Ephemerides: [NASA/JPL NAIF](https://naif.jpl.nasa.gov/naif/data_generic.html).
Moon context: NASA Goddard Space Flight Center,
[SVS 14959](https://svs.gsfc.nasa.gov/14959/). Asset provenance is in
[the assets README](apps/web/public/assets/README.md).

Comparative planning indicators only. Not flight certified; not a landing-safety
assessment or a guarantee of RF communications coverage. No NASA endorsement implied.

### Local-area rankings and 3D result locations

Outside detailed polar coverage, **Rank this area** compares a 2 km lattice of
locations inside the selected 1–5 km circle by sunlight and Earth visibility over
up to seven days. This coarse ranking does not invent fine terrain assessments or
screen the detailed mission's hard constraints. **Places to consider → View sites
on 3D Moon** shows shortlisted and returned eligible locations, with marker
selection and site inspection. See [local-area ranking](docs/local-area-ranking.md).
