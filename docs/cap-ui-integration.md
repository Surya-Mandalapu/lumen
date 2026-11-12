# Cap data and guided planner integration

The updated guided interface now uses the completed lunar cap through the
selective data repository. A locally installed full release enables 103,996
verified candidate locations across 88 tiles. The bundled legacy patch remains
available when the cap is not installed or is explicitly selected by environment.

## What was repaired

Previously the UI advertised a south-cap workflow while the running service
still searched the legacy 20 km square. Selections near 87°S therefore found no
locations. The new coverage endpoint also bypassed the selective tile loader.

Coverage previews, regional searches, site inspection and neighbour scenarios
now share the verified repository. Area searches open intersecting candidate
tiles, site inspection opens the owning tile, and metadata/display requests do
not decompress the combined cap NPZ. Ranking and inspection use the same frozen
release-wide scoring reference. The exact full-cap demonstration reads the
verified per-tile temporal cache; arbitrary local windows use the unchanged
five-minute scientific engine. Cap requests enforce the advertised area/window
limits on the server as well as in the interface.

Named landmarks resolve their official center on the server. The selection form
starts with a supported landmark and marks unavailable choices explicitly. A
stale imported center cannot move an approved named landmark. An unsupported
selection provides an action to return to a supported south-pole area.

## NASA Moon model

The first area view now displays the bundled official
[NASA SVS Moon model](https://svs.gsfc.nasa.gov/14959/) instead of hiding it behind
the terrain toggle. The whole Moon provides context; **Zoom to south pole**
frames the 87°S ring for picking. Terrain view remains available separately.

Asset inspection established that the cube-atlas GLB has west-positive X. The
scene reflects that axis into the app's east-positive coordinate convention
before rendering, placing markers and interpreting clicks. This was checked
against 531 matching image features in NASA's equirectangular grid model from
the same release. The reference map is centered on 0° longitude, as documented
in the [NASA CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/). Unit checks guard the
cardinal longitudes; browser checks exercise actual surface clicks on desktop
and mobile. The camera orbits the Moon's center and cannot zoom inside it.

The asset is NASA's `moon_small.glb`, 13,799,876 bytes, SHA-256
`12d3b0bb7fe214903f51447d1bc61710f442e92a11c703fcaca6d4e7ff8e67d4`.
Credit remains NASA Goddard Space Flight Center / LRO. Color imagery provides
context; prepared NASA terrain/horizon tables determine scientific results.

## Install the same data on another machine

Share the verified `lunar-south-cap-v1-d1ecdd0522df9876.zip` package and its adjacent
JSON receipt from `deliverables/lunar-cap-release/`. Check the archive SHA-256
against the receipt before extraction. The archive hash is
`517e64b1948065e389b5da6f86669a302a7a4349b702d24e264c81b22d294222`.

Extract it into an empty `data/derived/lunar-south-cap-v1/` directory, with
`catalog.json` immediately inside that directory. Install the preprocessing
dependencies if running the offline verifiers, and prepare the pinned kernels.
Restart the API after installation; an already running process retains its
dataset selection and immutable caches.

```powershell
python -m pip install -e './backend[dev]' -r scripts/data/requirements.txt
python scripts/data/prepare_kernels.py
python scripts/data/verify_cap_tiles.py --require-complete
python scripts/data/verify_cap_release.py
npm run dev
```

`GET /api/v1/coverage` must report `lunar-south-cap-v1`, geometry `cap`, and
103,996 candidates. The catalog checksum is
`1f888d6b6daa4a4b550b0017fe60064d027385ecd4de200d90abd560d0fd759f`.
To select the old patch explicitly, set `LUMEN_DATA_ROOT` to its absolute
directory. A corrupt installed cap fails verification rather than silently
switching to the patch.

The Docker context now includes an installed cap release, and the runtime image
copies the allowed prepared datasets. Install the cap before `docker build` to
include it. A Git-only build contains the small tracked legacy bundle; the large
release stays outside Git. No preprocessing runs at application startup. Docker
itself was unavailable locally, so an image build/deployment is not claimed.

## Verification

The backend suite includes synthetic scientific fixture tests for selective cap
coverage, area search, fixed-site scoring agreement and authoritative landmark
resolution. Existing legacy regressions remain pinned to the checked-in patch.
All 75 backend/preprocessing tests and 30 frontend tests pass; production build
and Ruff checks pass.

Browser QA exercises desktop and 390 px layouts: NASA model loading, rotation,
zoom/reset and picking; coordinate selection and coverage acknowledgment; mission
setup; actual candidate analysis, comparison, inspection, exports and stale/error
recovery. Queue-state checks use explicit contract fixtures and do not claim that
a hosted job queue has been implemented.

A real full-cap API check evaluated the exact October window: 103,996 region
candidates, 58,447 terrain-pass candidates, 10,653 temporal-pass candidates and
five shortlisted sites. On this workstation that request took 4.608 seconds and
the fresh API process peaked at 264,585,216 bytes. These measurements are not a
free-host concurrency, timeout or cold-start guarantee. Local selected-area
analysis and real site evidence also pass through the new repository.

Use `python scripts/browser_smoke.py --output data/cache/integrated-cap-ui-qa`
against the built app on port 8000 to reproduce the browser checks. Scientific
release preparation and schema details remain in [the release guide](lunar-cap-release.md).
