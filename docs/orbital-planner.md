# Topographic Moon and orbital planner

The opening screen now leads with the 3D scene. Repeated introductory headings,
region recommendation cards and the separate whole-Moon workspace tab have been
removed. Place search and saved areas are compact tools in the study-area panel,
which starts collapsed on phones. Mission setup, comparison and scientific
exports remain available through the three planning stages.

## Using the scene

- **Moon surface** is the default view. The camera and rotation stay centered on
  the topographic Moon; Earth, Sun and connecting lines are hidden. **Fit view**
  frames the Moon on desktop and phones; **Go to my site** zooms toward the selected
  site. Panning is disabled in this mode to keep the Moon centered. Scene time
  still changes the direction of sunlight on the terrain.
- **Earth orbit** centers Earth and moves the Moon along its computed trajectory.
  Lunar orientation changes with time, while the selected site stays attached to
  its lunar coordinates. Choose a 30-day window to see a full orbital cycle.
- **View from site** opens a first-person sky at your selected coordinates. Drag
  or use arrow keys to look around. Compass markers, Earth/Sun elevations and
  bearings, dated paths and a 360° horizon overview make time changes readable.
  Look-toward buttons locate either body; below-horizon bodies stay hidden behind
  the ground. This is a spherical, geometric horizon and excludes terrain
  obstructions; use detailed site analysis for terrain-aware visibility.
- **Go to my site** is always available when a point is selected, including from
  the sky/orbit views. It returns to the Moon and eases the camera toward that
  point. Camera orientation and distance animate together over roughly 1.25 s;
  idle frame gaps cannot skip the transition. Reduced-motion preferences are
  respected.
- Latitude/longitude grid lines are spaced every 30°. The gold **Equator · 0°**
  line marks the northern/southern hemisphere boundary; visible parallels have
  coordinate labels. Lines follow the displayed relief and do not change picks.
- **Draw search area** enables a left-drag or one-finger touch drag. You can also
  right-drag directly on the Moon without enabling the tool. Start at the circle's
  center and drag to its edge; the green boundary previews the actual search
  radius, clamped to the catalog's live-search range (currently 1–5 km). The UI
  explicitly reports when a large drag reaches that limit. Release to apply both
  center and radius to the existing coverage check and candidate search. Radius is
  stored to 0.01 km precision. Left-drag outside drawing mode still rotates the
  Moon. Escape, pointer cancellation, window blur, or release off the globe cancel
  the draft and preserve the previous area. Detailed searches still require
  prepared polar coverage; drawing elsewhere retains the coarse-preview flow.
- **Scene time** supports scrubbing, play/pause and a UTC start date with 1-, 7- or
  30-day windows. This changes visualization time independently of mission dates.
- **Relief** switches between true elevation scale, 6× and 12× display exaggeration.
  These settings deform the actual mesh; they do not change scientific terrain
  products, scores, horizons or visibility calculations.
- **Landmarks** toggles approved IAU feature-center labels. Labels behind the
  globe, outside the view, or overlapping higher-priority labels are suppressed.
  Clicking a label selects its official coordinate as the study-area center.
- **Full screen** keeps the 3D scene, tools and timeline together. Escape or
  **Exit full screen** returns to the planner and restores focus/scrolling. A CSS
  immersive fallback handles browsers without the native Fullscreen API.

The terrain mesh uses uniformly distributed icosphere triangles instead of
extremely thin latitude/longitude wedges at the poles. Geometry is cached,
relief changes reuse the base mesh, and precise surface picking uses a BVH.
Rendering uses demand frames while paused; interpolation/playback requires no
network request for each time step. The same NASA Earth/Sun textures replace the
plain colored spheres in the existing local-sky inspection view.

## Actual geometry versus visual scale

`POST /api/v1/scene/ephemeris` accepts an increasing, timezone-aware window of at
most 31 days within 2025–2035. It returns at most 193 samples, J2000 geometric
Moon/Sun positions relative to Earth, and lunar/Earth orientation quaternions.
Inputs are normalized to UTC. Positions interpolate linearly; orientation uses
quaternion spherical interpolation. A 30-day window has samples no more than
3.75 hours apart. No synthetic trajectory is substituted if kernels are missing.

Positions use pinned JPL DE440 kernels and the existing
`MOON_ME_DE440_ME421` lunar orientation. Earth uses the approximate IAU_EARTH
rotation from the separately pinned NAIF `pck00011.tpc`. Scene coordinates
transform standard vectors through `(x, y, z) -> (y, z, -x)` consistently; rotation
matrices are conjugated by the same transform. Tests independently recover the
Moon-fixed Earth direction from the returned inertial positions/orientation and
compare it with SPICE output.

Body sizes and distances are rescaled to fit the view. In orbit view, lunar
center distances use one constant compression factor, preserving relative
distance variations. In Moon view, Earth and Sun appear on separate display
shells in their computed directions. Thus the scene is a geometric context view,
not an angular-size, eclipse, RF-link or terrain-shadow prediction. Scene
lighting is illustrative. Scientific site analysis retains its terrain horizons,
five-minute sampling and apparent/light-time conventions independently.

`GET /api/v1/scene/landmarks` returns a small set of relevant named feature centers
from the pinned southern-hemisphere IAU index, with its original source provenance.
The compact place search still searches all 5,344 adopted southern feature names.

## Visual assets and sources

All runtime visual assets are bundled; external image services are not required.

