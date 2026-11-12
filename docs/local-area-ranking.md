# Local-area ranking and locations on the 3D Moon

The prepared polar search already evaluates the eligible 500 m candidate grid
inside a selected circle. Selecting a point defines the circle's center; it does
not restrict the search to that point. Detailed terrain products, mission hard
constraints, scoring anchors and temporal caches are unchanged.

Outside prepared coverage, **Rank this area** now evaluates a local southern
hemisphere circle instead of only its center. This is an exploratory ranking
using the verified global LOLA grid; it is separate from detailed polar analysis.

## Coarse local ranking

- Use the drawn circle or coordinate/radius inputs, from 1–5 km radius.
- Choose dates for 1, 3 or 7 days, then balanced sunlight/Earth view, sunlight only,
  or Earth visibility only. These are local exploratory priorities, separate from
  the detailed mission form's criteria and hard constraints.
- Candidates form a fixed 2 km lattice inside the geodesic circle. A 5 km circle
  has 21 samples, a 3 km circle has 9, and a radius below 2 km may have only its
  center. At the equator only the southern part is evaluated.
- Each candidate gets independently sampled elevation and a 72-bearing horizon
  with 2 km radial steps to 200 km, using the existing global-preview method.
  Horizons cannot resolve nearby obstacles or fine hazards.
- JPL ephemerides are calculated once for the common window, then the existing
  batched five-minute visibility analysis evaluates every candidate.
- Score = 100 × (sunlight weight × sunlight fraction + Earth weight × Earth-view
  fraction). Earth weight is 1 minus sunlight weight. Equal scores are ties;
  deterministic numbering is not additional evidence.
- No fine-scale slope, roughness, landing suitability, PSR/resource ranking or
  detailed mission hard-constraint screening is invented from coarse terrain.
- Edited area, dates or priorities explicitly mark old results as stale. A JSON
  export records the actual applied request, individual metrics and provenance.

The isolated worker operation is `rank_area`; its endpoint is
`POST /api/v1/global/rank-area`. It shares existing concurrency, cancellation and
protective-watchdog handling. Missing/unverified global data fails closed.
The window is limited to seven days to keep completed requests fast; the
performance goal remains successful mean completion below 30 seconds, not a
30-second hard cutoff.

## All returned sites on the Moon

**Places to consider → View sites on 3D Moon** opens the shortlist and an
eligible-location toggle. Gold markers identify ranked candidates, green markers
other eligible points, and white the selected point. Clicking markers, numbered
labels or the accessible location selector updates the coordinate/score readout.
**Inspect mapped site** opens existing scientific evidence, including locations
outside the shortlist. The extra-site inspection now opens its evidence dialog.

**Frame all sites** positions the camera above the local marker cloud so nearby
sites do not collapse into a single distant dot. **Fit view** shows the whole
Moon. The prepared local search returns all eligible map points up to the existing
5,000-point map budget; larger searches display an explicit spatial-sample notice.
The map never claims omitted points are displayed. All shortlisted points are
retained by the existing server sampling rule.

Coarse local results use the same viewer through **View all … locations in 3D**.
Their notice identifies coarse scoring and resolution. Markers follow the
display terrain and are raised for visibility; the Moon's visual height mesh does
not replace the scientific terrain used in the scoring calculations.

## Verification

- `python -m pytest backend/tests/test_local_area_ranking.py -q`: invalid inputs,
  unavailable data, lattice containment at poles/date line, scoring order,
  reweighting, provenance and agreement with the existing point calculation.
- `python scripts/local_ranking_smoke.py`: actual 21-site coarse calculations,
  desktop/phone 3D views, accessible selection, stale-result notices, all returned
  polar eligible locations and scientific evidence inspection.
- `python scripts/benchmark_completed_searches.py --operation
  near_side_5km_7day_coarse_ranking --operation
  far_side_5km_7day_coarse_ranking`: completed-request timing, three repetitions
  per case. Errors/timeouts never count as fast successful results.

Global terrain must be installed using the existing `prepare_global.py` workflow
on another host; no large scientific grid or kernels are committed to Git.

Local close-ups adaptively subdivide the display mesh near the point cloud. The
height and color interpolation converges at each pole to avoid a longitude fan.
This improves rendering continuity; it does not create finer scientific terrain.

On the local workstation, three completed 5 km / seven-day ranking requests per
case averaged 1.86 s near-side and 1.85 s far-side (maximum 1.93 s). These are
measurements of successful responses, not a public-host latency guarantee.
