# Lunar Landing-Site Planning App — Product and Implementation Plan

## 1. Executive summary

Build a regional decision-support prototype that helps users compare—not certify—lunar south-pole landing-site candidates.

The MVP will:

- Support terrain-aware analysis from `87°S–90°S`.
- Use an 80 m analysis grid across the region, with selected 5 m demonstration tiles.
- Accept structured mission requirements and return a transparent shortlist.
- Calculate date-specific Sun and Earth directions, terrain occlusion, illumination intervals, direct-to-Earth line-of-sight opportunities, slope, roughness, elevation, and feature proximity.
- Show a contextual 3D Moon plus a separate analytical local-terrain view.
- Explain scores through raw metrics, timelines, horizon profiles, and criterion contributions.
- Treat natural-language interpretation as a stretch goal over the structured form.
- Clearly state that results are prototype-grade comparative indicators, not flight-certified landing-safety or communications predictions.

Assumptions locked for planning:

- One-week build by 3–5 people.
- Greenfield project.
- Supported region: all longitudes from `87°S` to the south pole.
- Full-region analysis uses 80 m terrain data and approximately 500 m candidate spacing.
- Three curated areas may use 5 m terrain for detailed demonstrations, but regional candidates remain ranked using the common 80 m basis.
- Validated mission dates: 2025–2035, with a maximum 31-day query window.
- Coarse temporal analysis uses 60-minute samples; shortlisted sites use 5-minute samples with transition refinement.
- Natural-language input is stretch scope.

## 2. Interpretation of the team’s core vision

The central vision is sound: make difficult lunar lighting and communication geometry understandable through an interactive 3D experience and an explainable site-comparison workflow.

Requirement provenance must remain explicit:

- **Brainstorming ideas:** spacecraft trajectories, receiver-placement hotspots, stress tests, rover routing, safe-return clock, CLPS scenarios, chatbot, shadow maps, and exact ridge highlighting.
- **Team direction that appears committed:** 3D Moon/Earth/Sun context, scoped south-polar analysis, structured search, candidate ranking, Sun/Earth horizon geometry, terrain indicators, timelines, and site comparison.
- **Necessary technical capabilities not stated explicitly:** coordinate/frame control, ephemeris and kernel versioning, terrain-horizon preprocessing, coverage boundaries, data-quality masks, request limits, uncertainty disclosure, deterministic validation, and provenance.
- **New recommendations:** separate contextual and analytical 3D scenes; use coarse-to-fine analysis; rank a shortlist rather than declare a winner; use a common-resolution regional score; treat the LLM as an optional interpreter; replace RF and safety claims with narrower geometric indicators.

The product’s defensible claim is:

> Given this terrain dataset, observer height, ephemeris bundle, mission window, and sampling resolution, these locations show the following relative terrain, illumination, and geometric Earth-visibility trade-offs.

## 3. Consolidated feature inventory

| Original brainstorming idea | Consolidated capability | Intended user | User need | Relationship to challenge | Dependencies | Ambiguities |
|---|---|---|---|---|---|---|
| “Main UI is 3D map of Moon, Earth and Sun” | Global 3D context | All users | Understand location and changing geometry | Strong presentation support | Web 3D, time state, geometry service | Physical scale versus educational layout |
| NASA 3D model with topography | Contextual Moon asset | Public, educators | Recognizable and credible lunar visualization | Indirect; not sufficient for analysis | NASA GLB, attribution | The model has polar mesh artifacts and is not an analysis DEM |
| “Trajectories are also on this” | Apparent Sun/Earth paths | Planners, educators | See how source directions change | Direct if paths are local-sky paths | Ephemerides and local frames | NASA page links to separate Artemis trajectory content; no trajectory data is embedded in the model |
| Feasibility score using sunlight and Earth LOS with adjustable priorities | Hard filtering and weighted ranking | Planners | Find candidates matching mission priorities | Central | Comparable metrics and scoring rules | Must not imply probability of success or universal optimum |
| Receiver locations/hotspot circles | Communications siting optimization | Mission designers | Avoid blackouts | Adjacent | Relay topology, antennas, link budget | Receiver could mean Earth station, lunar relay, local mast, or spacecraft |
| Contact NASA expert | Validation activity | Development team | Confirm practical usefulness | Valuable but indirect | Expert availability | Not an application feature |
| Launch delay changes geometry | Time-shift sensitivity | Planners | Understand schedule robustness | Relevant | Fast deterministic reruns | Launch date and landing date are not necessarily the same |
| AI chatbot selecting a landing location | Constrained natural-language interpretation | Non-specialists | Express requirements without learning every control | Helpful interface | LLM, schema validation, gazetteer | Model must not calculate metrics or select a site independently |
| Landing late, landing off-target, longer communications requirement | Scenario stress testing | Planners | See sensitivity to operational changes | Strong extension | Baseline analysis, perturbation model | Perturbation ranges and interpretation must be defined |
| Shadow forecast and timeline slider | Site illumination timeline and optional regional shadow frames | All users | See when terrain blocks sunlight | Central at site level | Terrain horizons and time series | Scientifically rendered full-region shadows are much more expensive |
| Communication blackout timeline “on transit” | Surface DTE timeline; transit analysis separated | Planners | Identify surface communication outages | Central for landed sites | Earth direction, terrain horizon | Transit requires mission trajectory/orbit data and is a separate system |
| Terrain reflection/RF-risk layer | Terrain-aware geometric Earth visibility | Planners | Understand whether terrain blocks Earth | Central after narrowing | DEM and horizon profiles | Visibility is not RF reflection, multipath, antenna performance, or link margin |
| Rover expedition planner | Time-dependent traverse planning | Surface-operations teams | Plan routes with power and communication | Adjacent future feature | Routing, vehicle model, time-dependent state | Far beyond point-site comparison |
| Safe return clock | Operational contingency model | Mission operators | Understand remaining return margin | Weak/unsupported | Vehicle, route, consumables, thermal and abort models | No definition or data exists in the notes |
| Real or representative CLPS scenarios | Curated examples | Judges, public, planners | Learn through recognizable missions | High demo value | Sourced mission parameters | Must distinguish official mission data from representative scenarios |
| Highlight ridge blocking Earth and compare Earth elevation with horizon | Occlusion explanation | All users | Understand why visibility changes | Excellent challenge alignment | Horizon blocker metadata | Exact named-ridge boundaries may not exist |
| Side-by-side comparison | Comparison workspace | Planners | Understand trade-offs between two sites | Direct | Common date window and metrics | Scores from different windows must not be compared |

