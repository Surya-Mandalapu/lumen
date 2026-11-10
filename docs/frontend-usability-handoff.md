# Guided frontend and usability handoff

Implemented from `03_Frontend_and_Usability.docx` on `codex/frontend-usability`, based on integration commit `5988740`.

## What changed

South-pole 3D follow-up: area selection now opens real elevation terrain in 3D, with visible 3D terrain / 3D Moon controls. Both surfaces accept point selection; the separate Coverage map choice was removed at the user’s request. Coordinate input remains available by keyboard, and backend coverage validation still gates submission. The Moon camera faces the south pole, with pole zoom and reset controls. Terrain cameras center their actual extents; selected areas have a gold outline. Inspection also defaults to 3D. Rendering failures explicitly identify the fallback. Static views render on demand. Browser checks verify actual orbit-image changes and south-pole zoom at desktop and 390 px; additional screenshots are `south-pole-terrain-{1440,390}.png` and `south-pole-moon-{1440,390}.png`.

- Three stages: Choose an area → Describe the mission → Review sites. Back navigation preserves draft inputs; switching to whole-Moon preview preserves the regional workspace.
- Read-only backend coverage catalog and overlap preview use verified candidate arrays and scientific metadata. Display meshes never define coverage. Prepared areas, exclusions, surrounding context and the selected circle have separate symbols. Coordinate entry, 3D surface selection and approved-landmark selection are supported. Outside selections block submission; partial selections require acknowledgment.
- Existing Balanced, More sunlight and More Earth visibility configurations are reused. Dates are explicit. Required limits, custom priorities, mission text parsing, imports and browser-local saved missions live under Advanced. Unavailable layers have explanations and disabled controls; imported unsupported requirements can be explicitly removed.
- Backend-advertised public frontend limits: local radius ≤5 km, local duration ≤7 days; full prepared region uses October 1–31, 2028. The review screen shows effective coverage, dates, priorities and every applied limit before submission. No dates or constraints are silently relaxed.
- Initially three candidate cards, each with exactly three numeric metrics: time with sunlight, time with Earth in view, and slope. Additional candidates can be revealed. Selection explains the strongest actual weighted contribution and a returned-data tradeoff. Two-site comparison uses one applied mission window and labels scores less than two points apart as near ties.
- One focus-managed inspection dialog with keyboard-operable tabs: overview, timeline, horizon, blockers/events, scenarios, terrain/sky and provenance/exports. Scientific JSON, timeline CSV, 2D/3D terrain, global context and local sky are retained. Timeline and horizon charts have table alternatives; reduced motion disables timeline playback.
- Readable mission summary uses only the returned applied request and up to two selected sites. It contains priorities, requirements, coverage, tradeoffs, data sampling, unavailable layers and limitations. HTML download and browser Print/Save as PDF are separate from scientific JSON.
- Input edits mark results as stale. Aborted, canceled and out-of-order responses cannot replace a newer mission. Recovery messages preserve inputs and do not fabricate progress percentages.

## Verification

Commands (from repository root):

```sh
npm ci --prefix apps/web
npm --prefix apps/web run build
npm --prefix apps/web test
PYTHONPATH=backend .venv/bin/python -m pytest -q
.venv/bin/ruff check backend/app/coverage_api.py backend/tests/test_coverage_api.py scripts/browser_smoke.py
LUMEN_DATA_ROOT=data/derived/lunar-south-cap-v1 PYTHONPATH=backend .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
.venv/bin/python scripts/browser_smoke.py --channel chrome --output data/cache/frontend-usability-qa
```

Frontend: **29 tests passed**. Python: **56 tests passed**. Production build and targeted Ruff checks pass. The build retains the existing large lazy-loaded Three.js chunk warning. Local Node 25 produces a Vitest engine warning; Node 24 is within its supported range.

The browser script exercises real scientific searches and global near-/far-side previews, source provenance, staged input validation, partial/outside coverage, progressive results, same-window comparison, focus restoration, reduced motion, detail tabs, 3D rendering, JSON/CSV exports, stale applied summaries, supported empty results, service recovery and mobile width. Job states and delayed old completion are separate deterministic fixtures, tested at 1440 px and 390 px.

