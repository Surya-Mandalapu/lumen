# Scientific data workflow

Large NASA/USGS/JPL inputs and generated artifacts are deliberately excluded from Git.

## Required workflow

1. Review `source_catalog.json` and the source product documentation.
2. Download source files into `data/raw/<source-id>/`.
3. Record exact filenames, product versions, byte sizes, SHA-256 hashes, CRS/WKT, units,
   no-data values, and source URLs.
4. Reproject/crop the rankable `87°S–90°S` cap while preserving an `80°S–90°S`
   terrain buffer for horizon calculations.
5. Generate versioned artifacts in `data/derived/<dataset-version>/`.
6. Update `backend/app/data/dataset-manifest.json` with hashes and artifact paths.
7. Run `npm run verify:data`.
8. Change manifest status to `prepared` only after independent spot checks and scientific
   regression fixtures pass.

The application must fail closed while the manifest is not prepared. Never replace missing
NASA-derived values with synthetic candidate results in a user-facing build.