## 4. Feasibility assessment

| Capability | Classification | Feasibility assessment |
|---|---|---|
| Supported-region boundary and disclosure | **MVP** | Low effort, essential scientific honesty, high alignment |
| Structured search | **MVP** | Moderate UI effort, deterministic, high value, straightforward to validate |
| Global 3D Moon | **MVP, simplified** | Ready-made asset, moderate browser cost, high demo value, contextual rather than analytical |
| Local 3D terrain | **MVP** | Moderate preprocessing/rendering effort, authoritative data available, high value |
| Sun/Earth apparent azimuth and elevation | **MVP** | Moderate science effort, inexpensive runtime, central to challenge |
| Terrain horizon and occlusion | **MVP** | High preprocessing and validation effort, but the main differentiating scientific feature |
| Illumination and DTE timelines | **MVP** | Moderate runtime after horizon preprocessing, central challenge output |
| Slope, roughness, elevation, PSR proximity | **MVP** | Authoritative products exist; must disclose spatial scale and avoid hazard claims |
| Hard constraints and weighted ranking | **MVP** | Moderate engineering, low scientific cost once metrics exist, high user value |
| Shortlist explanations and metric breakdown | **MVP** | Low–moderate effort, prevents opaque or misleading scores |
| Side-by-side comparison | **MVP** | Moderate frontend effort, excellent demonstration of trade-offs |
| Candidate-point score layer | **MVP** | Less misleading and cheaper than a continuous heatmap |
| Continuous ranking heatmap | **Stretch** | Visually strong, but interpolation can imply unsampled precision |
| Full shadow-map animation | **Stretch** | Expensive to compute and validate; GPU shadows would be educational rather than authoritative |
| Natural-language query | **Stretch** | Strong demo value but nonessential; adds model, security, and validation failure modes |
| Landing-time delay sensitivity | **Stretch** | Cheap rerun after core analysis exists |
| Off-target spatial sensitivity | **Stretch** | Requires neighboring-site recomputation and clear uncertainty rules |
| Exact blocker/ridge highlighting | **Stretch** | Blocker azimuth/distance is feasible; precise terrain polygons require more work |
| Representative CLPS scenario | **Stretch/demo content** | Valuable if carefully labeled and sourced |
| Receiver/relay optimization | **Post-hackathon** | Separate network-design and RF problem |
| Rover expedition planner | **Post-hackathon** | Requires time-dependent constrained routing and a vehicle model |
| Spacecraft transit communications | **Post-hackathon** | Requires mission trajectory kernels and spacecraft-specific assumptions |
| Global high-resolution ranking | **Post-hackathon** | Excessive storage, preprocessing, and validation expense |
| RF-reflection risk | **Remove/replace** | Scientifically misleading without propagation and antenna models |
| Safe-return clock | **Remove** | Undefined and potentially hazardous to present |
| NASA expert contact | **Project validation task** | Pursue opportunistically, but do not make delivery dependent on it |

## 5. Features removed, deferred, or simplified

