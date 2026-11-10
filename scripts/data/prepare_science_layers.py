"""Add source-backed PSR proximity and an IAU feature catalogue to the terrain bundle."""

from __future__ import annotations

import argparse
import json
import re
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

import numpy as np
import rasterio
from prepare_terrain import ROOT, SOURCE_ROOT, sha256
from rasterio.windows import from_bounds
from scipy.ndimage import binary_erosion
from scipy.spatial import cKDTree

GAZETTEER_URL = (
    "https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/"
    "MOON_nomenclature_center_pts.kmz"
)
GAZETTEER_SHA256 = "09bb71bc63f994e13e3c16368ba7d3a63d31cb7110636730f8274cb83f226d48"
PSR_FILENAME = "LPSR_80S_20MPP_ADJ.TIF"
PSR_SHA256 = "ad95311b81db773039af441dd66a017f024327858c6e0314b8c92bf2f470834e"
NS = {"k": "http://www.opengis.net/kml/2.2"}


def retrieve(path: Path, url: str, expected_sha256: str | None) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        partial = path.with_suffix(".partial")
        urllib.request.urlretrieve(url, partial)
        partial.replace(path)
    digest = sha256(path)
    if expected_sha256 is None or digest != expected_sha256:
        raise ValueError(f"Unpinned or changed source: {path.name} (SHA-256 {digest})")
    return digest


def features_from_kmz(path: Path) -> list[dict]:
    with zipfile.ZipFile(path) as archive:
        kml = next(name for name in archive.namelist() if name.endswith(".kml"))
        root = ET.fromstring(archive.read(kml))
    features = []
    for placemark in root.findall(".//k:Placemark", NS):
        fields = {
            node.attrib["name"]: node.text
            for node in placemark.findall(".//k:SimpleData", NS)
        }
        latitude = float(fields.get("center_lat", "90"))
        if latitude > -85 or fields.get("approval") != "Adopted by IAU":
            continue
        link = fields["link"].replace("http://", "https://")
        identifier = re.search(r"/Feature/(\d+)", link).group(1)
        features.append(
            {
                "id": f"iau-{identifier}",
                "iau_id": int(identifier),
                "name": placemark.findtext(
                    "k:name", default=fields["clean_name"], namespaces=NS
                ),
                "clean_name": fields["clean_name"],
                "latitude_deg": latitude,
                "longitude_deg_east": (float(fields["center_lon"]) + 180) % 360 - 180,
                "diameter_km": float(fields["diameter"]),
                "feature_type": fields["type"],
                "source_url": link,
                "approved": True,
                "approval_date": fields.get("approvaldt", "").split(" ")[0],
            }
        )
    return sorted(features, key=lambda feature: feature["name"].casefold())


def distances_to_psr_cells(mask, transform, x, y):
    """Exact projected point-to-union distance to closed source pixel rectangles.

    A tree of boundary pixel centers only narrows the search: every rectangle
    whose center could improve the initial upper bound is tested explicitly.
    This avoids treating PSR center points or a display-resampled mask as edges.
    """
    resolution = abs(transform.a)
    half = resolution / 2
    boundary = mask & ~binary_erosion(mask, structure=np.ones((3, 3)), border_value=0)
    rows, cols = np.where(boundary)
    if not len(rows):
        raise ValueError("No mapped PSR cells within the buffered crop")
    centers = np.column_stack(
        (
            transform.c + (cols + 0.5) * transform.a,
            transform.f + (rows + 0.5) * transform.e,
        )
    )
    tree = cKDTree(centers)
    points = np.column_stack((x, y))
    nearest_center, _ = tree.query(points)
    neighborhoods = tree.query_ball_point(
        points, nearest_center + np.sqrt(2) * half + 1e-8
    )
    distances = np.empty(len(x), dtype=np.float64)
    point_cols = np.floor((x - transform.c) / transform.a).astype(int)
    point_rows = np.floor((y - transform.f) / transform.e).astype(int)
    for i, indices in enumerate(neighborhoods):
        if mask[point_rows[i], point_cols[i]]:
            distances[i] = 0
        else:
            offset = np.maximum(np.abs(centers[indices] - points[i]) - half, 0)
            distances[i] = np.sqrt((offset**2).sum(axis=1)).min()
    return distances


def record_artifact(metadata, path):
    metadata["artifacts"][path.name] = {
        "sha256": sha256(path),
        "bytes": path.stat().st_size,
    }