| Asset | Source and processing |
|---|---|
| Moon color | [NASA CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/), 2025 2k LROC color map, centered at 0° longitude |
| Moon elevation | Verified NASA LOLA 16-pixel/degree grid, averaged to 4 pixels/degree for this display, encoded as signed 16-bit metres above a 1,737,400 m sphere |
| Earth | [NASA Earth model](https://science.nasa.gov/learn/heat/resource/earth-3d-model/), optimized native mesh and diffuse cube-atlas texture |
| Sun | [NASA Sun model](https://science.nasa.gov/learn/heat/resource/sun-3d-model/), optimized native mesh and diffuse cube-atlas texture, emissive surface and visual corona |
| Earth orientation | [NAIF pck00011.tpc](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc), bundled and checksum verified |

Credit: NASA Goddard Space Flight Center / LRO for lunar maps; NASA / JPL-Caltech
for body models and ephemerides; IAU/USGS for feature names and coordinates.
The NASA body models use cross-shaped cube atlases. Their original UVs are
preserved rather than stretching those textures onto an unrelated UV sphere.
The three active body visual assets plus the height grid total about 3.2 MB.
The old flat context GLB remains in the repository but is not loaded by this scene.

`scripts/data/prepare_scene_assets.py` verifies the original body-model hashes,
preserves their meshes/UVs, compresses the textures and derives the display height
grid from the verified global elevation bundle. `scene-assets.json` contains the
source and output checksums. Preparation requires the existing preprocessing
dependencies and Pillow, and the downloaded source GLBs at
`data/cache/nasa-earth.glb` and `data/cache/nasa-sun.glb`:

```powershell
curl.exe -L --fail https://assets.science.nasa.gov/content/dam/science/psd/solar/2023/09/e/Earth_1_12756.glb -o data/cache/nasa-earth.glb
curl.exe -L --fail https://assets.science.nasa.gov/content/dam/science/psd/solar/2023/09/s/Sun_1_1391000.glb -o data/cache/nasa-sun.glb
python scripts/data/prepare_scene_assets.py
```

The checked-in scene does not require that preparation on another machine.
Analytical coarse previews still need the global scientific dataset prepared
with `python scripts/data/prepare_global.py`, and detailed cap analysis needs the
release described in [cap installation](cap-ui-integration.md).

## Performance target and measurements

The requirement is **successful average completion below 30 seconds for each
search type**, rather than terminating requests at 30 seconds. Browser cancellation
and late-response protection remain. The safety watchdog is now 120 seconds on
the server, with a 125-second browser fallback. Slow requests can finish instead
of failing at 30 seconds, and the UI displays elapsed time without a fabricated
progress estimate or a 30-second maximum claim. One computation runs per API
process; overload receives an immediate actionable response.

Search optimization removed redundant recursive JSON encoding and replaced
per-candidate scalar NumPy clipping with the equivalent finite scalar clamp.
The scientific formulas, frozen anchors and temporal-cache algorithm are unchanged.

Three completed requests per type were measured locally on November 11, 2026:

| Operation | Mean seconds | Maximum seconds |
|---|---:|---:|
| Landmark lookup | 0.024 | 0.051 |
| Area coverage | 0.064 | 0.163 |
| 5 km / 7-day detailed search | 2.149 | 2.283 |
| Unconstrained full-cap October search | 10.983 | 17.342 |
| Near-side 31-day coarse preview | 2.481 | 2.542 |
| Far-side 7-day coarse preview | 1.962 | 2.027 |
| 30-day orbital ephemerides | 0.034 | 0.044 |

Every measurement completed successfully; failures/timeouts never count as fast
results. Evidence: `data/cache/orbital-qa/search-latency.json`. These are local
measurements, not guarantees for a different host, load or network. Repeat the
same completion gate on the deployment host with:

```powershell
python scripts/benchmark_completed_searches.py --repeat 3
```

## Verification

```powershell
npm run test --workspace apps/web
npm run build --workspace apps/web
python -m pytest backend/tests scripts/data/test_prepare_science_layers.py scripts/data/test_prepare_terrain.py scripts/data/test_verify_cap_tiles.py -q
python scripts/orbital_smoke.py
```

Browser checks require a running built app on port 8000, Playwright Chromium,
prepared kernels and global/cap data. The smoke test covers desktop and phone
layouts, real textured bodies and displaced relief, labels, fullscreen/native and
fallback exit, orbit scrub/play/pause, missing-ephemeris recovery, place selection,
saved areas, completed previews/searches, comparison/export and job-state fixtures.
Screenshots and a machine-readable report are saved under `data/cache/orbital-qa/`.
The old smoke-script entry points now run these current checks too.

Local sky directions are computed from the interpolated JPL vectors in the lunar
body-fixed frame, subtracting a 1737.4 km spherical observer radius, then resolving
local east/north/up. Elevation is measured from the geometric tangent; azimuth
runs clockwise from north. Displayed body markers are enlarged for readability.
The first-person sky uses a flat ground plane, not reconstructed local terrain.

Additional browser verification: `python scripts/scene_context_smoke.py` covers
intermediate animation frames, returning to the point, sky readouts over time,
keyboard gaze, the coordinate grid, and retained orbit mode at desktop/phone sizes.

Area-selection browser verification: `python scripts/area_selection_smoke.py` checks
right-drag, button-enabled left-drag, real touch input, previews, cancellation,
radius limits and an actual candidate search using the drawn area.
