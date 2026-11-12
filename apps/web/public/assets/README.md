# Bundled scene assets

The current planner uses a topographic Moon mesh built from `moon-height.i16`
(4-pixel/degree NASA LOLA display elevation) and `moon-color.jpg` (NASA's 2025
LROC color map), plus `earth-visual.glb` and `sun-visual.glb`. Relief is available
at true scale, 6× and 12×. These are visualization settings, not scientific
analysis products. The underlying global analytical grid retains its separate
16-pixel/degree preparation and provenance.

The Earth and Sun assets preserve the original NASA meshes and cube-atlas UVs;
their diffuse textures were compressed for web use. Separate `earth-color.jpg`
and `sun-color.jpg` files are the extracted atlas textures, not equirectangular
maps. Credit NASA / JPL-Caltech; NASA Goddard / LRO for the lunar maps. See
`scene-assets.json` for source URLs and source/output hashes, and
`scripts/data/prepare_scene_assets.py` for the preparation recipe.

- Moon color and elevation: https://svs.gsfc.nasa.gov/4720/
- Earth model: https://science.nasa.gov/learn/heat/resource/earth-3d-model/
- Sun model: https://science.nasa.gov/learn/heat/resource/sun-3d-model/
- Detailed implementation and scale limits: `docs/orbital-planner.md`.

The orbit scene uses pinned JPL positions and body orientation. Distances and body
sizes are rescaled for readability. Lighting and textures are illustrative;
terrain-aware site analysis remains a separate scientific calculation.

## Legacy flat context asset

The asset below remains in the repository for historical reproducibility. The
current scene does not request it.

`moon-small.glb` is NASA SVS `moon_small.glb` (13,799,876 bytes).

- Source: https://svs.gsfc.nasa.gov/14959/
- File: https://svs.gsfc.nasa.gov/vis/a010000/a014900/a014959/moon_small.glb
- SHA-256: 12d3b0bb7fe214903f51447d1bc61710f442e92a11c703fcaca6d4e7ff8e67d4
- Credit: NASA's Goddard Space Flight Center / Lunar Reconnaissance Orbiter.
- Usage: https://www.nasa.gov/nasa-brand-center/images-and-media/

This older model wraps a lunar color map on a sphere. It is context only, not an analysis
DEM, physical-scale model, or source of elevation, slope, horizons or shadow predictions.
The analytical terrain scene instead loads the prepared PGDA display height grid via API.
NASA attribution appears in the interface and methods panel. No endorsement is implied.

Scene orientation: the cube-atlas model's X axis runs west-positive. The scene
reflects X to match the application's east-positive convention (+Y north, -Z
prime meridian). This was checked against 531 matched features in NASA's
equirectangular grid model from the same SVS release (centered at 0° longitude).
Surface picks use the transformed world point, so markers, textures and analytical
coordinates share a frame. The camera orbits the Moon's center and cannot zoom
inside its surface. The default view faces the south pole, with a dedicated zoom
control that frames the verified cap for location selection.