- **Spacecraft trajectories:** replace with apparent Sun/Earth paths in the selected site’s local sky. Actual spacecraft trajectories become post-hackathon inputs.
- **Receiver hotspots:** replace with a candidate layer colored by geometric Earth visibility and longest blackout. Relay siting requires a separate network model.
- **RF-reflection risk:** rename to “terrain-aware Earth-center line-of-sight opportunity.” Explicitly exclude diffraction, multipath, antenna masks, ground-station availability, and link budget.
- **Safe-return clock:** remove. Preserve the need through longest darkness and longest communication-blackout metrics.
- **Rover planner:** defer. Preserve future compatibility by keeping site and time-series models reusable for route nodes.
- **Full-region animated shadows:** use scientifically calculated site timelines in the MVP. A few precomputed shadow frames may be added later and labeled by source/resolution.
- **Exact blocking ridge:** MVP reports blocking azimuth, horizon elevation, approximate coordinates, and distance. Rendering the blocking terrain cell is stretch scope.
- **CLPS missions:** use one clearly labeled representative scenario unless authoritative mission parameters can be cited and mapped to the application’s metric definitions.
- **Chatbot:** implement only after the structured search, ranking, and validation suite pass.
- **5 m full-cap analysis:** rejected for the hackathon. The 5 m `87°S–90°S` DEM alone is about 3.3 GB and its slope product about 4.9 GB; the 80 m product is approximately 181 MB and is suitable for regional preprocessing. [NASA PGDA 5 m mosaic](https://pgda.gsfc.nasa.gov/products/81), [NASA PGDA large-area products](https://pgda.gsfc.nasa.gov/products/90)

Cut features in this order if time runs short:

1. Natural-language input.
2. Shadow frames and continuous heatmap.
3. Stress-test presets.
4. Exact blocker highlighting.
5. 5 m detail outside the primary demo tile.
6. Animated Earth/Sun objects; retain direction indicators.
7. Science-proximity scoring; retain it as displayed context.

Do not cut coverage disclosure, deterministic metrics, horizon/timeline explanations, or score provenance.

## 6. Final MVP definition

### Product description

An interactive lunar south-pole comparison tool that combines a 3D map with deterministic terrain and ephemeris analysis. Users specify a region, mission window, constraints, and priorities, then inspect a shortlist of locations with explainable illumination, Earth line-of-sight, and terrain trade-offs.

### Users and problem

- **Primary user:** early-stage lunar mission concept planner.
- **Secondary users:** planetary scientists, educators, students, and the public.
- **Core problem:** existing geometry tools make it difficult to compare how dates and local terrain jointly affect solar illumination and direct-to-Earth opportunities.

### Final MVP features

- Contextual 3D Moon with supported-region overlay.
- Analytical 3D terrain view for `87°S–90°S`.
- Structured region, date, constraint, and weight controls.
- 500 m regional candidate grid derived from 80 m terrain.
- Terrain-aware Sun and Earth paths.
- Illumination, darkness, DTE opportunity, and blackout timelines.
- Elevation, 100 m-baseline slope/roughness indicators, and proximity metrics.
- Hard filtering followed by weighted scoring.
- Spatially diverse shortlist of 3–5 candidates.
- Local horizon profile and occlusion explanation.
- Side-by-side comparison under one common mission window.
- Dataset, resolution, frame, time-step, observer-height, and uncertainty disclosure.
- Three optional 5 m detail tiles used only for visual/detail demonstrations, not to give their candidates an unfair regional score advantage.

### Stretch goals

- Constrained natural-language interpretation.
- `+12 hours` landing-delay scenario.
- One-cell and small-radius off-target sensitivity.
- Continuous heatmap.
- Precomputed shadow frames.
- Refined 5 m terrain sensitivity for curated sites.
- Representative CLPS-inspired scenario.

### Explicit non-goals

- Safe-site certification or autonomous landing-site selection.
- Landing-hazard detection below dataset resolution.
- Whole-Moon detailed analysis.
- RF link budgets, DSN scheduling, antenna modeling, relays, or multipath.
- Orbital/transit communications.
- Power-system, battery, thermal, dust, or panel-attitude modeling.
- Landing dynamics or descent trajectories.
- Rover routing or safe-return calculations.
- User accounts, collaboration, or persistent mission databases.

### MVP acceptance criteria

- Unsupported locations cannot enter detailed analysis.
- Every search is deterministic and reproducible from its manifest.
- Hard constraints are applied before scoring.
- Every result preserves raw values, category scores, data status, and provenance.
- Identical requests return identical ranking.
- Candidate scores are based on a common dataset and mission window.
- Timeline intervals agree with the underlying sampled state.
- Two candidates can be compared without hiding differing assumptions.
- No result is called “safe” or “the best landing site.”
- The UI distinguishes computed, precomputed, approximate, and unavailable information.
- The complete prepared demo works without calling external science-data services.

## 7. User workflows

1. **Orient:** open the 3D Moon, see the supported boundary, and enter the analytical view.
2. **Configure:** select the region, landmark radius, or subarea; choose dates, constraints, and weights.
3. **Validate:** review normalized units, weights, assumptions, coverage, and request limits.
4. **Search:** filter and rank candidates, receiving a shortlist and failure explanations.
5. **Inspect:** view terrain, horizon, Sun/Earth paths, timelines, blockers, confidence, and provenance.
6. **Compare:** pin two candidates under a common mission window and inspect score contributions.
7. **Natural language, if completed:** review, edit, and confirm the interpreted structured request before analysis.

## 8. Data-source research

| Dataset/product | Format, resolution, expected size | CRS, longitude, coverage | Restrictions and preprocessing | Suitability |
|---|---|---|---|---|
| [NASA SVS Moon 3D Models](https://svs.gsfc.nasa.gov/14959/) | GLB/USDZ; 13.2 MB flat small globe, 77.7 MB small topographic globe, about 299–303 MB full topographic assets | Global visual model; no published analytical raster CRS; topographic models have pinched-pole artifacts | Credit NASA GSFC; follow [NASA media guidance](https://www.nasa.gov/nasa-brand-center/images-and-media/); do not imply endorsement | Small flat GLB for global context only. Not suitable for elevation, slope, horizon, illumination, or Earth-visibility calculations |
| [PGDA large-area south-pole LOLA products](https://pgda.gsfc.nasa.gov/products/90) | Cloud-optimized GeoTIFF; 80 m DEM 181 MB, slope 231 MB, hillshade 85 MB, error/effective-resolution layers about 239–244 MB; 50 m roughness layers about 0.6 GB; 20 m PSR raster 148 MB | South polar stereographic metres; 1,737.4 km sphere; `MOON_ME`/DE421; planetocentric, east-positive; products cover at least `80°S–90°S` | Public NASA science data; cite product papers. Crop rankable area, preserve a wider horizon buffer, create overviews, masks, candidate tables, and horizon arrays | Primary full-region scientific dataset for terrain, slope, roughness, quality, PSR proximity, rendering, and horizon computation |
| [PGDA 5 m south-pole site products](https://pgda.gsfc.nasa.gov/products/78) | Site GeoTIFFs at 5 m; elevation, count, slope, uncertainty and optional clone products; core rasters commonly tens of MB per site | South polar stereographic; `MOON_ME`/DE421; regional landing-site coverage | Cite Barker et al.; clip only overlapping official sites; retain uncertainty/count masks | Detailed visualization and finalist sensitivity in curated areas; not the common regional ranking basis |
| [LROC WAC Global Morphology Mosaic](https://astrogeology.usgs.gov/search/map/moon_lro_lroc_wac_global_morphology_mosaic_100m) | Raster/GeoTIFF, about 100 m/pixel, approximately 5.5 GB globally | Simple cylindrical; 1,737.4 km sphere; planetocentric; positive-east `−180°–180°`; global | Public domain with source citation. Crop, reproject to south polar stereographic, compress, and tile; alternatively use PGDA hillshade to save time | Surface texture only, not elevation or time-dependent illumination |
| [USGS/IAU Gazetteer GIS downloads](https://planetarynames.wr.usgs.gov/GIS_Downloads) | Shapefile/KML; Moon archive approximately 24 MB; vector data | Global; planetocentric, east-positive; IAU-approved coordinates | Generated regularly; record download date. Build a local index of ID, approved name, feature type, center, diameter, and aliases | Authoritative landmark resolution and approximate feature proximity. Centers/diameters must not be presented as exact boundaries |
| [PGDA Lunar Polar Illumination](https://pgda.gsfc.nasa.gov/products/69) | PDS IMG, JP2, TIFF and COG; 240 m `65°S–90°S`, 120 m `75°S–90°S`, 60 m `85°S–90°S` | Polar stereographic; 1,737.4 km sphere | Cite NASA/LOLA study. Products summarize hourly samples over an approximately 18.6-year cycle | Benchmark and context only. Long-term averages do not answer a date-specific request |
| [NAIF generic kernels](https://naif.jpl.nasa.gov/naif/data_generic.html) | `de440s.bsp` about 31 MB; lunar orientation PCK about 12 MB; lunar FK about 19 KB; text PCK about 128 KB; leap-seconds kernel small | Inertial and lunar body-fixed frames rather than map projection; DE440 short SPK covers the 2028 demo period | Version-pin, checksum, package server-side, and retain provenance | Authoritative Sun/Earth/Moon ephemerides, lunar orientation, libration, body constants, and time conversion |

Coordinate policy:

- Store latitude as planetocentric degrees.
- Store longitude internally as east-positive `[-180°, 180°)`.
- Accept and display `0°–360°E` when useful, but never mix conventions silently.
- Use a 1,737.4 km reference sphere and height above that sphere.
- Preserve source WKT and frame metadata.
- Use `MOON_ME_DE440_ME421` with the DE440 lunar FK/PCK so ephemeris calculations remain closely aligned with the DE421 Mean-Earth frame used by LOLA products. [LOLA coordinate documentation](https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/document/rdrsis.htm), [USGS lunar standards](https://psdi.astrogeology.usgs.gov/moon/standards/data_standards/), [NAIF lunar-frame tutorial](https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/Tutorials/pdf/individual_docs/23_lunar-earth_pck-fk.pdf)

## 9. Scientific methodology

### Sun and Earth geometry

For every UTC sample:

1. Convert UTC through the pinned leap-seconds kernel to SPICE ephemeris time/TDB.
2. Express the observer at DEM height plus a fixed 2 m equipment height in `MOON_ME_DE440_ME421`.
3. Calculate the apparent Sun vector using reception correction such as `CN+S`.
4. Calculate the outgoing Moon-to-Earth direction using transmission correction such as `XCN+S`.
5. Transform each vector into local east-north-up coordinates.
6. Compute local azimuth and elevation.
7. Avoid creating a candidate exactly at `−90°`, where geographic azimuth is singular.

### Terrain-aware horizon

- Convert observer and sampled terrain cells into lunar body-fixed Cartesian coordinates.
- For every azimuth bin, retain the maximum terrain elevation angle and blocker location/distance.
- Account for lunar curvature in 3D.
- Use 1° azimuth bins and a 200 km maximum range for regional preprocessing.
- Recompute shortlisted sites at 0.25° or directly along encountered Sun/Earth azimuths.
- Use conservative interpolation between horizon bins.
- Use terrain beyond the rankable `87°S` boundary, from the broader `80°S–90°S` DEM.
- Preserve no-data encounters and report them as unknown rather than clear.

### Illumination and Earth visibility

- Treat the Sun as a finite disk and return full, partial, or blocked state.
- Return illumination fraction, sunlight intervals, longest sunlight, and longest darkness.
- Use the outgoing Earth-center ray as the primary DTE proxy.
- Return Earth-visible fraction, longest opportunity, longest blackout, and interval list.
- Label DTE output as a geometric Earth-center line-of-sight opportunity.
- Exclude ground stations, antenna masks, link margin, diffraction, and DSN availability.

### Terrain and proximity

- **Elevation:** DEM radius minus 1,737.4 km.
- **Slope:** local plane fit over a documented 100 m footprint.
- **Roughness:** RMS vertical residual from that plane over the same footprint.
- **PSR proximity:** shortest projected distance to the authoritative PSR boundary.
- **Named-feature proximity:** authoritative geometry when present; otherwise an explicitly approximate center/nominal-radius distance.
- Require a minimum valid-data fraction for every metric.

### Resolution and accuracy

- Regional candidates: approximately 500 m spacing, terrain metrics from common 80 m products.
- Coarse time series: 60-minute samples.
- Finalists: 5-minute samples, with state transitions refined by bisection to about one minute.
- Display percentages to one decimal place and event times no finer than verified resolution.
- Run sensitivity tests by shifting finalists one DEM cell, halving the time step, and refining horizon bins.
- Mark constraint results near the sensitivity range as `borderline`.

### Precomputed versus live

| Precomputed offline | Computed live |
|---|---|
| DEM crop, overviews and terrain meshes | Sun/Earth vectors for requested dates |
| Quality/no-data masks | Local azimuth/elevation series |
| Candidate coordinates and terrain metrics | Horizon comparisons |
| PSR and feature distances | Interval extraction and time metrics |
| Coarse horizon profiles | Hard filtering and ranking |
| Curated 5 m detail assets | Refined finalist analysis |
| Dataset/kernel manifest | Explanation and comparison payloads |

## 10. Candidate-ranking design

### Search pipeline

1. Select candidates inside the requested geometry and supported-data mask.
2. Retrieve elevation, slope, roughness, proximity, data-quality, and horizon values.
3. Calculate time-dependent illumination and Earth-visibility metrics.
4. Apply hard constraints before any scoring.
5. Calculate fixed category utilities.
6. Normalize user weights.
7. Calculate a 0–100 comparative planning score.
8. Apply minimum spatial separation.
9. Refine the leading candidates.
10. Return 3–5 candidates, raw metrics, category scores, contributions, confidence, and limitations.

### Scoring categories

- **Illumination:** 50% illumination fraction, 25% longest continuous sunlight, 25% inverse longest darkness.
- **Earth visibility:** 50% visible fraction, 25% longest continuous opportunity, 25% inverse longest blackout.
- **Terrain suitability indicator:** 45% slope, 35% roughness, 20% elevation preference.
- **Science proximity:** PSR and selected official-feature proximity; use 60% PSR and 40% selected feature when both are requested.

Terrain and distance utilities use fixed dataset-wide robust reference bounds, not the current candidate set’s minimum and maximum.

Default weights:

```json
{
  "illumination": 0.35,
  "earth_visibility": 0.35,
  "terrain_safety": 0.20,
  "science_proximity": 0.10
}
```

Display scores as integer planning indicators and label differences under two points as a near tie.

Exceptional conditions:

- **All candidates fail:** return failure counts and nearest-to-passing candidates without automatically relaxing constraints.
- **Contradictory requirements:** reject before execution.
- **Missing data:** never pass an unknown hard constraint or silently renormalize a missing weighted category.
- **Correlated criteria:** aggregate related metrics into the four categories.
- **Extreme weights:** allow 0% or 100%, but require confirmation at 100%.
- **Expensive searches:** cap mission windows, process arrays in chunks, and enforce sample/candidate limits.
- **Different mission windows:** require a common rerun before comparing scores.
- **Similar scores:** show a tie band and underlying trade-offs.
- **Low-confidence candidates:** identify candidates whose status or rank changes under sensitivity analysis.

## 11. Natural-language and LLM design

The LLM is a stretch interface that produces an editable interpretation; it never calls the scientific engine directly.

### Pipeline

1. Treat the user message as untrusted input.
2. Extract only schema-constrained fields.
3. Send named landmarks to the USGS/IAU gazetteer resolver.
4. Replace model-supplied landmark coordinates with authoritative resolver results.
5. Normalize units and dates deterministically.
6. Map qualitative language through documented rules.
7. Validate location, dates, constraints, weights, and supported metrics.
8. Detect contradictions, unsupported requests, unresolved features, and prompt injection.
9. Ask one concise clarification when ambiguity materially changes the search.
10. Show the interpretation, assumptions, and warnings.
11. Allow manual editing and confirmation.
12. Pass only confirmed structured data to the normal validation and ranking endpoints.

### Structured-output schema

```json
{
  "schema_version": "1.0",
  "region": {
    "input_text": "near Shackleton crater",
    "selector_type": "feature_radius",
    "resolved_feature_id": null,
    "center": {
      "latitude_deg": null,
      "longitude_deg_east": null
    },
    "search_radius_km": null,
    "within_supported_area": null
  },
  "time_range": {
    "start_utc": null,
    "end_utc": null
  },
  "hard_constraints": {
    "maximum_slope_deg": null,
    "maximum_roughness_m": null,
    "minimum_elevation_m": null,
    "maximum_elevation_m": null,
    "minimum_illumination_fraction": null,
    "minimum_continuous_sunlight_hours": null,
    "maximum_continuous_darkness_hours": null,
    "minimum_earth_visibility_fraction": null,
    "minimum_continuous_communication_hours": null,
    "maximum_continuous_blackout_hours": null,
    "maximum_distance_to_psr_km": null,
    "maximum_distance_to_science_feature_km": null,
    "science_feature_ids": []
  },
  "preferences": {
    "illumination": null,
    "earth_visibility": null,
    "terrain_safety": null,
    "science_proximity": null,
    "elevation_preference": "neutral"
  },
  "qualitative_mappings": [],
  "assumptions": [],
  "warnings": [],
  "unsupported_requests": [],
  "confidence": {
    "overall": "medium",
    "low_confidence_fields": []
  },
  "clarification_required": false,
  "clarification_question": null
}
```

Validation rules:

- Require all top-level keys and reject unknown properties.
- `selector_type`: `full_supported_region`, `feature_radius`, `circle`, or `polygon`.
- Latitude: `[-90, 90]`; east longitude: `[-180, 180)`.
- Feature search radius: `1–50 km`.
- Fractions: `[0,1]`; slope: `[0,90]`; durations, distances, and roughness: nonnegative.
- Dates: ISO-8601 UTC, within 2025–2035, `start < end`, maximum 31 days.
- Weights: finite, nonnegative, and normalized to sum to 1.

Qualitative defaults:

- “Near” → 10 km radius, shown as an assumption.
- “Flat” → increase terrain preference; do not invent a hard slope limit.
- “Long sunlight” → increase illumination preference; do not invent a minimum duration.
- “Prioritize A over B” → a 2:1 ratio before normalization.
- Hard-language terms without a numeric value → clarification required.
- “October 2028” → the complete UTC calendar month.

Security and fallback:

- Resolve features only through the official local index.
- Unknown or ambiguous features cannot acquire LLM-invented coordinates.
- Allow one constrained retry after malformed output, then fall back to the structured form.
- User input cannot change tools, schemas, sources, supported regions, or ranking rules.
- The model cannot supply scientific values, authoritative site IDs, or ranking results.

## 12. Visualization plan

| Visualization | MVP decision | Scientific status |
|---|---|---|
| Interactive global Moon | Yes, using the small flat NASA GLB | Contextual |
| Earth, Moon and Sun geometry | Yes, with compressed distances and enlarged bodies | Directions computed; scene explicitly “not to scale” |
| Supported-region boundary | Yes | Authoritative application boundary |
| Local 80 m terrain | Yes | Derived from analysis DEM |
| Curated 5 m terrain | Yes for selected tiles | Detailed visualization/sensitivity, not common ranking basis |
| Local horizon profile | Yes | Scientifically computed |
| Apparent Sun and Earth paths | Yes | Computed |
| Sunlight and DTE timelines | Yes | Computed |
| Terrain occlusion | Yes, horizon and blocker marker | Computed within modeled range |
| Candidate markers | Yes | Computed |
| Continuous ranking heatmap | Stretch | Interpolated/precomputed and resolution-labeled |
| Side-by-side comparison | Yes | Computed from one common request |
| Metric breakdown | Yes | Computed |
| Full shadow animation | Stretch | Precomputed or educational; never the authoritative site metric |

Visual rules:

- Keep orbital-scale context and meter-scale terrain in separate coordinated scenes.
- Label exaggerated scale, derived terrain, precomputed assets, and approximate animations.
- Provide table equivalents for horizon and timeline charts.
- Do not encode pass/fail solely by color.
- Support keyboard candidate selection, visible focus, reduced motion, descriptive tooltips, and color-blind-safe palettes.

## 13. System architecture

### Recommended stack

- **Frontend:** React, TypeScript, Vite.
- **3D:** React Three Fiber/Three.js.
- **Charts:** ECharts or an equivalent accessible chart library.
- **State/query:** TanStack Query plus lightweight local state.
- **Backend:** Python FastAPI.
- **Scientific stack:** SpiceyPy, NumPy, SciPy, Rasterio/GDAL, PyProj, Shapely, and GeoPandas.
- **Derived storage:** GeoTIFF/COG, Parquet, compressed NumPy/Zarr arrays, and GLB terrain assets.
- **Testing:** Pytest, Vitest, Playwright, axe-core.
- **No relational database or authentication in the MVP.**

### Deployment

Use one Dockerized application service that serves the FastAPI API and built frontend. Put large immutable terrain and texture assets in S3-compatible object storage/CDN. Package the derived regional dataset, manifests, and SPICE kernels with versioned deployment artifacts.

Recommended runtime: 2 CPU cores, 4 GB RAM, read-only packaged scientific data, a warmed demo-query cache, and no dependency on NASA/USGS services during judging.

### Data flow

```text
Official source data
  → offline crop/reprojection/quality checks
  → regional DEM, masks, metrics, candidate grid and horizons
  → versioned scientific-data bundle
  → FastAPI geometry/ranking service
  → validated shortlist and site-analysis payloads
  → React analytical views and 3D scenes
```

### Preprocessing

1. Download and checksum source products.
2. Verify CRS, reference radius, frame, longitude convention, no-data and units.
3. Crop the rankable `87°S–90°S` region while retaining terrain to `80°S` for horizons.
4. Generate overviews, hillshade, browser terrain meshes and textures.
5. Produce the 500 m candidate grid.
6. Sample static terrain, quality and proximity metrics.
7. Precompute 1° horizon arrays to 200 km.
8. Build blocker metadata for demo candidates.
9. Prepare curated 5 m tiles.
10. Emit a versioned manifest containing source URLs, checksums, processing parameters, resolutions, frames and caveats.

### Caching and performance

- Cache Moon-centered Sun/Earth time series by kernel hash, start, end and step.
- Cache search responses by dataset version, geometry, dates, constraints and normalized weights.
- Store horizon angles as scaled 16-bit arrays where verified.
- Process full-region candidates in chunks.
- Transmit only shortlisted candidates and display decimations.
- Prewarm the final demo scenario.
- Target under 15 seconds for an uncached bounded search and under 5 seconds for a warmed demo request.

## 14. Data models and APIs

### Core models

- `DatasetManifest`: sources, checksums, CRS/frame, resolution, no-data policy, horizon configuration, observer height, algorithm versions and caveats.
- `RegionDefinition`: supported polygon, selectable geometry types, horizon buffer, analysis grid and assets.
- `SearchRequest`: geometry, common mission window, hard constraints, weights and science features.
- `CandidateStaticMetrics`: coordinates, elevation, slope, roughness, quality, PSR distance and feature distances.
- `CandidateTemporalMetrics`: illumination and Earth-visibility interval metrics.
- `CandidateResult`: raw metrics, constraints, utilities, contributions, score, confidence, tie state and provenance.
- `SiteAnalysis`: horizons, blockers, Sun/Earth paths, states, intervals and limitations.
- `InterpretationResult`: natural-language schema, gazetteer matches, assumptions, warnings and confirmation state.

### API surface

- `GET /v1/region` — supported boundary, manifest, valid dates, limits and defaults.
- `GET /v1/features?query=` — authoritative gazetteer matches.
- `POST /v1/search/validate` — normalize and validate a request.
- `POST /v1/candidates/search` — filter, analyze, rank and return the shortlist.
- `GET /v1/sites/{site_id}/analysis?start=&end=` — horizon, paths, timelines, blockers and provenance.
- `POST /v1/candidates/compare` — compare two sites under one common window.
- `POST /v1/query/interpret` — stretch-only interpretation endpoint.

Every scientific response includes dataset version, kernel-manifest hash, algorithm version, computation time, analysis resolution, candidate spacing, observer height, status, and warnings.

## 15. Testing and validation

### Software tests

- Coordinate conversion, longitude wrap and polar behavior.
- UTC-to-ET conversion and kernel-coverage failures.
- Local axes and azimuth quadrants.
- Constraint boundaries and contradictions.
- Weight normalization and all-zero weights.
- Deterministic scoring and near-tie handling.
- Interval extraction.
- Missing/no-data behavior.
- Unsupported-region and excessive-query errors.
- LLM malformed output, invented landmarks and prompt injection.
- API and end-to-end structured-search flows.

### Scientific tests

- Synthetic smooth sphere, flat patch, isolated ridge, crater rim and no-data gap.
- Verify ridge azimuth/elevation and blocker location.
- Cross-check directions against [NAIF WebGeocalc/SPICE tooling](https://naif.jpl.nasa.gov/naif/webgeocalc.html).
- Compare terrain values through an independent GDAL/QGIS workflow.
- Compare broad patterns against [NASA PGDA polar products](https://pgda.gsfc.nasa.gov/products/69).
- Run time-step and horizon-bin convergence tests.
- Store golden results with kernel, DEM and algorithm hashes.

### Ranking properties

- Tightening a hard constraint cannot add candidates.
- Changing weights cannot change raw scientific metrics.
- Equal inputs produce equal outputs.
- Missing hard-constraint data never passes.
- Different mission windows cannot be compared without a common rerun.
- Spatial-diversity selection cannot promote an ineligible candidate.

### UI and accessibility

- Visual regression for boundaries, legends and scale labels.
- Keyboard access and screen-reader labels.
- Chart/table equivalents.
- Contrast, non-color status indicators and reduced motion.
- Performance tests on an average laptop and mobile viewport.

## 16. Hackathon build sequence

### Phase 1 — Essential foundation

- Freeze coordinate, frame, observer-height, date, grid and metric conventions.
- Download/checksum data and kernels.
- Build the manifest and preprocessing pipeline.
- Create the regional candidate grid, boundary API and minimal terrain view.

**Completion test:** known coordinates map to expected terrain values and unsupported selection is rejected.

### Phase 2 — Minimum working scientific analysis

- Load the pinned SPICE bundle.
- Calculate Sun/Earth directions and local azimuth/elevation.
- Compute terrain metrics, horizons, sampled states and intervals.
- Add synthetic-terrain and golden-geometry tests.

**Completion test:** three fixed sites return reproducible results, including a terrain-blocked case.

### Phase 3 — Core user interface

- Build structured controls and validation messaging.
- Add contextual Moon, local terrain, candidate markers, horizon chart, timelines, provenance and limitations.

**Completion test:** a new user can configure and understand one site without developer explanation.

### Phase 4 — Candidate ranking

- Implement filtering, utilities, weights, spatial diversity, finalist refinement, failure analysis and comparison.

**Completion test:** constraints change eligibility predictably, weights change only scores, and identical requests reproduce results.

### Phase 5 — Natural-language input

- Attempt only after Phases 1–4 pass.
- Add constrained extraction, gazetteer resolution, clarification, confirmation and adversarial tests.

**Completion test:** the Shackleton example becomes a confirmed request while invented features and prompt injection cannot reach ranking.

### Phase 6 — Visualization polish

- Add coordinated scene transitions, labels, blocker markers, score legends, 5 m detail tiles and accessible states.
- Add heatmap or shadow frames only if all prior checks remain green.

**Completion test:** users can distinguish calculations, precomputed data and approximate animation.

### Phase 7 — Validation and demo preparation

- Run software, science, performance and accessibility suites.
- Freeze data/kernel/algorithm versions.
- Precompute the demo fixture, rehearse, and prepare screenshots/video.
- Seek expert feedback without blocking submission.

**Completion test:** the demo succeeds twice from a clean browser with all assumptions exposed and no external data dependency.

## 17. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| 5 m data overwhelms the team | Build stalls | Use 80 m common analysis; restrict 5 m to curated tiles |
| Horizon preprocessing is slow | Core science delayed | Start on Day 1; use 1° bins, adaptive sampling and fixed candidates |
| Frame/longitude mismatch | Invalid science | Pin frame/CRS and add landmark/raster round-trip tests |
| Terrain outside boundary is ignored | False visibility | Retain an `80°S–90°S` buffer and 200 km horizon |
| Globe is mistaken for analysis | Misleading presentation | Separate scenes and label provenance |
| Score implies safety | Trust issue | Use “comparative planning indicator” and show raw metrics |
| Roughness implies hazard detection | Scientific overclaim | State footprint and unresolved-feature limitation |
| DTE implies working communications | Scientific overclaim | Use Earth-center LOS terminology and enumerate exclusions |
| Query latency harms demo | Demo failure | Fixed limits, chunked arrays, caching and prewarming |
| LLM invents data | Invalid search | Gazetteer-only resolution, schema validation and confirmation |
| No candidates pass | Weak demo | Prevalidate the fixture and retain meaningful failure analysis |
| NASA asset is heavy | Poor browser performance | Default to the 13.2 MB flat GLB |
| External services fail | Demo failure | Bundle all derived data and kernels |

## 18. Demo scenario

Use a representative—not official CLPS—October 2028 scenario near Shackleton crater.

1. Start on the global Moon and point out that detailed analysis is restricted to `87°S–90°S`.
2. Resolve Shackleton through the official gazetteer and select a 20 km radius.
3. Set the mission window to `2028-10-01T00:00:00Z` through `2028-10-31T00:00:00Z`.
4. Set maximum slope to `10°`, minimum Earth-visible fraction to `0.50`, and weights to 45% Earth visibility, 35% illumination, 15% terrain and 5% science proximity.
5. Run the search and show the spatially diverse shortlist.
6. Compare a high-illumination candidate against a longer-DTE or flatter candidate.
7. Show the horizon, Sun/Earth paths, timelines and one terrain blockage.
8. Increase illumination weight and show that raw metrics remain fixed while ranking contributions change.
9. If ready, demonstrate the natural-language interpretation and confirmation flow.
10. End on the limitations panel.

Freeze the scenario as a regression fixture. If the provisional thresholds yield fewer than three candidates, remove the minimum Earth-visible hard constraint and retain Earth visibility as a preference; never silently alter thresholds during the live demo.

## 19. Post-hackathon expansion plan

1. Add more regional bundles through the same manifest contract.
2. Support tiled multi-resolution terrain and background preprocessing jobs.
3. Add formal terrain uncertainty propagation.
4. Add named Earth stations, Earth orientation, antenna masks and link budgets.
5. Add solar-array, power-storage and thermal models.
6. Add relay-orbit and surface-network analysis.
7. Add mission trajectory/SPICE uploads.
8. Add time-dependent rover routing.
9. Expand stress testing into spatial/temporal ensembles.
10. Add expert-curated science and mission scenario packages.
11. Automate regional validation before attempting whole-Moon support.
12. Establish independent review and formal verification before operational use.

## 20. Defaults to ratify at kickoff

No decision blocks implementation. Unless the team overrides them at kickoff:

- Use official overlapping Shackleton rim, Connecting Ridge and Peak Near Shackleton products for curated 5 m detail.
- Deploy one Docker service with S3-compatible static-asset storage.
- Use React Three Fiber for visualization.
- Use PGDA hillshade by default; add cropped WAC imagery only if time permits.
- Lead public positioning with early-stage mission planners while retaining plain-language education.
- Treat external NASA/lunar-science feedback as validation rather than a dependency.
- Use a clearly labeled representative mission scenario until official parameters are verified.
