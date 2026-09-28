# Architecture foundation

## Runtime shape

- React/TypeScript renders the contextual globe, structured-search controls, analytical
  views, and accessibility equivalents.
- FastAPI owns validation, scientific calculations, ranking, provenance, and request limits.
- Offline Python/GDAL/SPICE workflows create immutable, versioned scientific artifacts.
- Large assets live in object storage or deployment artifacts, not Git.

The MVP intentionally uses a single API service and static frontend build. A queue, database,
authentication, and user persistence are excluded until the scientific core requires them.

## Trust boundaries

- Browser values are presentation inputs, not authoritative scientific results.
- The API validates every request and ignores unknown fields.
- LLM output, when added, must pass the same structured validation path.
- Candidate search fails closed until the dataset manifest is `prepared`.
- Every result will include dataset, kernel, and algorithm versions.

## Next implementation slices

1. Create reproducible LOLA crop, quality-mask and candidate-grid preprocessing.
2. Pin and verify the DE440 SPICE kernel bundle.
3. Implement body-fixed/local-frame geometry and synthetic-terrain tests.
4. Generate regional horizon profiles.
5. Implement illumination/DTE interval extraction.
6. Implement transparent filter/rank/shortlist responses.
7. Connect real results to the existing UI shell.

