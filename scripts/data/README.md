# Scientific data workflow

Large NASA/USGS/JPL inputs and most generated artifacts are excluded from Git. The five
small files in `data/derived/pgda-demo-v1/` are an explicit exception so a checkout
can run the curated demonstration without downloading the source rasters.

## Runnable MVP preparation

The curated MVP bundle contains real NASA LOLA measurements for a 20 km square around
the south pole. It does **not** fulfill the eventual full-cap coverage convention.

```powershell
python -m pip install -r scripts/data/requirements.txt
python scripts/data/prepare_terrain.py
python scripts/data/prepare_science_layers.py
python scripts/data/prepare_kernels.py
```

Terrain preparation downloads the official 80 m DEM (about 181 MB), plus the published
100 m-baseline slope and roughness maps on their 1 km output grids. Those metrics are
sampled by nearest source cell, without suggesting a finer measurement spacing.
The 500 m candidate grid excludes the exact pole, where azimuth is singular.

Outputs are `data/derived/pgda-demo-v1/terrain.npz`, `terrain.json`, and `metadata.json`.
The NPZ has stable IDs, projected/geographic coordinates, radial DEM elevation,
published slope/roughness, 72 horizon angles, and blocker distances. The mesh JSON
is an 81×81 display height grid; row zero is north (`y=+10000 m`).
The metadata records original filenames, URLs, SHA-256 hashes, byte counts, CRS,
units, no-data policy, source resolutions, and artifact hashes.

Horizons use great-circle destinations, a 1,737,400 m reference sphere, DEM surface
height and a 2 m observer. Every 5° ray is sampled every 80 m out to 20 km and every
320 m thereafter to 200 km, using the full 80–90°S buffered DEM. Missing samples
exclude a candidate. The coarse angular/radial sampling can miss narrow terrain
blockers, so results remain comparative prototype indicators. DEM confidence layers
and 5 m site refinements are unavailable. The separate science-layer preparation
adds source-backed PSR distances and named feature centers as described below.

## PSR and named-feature preparation

`prepare_science_layers.py` downloads the official `LPSR_80S_20MPP_ADJ.TIF`
binary PSR map and the USGS/IAU Moon nomenclature center-point KMZ. Source
checksums are pinned: a nightly gazetteer export that has changed will fail
verification until a new snapshot is reviewed and versioned. Existing checked-in
derived artifacts remain runnable independently of these source downloads.

`terrain.npz` gains `distance_psr_km`, the projected distance to the union of
mapped 20 m PSR pixel areas. A site within a PSR receives zero. An exact rectangle
distance calculation searches all potentially closer boundary cells, avoiding a
distance to cell centers or to a coarse display mask. The 60 km crop is accepted
only after proving that terrain outside it cannot contain a closer PSR for any
prepared site. Local projection scale distortion is below 0.01 percent in this crop.

`psr.json` contains 100×100 north-to-south display cells over the 20 km square,
each holding the fraction of mapped PSR area among its 10×10 original 20 m pixels.
This is a static scientific map, not a date-specific shadow or an ice detection.

`features.json` contains all 30 IAU-adopted feature centers south of 85°S from the
pinned USGS snapshot, with official IDs, names, coordinates, diameters, links and
approval status. Runtime feature proximity is a great-circle distance to a published
center. Centers and nominal diameters are nomenclature locations, not precise rims
or geological boundaries. Informal labels such as Connecting Ridge are excluded.
Candidate coverage is unchanged by the broader catalogue.

Run the preparation regression checks with:

```powershell
python -m pytest scripts/data/test_prepare_terrain.py scripts/data/test_prepare_science_layers.py -q
```

Source documentation and citation:
[NASA PGDA product 90](https://pgda.gsfc.nasa.gov/products/90),
Barker et al. (2023), *Planet. Sci. J.* 4, 183,
[doi:10.3847/PSJ/acf3e1](https://doi.org/10.3847/PSJ/acf3e1).

## Required workflow

1. Review `source_catalog.json` and the source product documentation.
2. Download source files into `data/raw/<source-id>/`.
3. Record exact filenames, product versions, byte sizes, SHA-256 hashes, CRS/WKT, units,
   no-data values, and source URLs.
4. Reproject/crop the rankable `87°S–90°S` cap while preserving an `80°S–90°S`
   terrain buffer for horizon calculations.
5. Generate versioned artifacts in `data/derived/<dataset-version>/`.
6. Update the derived bundle metadata with hashes and artifact paths, and keep the
   coverage/configuration declaration in `backend/app/data/dataset-manifest.json` aligned.
7. Run `npm run verify:data`.
8. Run independent spot checks and scientific regression fixtures. Runtime marks
   readiness `prepared` only after loading and verifying both terrain and kernel artifacts.

The application fails closed when verified data is unavailable. Never replace missing
NASA-derived values with synthetic candidate results in a user-facing build.

