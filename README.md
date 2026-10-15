# Lumen

A working lunar south-pole comparison MVP based on the
[GitHub implementation plan](https://github.com/Surya-Mandalapu/lumen/blob/main/LUNAR_LANDING_SITE_PLAN.md).
Configure a mission, filter and rank real candidate locations, inspect terrain and sky
geometry, and compare two sites under the same window.

## Run locally

Requires Node.js 22+ and Python 3.12+. From the repository folder:

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

## Try the MVP

1. Keep the prepared study area, October 1-31, 2028 window, maximum slope 10 degrees,
   and minimum Earth line-of-sight availability 50%.
2. Select **Find candidate sites**. A monthly search normally takes around 5 seconds
   on the development machine; time depends on constraints and hardware.
3. Select a numbered site in the terrain/2D map or shortlist. Move the time slider
   to inspect Sun/Earth clearance against the terrain horizon.
4. Compare the two initially pinned sites, or replace either pin. Adjust priorities
   and run again to change ranking without changing the underlying science metrics.
5. Export the full JSON analysis: request, raw metrics, timelines, horizons, applied
   weights, algorithm assumptions, kernel hashes and terrain provenance.

## Exploration workspace

The plan's next workflows are now available:

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

Actual-kernel integration tests run when `prepare:data` has completed; CI prepares kernels
before API tests. Browser smoke checks covered the full search/inspect/compare/export
journey, empty searches, reruns, and mobile layout.

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
Terrain: [NASA PGDA product 90](https://pgda.gsfc.nasa.gov/products/90), Barker et al.
(2023), PSJ 4, 183. Ephemerides: [NASA/JPL NAIF](https://naif.jpl.nasa.gov/naif/data_generic.html).
Moon context: NASA Goddard Space Flight Center,
[SVS 14959](https://svs.gsfc.nasa.gov/14959/). Asset provenance is in
[the assets README](apps/web/public/assets/README.md).

Comparative planning indicators only. Not flight certified; not a landing-safety
assessment or a guarantee of RF communications coverage. No NASA endorsement implied.