def replace_source(metadata, source):
    metadata["sources"] = [s for s in metadata["sources"] if s["id"] != source["id"]]
    metadata["sources"].append(source)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output", type=Path, default=ROOT / "data/derived/pgda-demo-v1"
    )
    parser.add_argument("--features-only", action="store_true")
    args = parser.parse_args()
    metadata_path = args.output / "metadata.json"
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    gazetteer_path = ROOT / "data/raw/iau-gazetteer/MOON_nomenclature_center_pts.kmz"
    digest = retrieve(gazetteer_path, GAZETTEER_URL, GAZETTEER_SHA256)
    source = {
        "id": "iau-gazetteer",
        "filename": gazetteer_path.name,
        "url": GAZETTEER_URL,
        "sha256": digest,
        "bytes": gazetteer_path.stat().st_size,
        "landing_page": "https://planetarynames.wr.usgs.gov/GIS_Downloads",
        "control_network": "LOLA 2011",
        "latitude_type": "planetocentric",
        "longitude_direction": "east",
        "units": "degrees; diameter in kilometres",
        "snapshot_policy": "Official nightly export; immutable downloaded snapshot pinned by SHA-256.",
    }
    features = features_from_kmz(gazetteer_path)
    features_path = args.output / "features.json"
    features_path.write_text(
        json.dumps(
            {
                "version": "iau-south-85s-v1",
                "source": source,
                "features": features,
                "distance_definition": "Great-circle distance to the published feature center, not its rim or boundary.",
                "limitations": [
                    "Feature centers and diameters are nomenclature locations, not precise geological boundaries.",
                    "Catalogue coverage extends to 85 degrees south; candidates remain inside the prepared terrain square.",
                    "Unofficial regional labels such as Connecting Ridge are omitted.",
                ],
            },
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    replace_source(metadata, source)
    record_artifact(metadata, features_path)
    if args.features_only:
        metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
        print(f"Prepared {len(features)} adopted IAU feature centers")
        return

    psr_path = ROOT / "data/raw/pgda-product-90" / PSR_FILENAME
    digest = retrieve(psr_path, SOURCE_ROOT + PSR_FILENAME, PSR_SHA256)
    with np.load(args.output / "terrain.npz", allow_pickle=False) as archive:
        arrays = {name: archive[name] for name in archive.files}
    # A broad buffer is sufficient only after proving its outside boundary cannot
    # be closer than the nearest mapped PSR for every prepared candidate.
    with rasterio.open(psr_path) as dataset:
        window = from_bounds(-30000, -30000, 30000, 30000, dataset.transform)
        raw = dataset.read(1, window=window)
        transform = dataset.window_transform(window)
        if not np.isfinite(raw).all() or not np.isin(raw, [0, 1]).all():
            raise ValueError("PSR crop has unknown or unexpected source classes")
        distances = distances_to_psr_cells(
            raw == 1, transform, arrays["x_m"], arrays["y_m"]
        )
        outside_lower_bound = np.minimum(
            30000 - np.abs(arrays["x_m"]), 30000 - np.abs(arrays["y_m"])
        )
        if not np.all(distances < outside_lower_bound):
            raise ValueError(
                "PSR crop is too small to prove nearest-distance completeness"
            )
        display_window = from_bounds(-10000, -10000, 10000, 10000, dataset.transform)
        display = dataset.read(1, window=display_window)
        fractions = display.reshape(100, 10, 100, 10).mean(axis=(1, 3))
        psr_source = {
            "id": "psr",
            "filename": PSR_FILENAME,
            "url": SOURCE_ROOT + PSR_FILENAME,
            "sha256": digest,
            "bytes": psr_path.stat().st_size,
            "crs_wkt": dataset.crs.to_wkt(),
            "resolution_m": 20,
            "nodata": "NaN",
            "units": "binary; 1=mapped PSR, 0=not mapped PSR",
            "citation": metadata["citation"],
            "landing_page": metadata["source_landing_page"],
        }
    arrays["distance_psr_km"] = distances / 1000
    np.savez_compressed(args.output / "terrain.npz", **arrays)
    display_path = args.output / "psr.json"
    display_path.write_text(
        json.dumps(
            {
                "width": 100,
                "height": 100,
                "extent_m": [-10000, -10000, 10000, 10000],
                "resolution_m": 200,
                "source_resolution_m": 20,
                "row_order": "north_to_south",
                "psr_fraction": np.round(fractions.ravel(), 4).tolist(),
                "source": "NASA PGDA LOLA LPSR_80S_20MPP_ADJ.TIF",
                "description": "Mapped PSR area fraction within each 200 m display cell; not date-specific shadow.",
            },
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    replace_source(metadata, psr_source)
    for path in (args.output / "terrain.npz", display_path):
        record_artifact(metadata, path)
    metadata["dataset_version"] = "pgda-demo-v1.1"
    metadata["preprocessing_version"] = "1.1.0"
    metadata["psr"] = {
        "distance_definition": "Projected distance to the union of mapped 20 m PSR pixel areas; zero inside.",
        "distance_resolution_m": 20,
        "distance_crop_extent_m": [-30000, -30000, 30000, 30000],
        "crop_completeness_checked": True,
        "display_resolution_m": 200,
        "distance_min_km": float(arrays["distance_psr_km"].min()),
        "distance_max_km": float(arrays["distance_psr_km"].max()),
    }
    metadata["limitations"] = [
        item
        for item in metadata["limitations"]
        if not item.startswith("PSR proximity and named-feature")
    ]
    metadata["limitations"] += [
        "PSR proximity uses mapped 20 m pixel areas in the polar projection; its local scale distortion is below 0.01 percent in the buffered crop.",
        "Mapped PSRs are not date-specific shadow predictions or evidence of accessible water ice.",
        "Feature proximity uses published IAU center coordinates, not geological feature boundaries.",
    ]
    metadata["limitations"] = list(dict.fromkeys(metadata["limitations"]))
    metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    print(
        f"Prepared PSR distances for {len(distances)} sites and {len(features)} IAU features"
    )


if __name__ == "__main__":
    main()