Local QA artifacts (ignored by Git): `data/cache/frontend-usability-qa/`.

- `report.json`: machine-readable checks, elapsed search time, browser/console/HTTP errors.
- `area-desktop.png`, `area-mobile.png`, `review-mobile.png`.
- `regional-desktop.png`, `regional-mobile.png`, `comparison-mobile.png`.
- `summary-desktop.png`, `retained-mission-1440.png`, `retained-mission-390.png`.
- `global-desktop.png`, `global-mobile.png`.
- `regional-analysis.json`, `regional-timeline.csv`, `global-preview.json`.
- `mission-summary.html`, `mission-summary.pdf`: applied-mission readable and print-layout samples.

The full cap is local scientific data, not committed by this change. The default committed patch remains supported. Verify data preparation and run the browser script against the intended dataset before deployment.

## Backend integration contract and remaining work

`GET /api/v1/coverage` advertises dataset identity, verified geometry, scientific exclusions, candidate spacing, available layers, public limits and search mode. `POST /api/v1/coverage/preview` returns an exact supported candidate count and inside/partial/outside status. Centers outside 87–90°S are rejected by the preview consistently with search validation. Partial selection analyzes only the supported intersection; the exact pole has no fabricated result.

The current backend advertises `search_service.mode = synchronous`. The frontend truthfully says it cannot report incremental progress and that Stop waiting cannot terminate server computation. No live queue has been added or claimed.

For a job backend, advertise `mode = jobs`; accept `POST /api/v1/jobs`, poll `GET /api/v1/jobs/{id}`, cancel via `DELETE /api/v1/jobs/{id}`, and return the existing scientific response embedded in a complete job or from `/result`. Statuses: queued, running, complete, canceled, failed, expired. Optional queue position is displayed verbatim. HTTP 429/410/503 map to queue-full/expired/waking. The fixtures describe and verify this contract; the backend owner must confirm or adapt it before enabling jobs. Server-side enforcement of public deployment limits, queue capacity, execution cancellation and restart persistence remain backend work; internal scientific search validation is preserved.

## Human usability study — pending

Automated checks do not satisfy the document's five-person study. No participants have been recruited or tested. Release acceptance remains **at least four of five first-time participants completing the tasks without coaching**.

Use five people unfamiliar with the implementation. Give each the same task:

> Choose a supported lunar area, set a one-week mission and a priority, obtain a shortlist, explain one tradeoff between two sites, then download a readable summary for your chosen mission.

Allow up to ten minutes. Do not point out controls. Observe and record:

1. Can they distinguish supported coverage from surrounding context and respond correctly to partial coverage?
2. Can they distinguish required limits from ranking preferences and verify the review screen?
3. Can they explain the three card metrics and a same-window tradeoff without interpreting percentages as probability?
4. Can they inspect deeper evidence and return to the shortlist?
5. Can they download the readable applied-mission summary and recognize stale results after an edit?

Record task completion, elapsed time, mistakes, assistance, confidence (1–5), and the participant's wording of the tradeoff. Ask what they expected each stage to do and which scientific term was least clear. Include at least two mobile sessions; also perform a keyboard-only session.

| Participant | Device/input | Complete unaided | Time | Confusion / observed issue | Follow-up fix |
| --- | --- | --- | --- | --- | --- |
| 1 | Pending | Not run | — | — | — |
| 2 | Pending | Not run | — | — | — |
| 3 | Pending | Not run | — | — | — |
| 4 | Pending | Not run | — | — | — |
| 5 | Pending | Not run | — | — | — |

Prioritize repeated misunderstandings and any wrong-mission export. Apply fixes and rerun the relevant browser checks, then retest failed tasks. Record actual observations; do not replace participant testing with automated results.

## Repository delivery

Delivery branch: `codex/frontend-usability`. The user requested publishing these changes to GitHub. Large scientific inputs and local QA artifacts remain ignored; reproduce them with the commands above. The five-person study and live job backend remain pending as described above.
