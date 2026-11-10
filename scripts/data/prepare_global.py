"""Prepare the pinned NASA LOLA global 16-pixel/degree preview elevation grid."""

from __future__ import annotations

import hashlib
import json
import urllib.request
from pathlib import Path

import numpy as np
import rasterio

ROOT = Path(__file__).resolve().parents[2]
URL = "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_16_uint.tif"
SOURCE_SHA256 = "45a2b32d56e81ed30db07fead8abc842b249b6511219d9ca2c53f81bc2dc5d62"


def main():
    source = ROOT / "data/raw/global-lola/ldem_16_uint.tif"
    source.parent.mkdir(parents=True, exist_ok=True)
    if not source.exists():
        partial = source.with_suffix(".partial")
        urllib.request.urlretrieve(URL, partial)
        partial.replace(source)
    if hashlib.sha256(source.read_bytes()).hexdigest() != SOURCE_SHA256:
        raise SystemExit("Global NASA elevation source checksum mismatch")
    with rasterio.open(source) as raster:
        encoded = raster.read(1)
    if encoded.shape != (2880, 5760) or encoded.dtype != np.uint16:
        raise SystemExit("Unexpected global elevation grid")
    output = ROOT / "data/derived/global-preview-v1"
    output.mkdir(parents=True, exist_ok=True)
    artifact = output / "elevation.npz"
    # NASA unsigned TIFF encoding: half metres relative to a 1,727,400 m sphere.
    elevation = encoded.astype(np.float32) * 0.5 - 10_000
    np.savez_compressed(artifact, elevation_m=elevation)
    metadata = {
        "dataset_version": "global-lola-preview-v1",
        "source_url": URL,
        "source_sha256": SOURCE_SHA256,
        "documentation_url": "https://svs.gsfc.nasa.gov/4720/",
        "artifact_sha256": hashlib.sha256(artifact.read_bytes()).hexdigest(),
        "pixels_per_degree": 16,
        "reference_radius_m": 1737400,
        "source_frame": "MOON_ME (LOLA mean Earth/polar axis)",
        "row_order": "north_to_south",
        "longitude_extent_deg": [-180, 180],
        "pixel_registration": "pixel_centers",
        "elevation_conversion": "unsigned TIFF value * 0.5 - 10000 metres",
    }
    (output / "metadata.json").write_text(json.dumps(metadata, indent=2))
    print(f"Prepared verified global elevation preview: {elevation.shape}")


if __name__ == "__main__":
    main()
