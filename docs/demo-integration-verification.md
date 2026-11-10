# Integrated demo verification — November 9, 2026

Branch: `codex/demo-integration`. Integrates the November 7 global-preview and
polar-cap preparation update with the local study-area preview, candidate-score
explanations, selection funnel and comparison tradeoffs. The regional science
calculations and the bundled 1,680-candidate dataset retain their source provenance.

## Reproducible setup

Follow the virtual-environment setup in the README, then install
`scripts/data/requirements.txt`, run `npm run prepare:data` and
`npm run prepare:global`. The optional 31.7 MB NASA global elevation TIFF is
verified against its pinned SHA-256 before conversion; the generated artifact
is verified by the API before use. Neither the source nor the global bundle is
committed. Full polar-cap preparation is deferred.

The Windows checkout initially had CRLF bytes in `features.json`, which did not
match its pinned artifact hash. Restoring the recorded LF bytes fixed integrity
verification. `.gitattributes` now treats derived science artifacts as binary
for Git's newline conversion, so Windows and Linux preserve identical bytes.
The manifest and science values were not changed to accommodate the mismatch.

## Automated validation

- 15 frontend tests pass, including numeric constraint evidence, applied score
  weights, coverage geometry and comparison tradeoffs.
- 53 backend/data tests pass with no skips. This includes actual JPL-kernel
  regional searches, near/far-side global previews, both poles, exact cache
  equivalence, batched analysis equivalence and cap-tile integrity regressions.
- Production TypeScript/Vite build passes. The existing Three.js chunk-size
  warning remains.
- Bundled science and all four pinned JPL kernel hashes pass verification.
- Ruff passes. The naive-datetime rejection test explicitly documents its
  intentional use of a date without a timezone.
- `npm audit` reports zero vulnerabilities, including development dependencies.
  Vite, its React plugin, Vitest and concurrently were updated within their
  existing major versions; the lockfile includes the patched transitive packages.

CI now prepares global terrain and runs the data regressions in addition to the
existing API tests, frontend tests, production build, lint and manifest verification.

## Browser verification

Run `python scripts/browser_smoke.py` against the built application served by
FastAPI at `http://127.0.0.1:8000`. Install Playwright and its bundled Chromium
first, as described in the README. The check exercises:

- Pointer and keyboard study-area selection, partial-coverage disclosure,
  submission of a selected circle, and explicit empty results.
- The monthly regional search, shortlist explanations and same-window comparison.
  Opening those explanation panels makes no additional requests.
- Download and parse the full regional JSON, including request, counts and kernel
  provenance; edit the area and verify previous results are marked stale.
- Global map pointer and keyboard selection; real near-side and far-side
  previews; 3D terrain; five-minute sample inspection; JSON download and provenance.
- Changed-input notices, rejected overlong windows, injected 503 responses,
  successful retry and unavailable-global-terrain recovery.
- Desktop and 390 px mobile layouts without horizontal page overflow, uncaught
  JavaScript errors or unexpected HTTP/console errors.

Screenshots, downloaded JSON and the machine-readable report are saved under
ignored `data/cache/demo-qa/`. The installed Chrome channel canceled one export
during the first probe; the documented bundled-Chromium run completed the exports
and the full journey successfully.

The global elevation API intentionally provides coarse single-point geometry,
not global site ranking. Full-cap datasets, formal uncertainty estimates, fine
hazard assessment and RF link budgets remain outside this demo. Docker was not
tested; its default image still includes the regional bundle only.
