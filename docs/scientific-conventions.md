# Scientific conventions

These conventions are normative for the prototype unless a versioned decision supersedes them.

- Latitude: lunar planetocentric degrees.
- Longitude: east-positive `[-180°, 180°)` internally.
- Reference radius: 1,737,400 m.
- Source terrain frame: Mean Earth/Polar Axis frame aligned with DE421 products.
- Calculation frame: `MOON_ME_DE440_ME421` with pinned DE440 lunar kernels.
- Height: metres above the reference sphere.
- Local frame: east, north, radial up.
- Azimuth: clockwise from north, `0°–360°`.
- Elevation: angle above the local tangent plane.
- Observer height: 2 m above DEM elevation.
- Rankable region: all longitudes from `87°S` to, but excluding a candidate at, `90°S`.
- Terrain input: common 80 m regional products; 5 m tiles are detail/sensitivity only.
- Candidate spacing: 500 m.
- Coarse horizon: 1° azimuth bins, maximum 200 km range.
- Coarse time step: 60 minutes.
- Finalist time step: 5 minutes with transition refinement.
- Sun: finite-disk visibility indicator, not a power prediction.
- Earth: outgoing Earth-center geometric line of sight, not a communications guarantee.
- Unknown/no-data rays: unknown, never clear.
- Results: comparative planning indicators, not safety or flight certification.

