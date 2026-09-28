# Stealth Lumen

Stealth Lumen is a hackathon prototype for comparing candidate lunar south-pole landing
sites using terrain, illumination, and geometric direct-to-Earth visibility indicators.

The repository now contains a runnable product foundation:

- React/TypeScript contextual 3D interface and structured-search shell.
- FastAPI request validation and versioned regional dataset manifest.
- Explicit scientific conventions and a fail-closed candidate-search endpoint.
- Reproducible data-source catalog and preprocessing handoff.
- Frontend/backend tests, CI, and Docker packaging.

The full [product and implementation plan](./LUNAR_LANDING_SITE_PLAN.md) remains the source
for scope and sequencing.

## Local setup

Requirements: Node.js 22+ and Python 3.12+.

```powershell
npm install
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -e ".\backend[dev]"
npm run dev
```

Open `http://localhost:5173`. FastAPI documentation is available at
`http://localhost:8000/docs`.

## Verification

```powershell
npm test
npm run build
npm run verify:data
```

## Scientific data

Large NASA/USGS/JPL source files and generated artifacts are not committed. See
[`scripts/data/README.md`](./scripts/data/README.md) and
[`scripts/data/source_catalog.json`](./scripts/data/source_catalog.json).

The candidate-search endpoint intentionally returns `503 scientific_data_not_prepared`
until a verified derived dataset bundle is present. This prevents the UI from presenting
fabricated metrics as scientific results.

> This project is a prototype planning tool, not flight-certified mission-planning software
> and not a landing-safety certification system.
