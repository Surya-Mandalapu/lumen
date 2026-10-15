# Scientific conventions

These conventions describe the implemented MVP. The repository plan describes the wider target;
the prepared data manifest is authoritative for actual coverage and resolution.

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
- Prepared rankable region: a 20 km square centered on the south pole, excluding the pole candidate.
  The broader 87–90°S cap remains planned coverage. A circle selects only prepared candidates
  inside that circle; it never invents or extrapolates candidates outside the bundle.
- Terrain input: common 80 m regional products. No 5 m detail tiles are included in this release.
- Candidate spacing: 500 m.
- Horizon: 5° azimuth bins, maximum 200 km range. Use the maximum of adjacent bins across
  the periodic north boundary. Near rays sample every 80 m out to 20 km; farther rays every 320 m.
  Narrow terrain blockers can be missed between sampled rays/ranges.
- Every terrain-filter survivor is evaluated at 5-minute steps, including the exact start/end.
  This avoids eliminating valid sites with approximate coarse temporal filters. The MVP does
  not refine search metrics below five minutes. Search aggregate/interval sampling uncertainty
  is at least one sample, before terrain and ephemeris approximation errors. The separate
  site inspector refines bracketed event times as described below.
- Sun: `CN+S` apparent Moon-center vectors with site-position parallax; finite-disk segment
  area above the locally flat skyline. Any upper-limb visibility counts as sunlight. Solar
  disk fraction is a geometric indicator, not a power prediction or solar-panel model.
- Earth: outgoing `XCN+S` apparent Earth-center direction with site-position parallax;
  line of sight is not a communications guarantee. Surface-observer velocity is omitted.
- Unknown/no-data rays: unknown, never clear.
- Results: comparative planning indicators, not safety or flight certification.

Slope and roughness are published 100 m-baseline indicators sampled from 1 km output grids,
not hazards resolved at the 500 m candidate spacing. DEM error/count masks are not included;
the application does not attach confidence or landing-safety certifications. The extension adds
distances to NASA PGDA modeled permanent-shadow pixels and approved named-feature centers from
a pinned official IAU/USGS Gazetteer snapshot. PSR proximity is projected distance to the union
of source 20 m pixel areas, with zero distance inside a pixel. Preparation verifies the crop
buffer contains the nearest PSR for every candidate. Aggregated display fractions are separate
from distance calculations. A PSR does not establish ice, resources, accessibility, or traversability.

Named-feature distances use the nearest selected approved center point on the reference sphere;
they are not distances to crater rims, feature edges, or drivable surface routes. Unknown IDs
and requests requiring unavailable proximity datasets fail validation. Science weights are
redistributed only when no applicable scientific proximity dataset is available.

A feature-radius region must provide a known approved feature ID. The backend resolves its
center and display name from the integrity-verified Gazetteer snapshot and replaces supplied
coordinates and names before applying coverage checks or generating a report. It never accepts
model-generated coordinates as the authoritative location of an approved feature. Explicit circle
selectors retain their user-provided coordinates. Datetimes are canonicalized to UTC before
analysis and reproducibility identifiers are generated, so equivalent UTC-offset inputs agree.

Hard spatial, terrain, and temporal constraints are applied before ranking. Illumination and Earth
utilities each use 50% visible fraction, 25% longest visible interval/window, and 25% inverse longest
blocked interval/window. Terrain utility is 45% lower slope, 35% lower roughness, and 20% higher
elevation. Each terrain metric is normalized against the fifth/ninety-fifth percentiles of the
entire prepared candidate dataset, clipped to 0–1; equal bounds yield neutral utility 0.5.
These anchors do not change with search geometry or filtering. Higher elevation is a documented
comparison preference, not a thermal or landing-safety claim. Scores are weighted utilities on
0–100 and are neither probabilities nor mission feasibility guarantees. The top five spatially
diverse candidates are selected with 1.5 km minimum projected separation; fewer may be returned.

Science utility uses fixed clipped linear distance bounds: PSR utility declines from one at
zero distance to zero at 10 km; selected-feature-center utility declines to zero at 50 km.
When both are available the category uses 60% PSR and 40% feature utility; otherwise the
available indicator receives the full category weight. These bounds do not depend on filtering.

Fractions use duration-weighted left-sample integration clipped to the mission boundaries;
the final endpoint has zero duration. Continuous intervals do not wrap across mission boundaries.
Every result includes the complete request, normalized applied weights, exact kernel filenames
and SHA-256 hashes, terrain-source and derived-artifact hashes, frame, score anchors, and sampling
rules. Downloaded kernels and bundled terrain are verified before analysis. Missing or corrupt
scientific inputs return an explicit unavailable response; no generated demonstration values are used.

Site inspection projects approximate blocker coordinates from the sampled ray bearing/range on
the lunar reference sphere. Transitions bracketed by adjacent five-minute samples are refined
with ephemeris evaluations and bisection until the bracket is at most 60 seconds wide. Refined
intervals are separate from five-minute metrics and constraint checks. Refinement does not
improve terrain accuracy or detect multiple unbracketed events within one original sample.

Scenario analysis holds the selected site fixed. Date delay shifts both endpoints equally and
validates the shifted window. Off-target analysis evaluates actual prepared candidates inside
a projected radius, limited to the nearest 24. Ranges include the baseline and shown neighbors
only, not a continuous landing ellipse or a probabilistic uncertainty model. Time-step sensitivity
repeats the same fixed site at 2.5 minutes using the same terrain, kernels, geometry, and constraints.
It measures sampling sensitivity, not DEM accuracy. Deltas are perturbed value minus baseline;
the service never reselects a more highly ranked location as a scenario substitute.


The local-sky visualization maps sampled azimuth/elevation into Three coordinates with
x=east, y=radial up, z=-north at a common diagram radius. Its tangent circle, sampled
horizon, and Sun/Earth paths share this basis. Object sizes and display radius are
illustrative. Timeline playback only changes the inspected epoch; it never recomputes
or overrides the returned scientific states. The global Moon color model remains
contextual and is not a source of scientific metrics.
