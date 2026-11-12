"""Build the hemisphere discovery index from the already pinned official IAU export."""

import json

from prepare_science_layers import GAZETTEER_SHA256, GAZETTEER_URL, features_from_kmz
from prepare_terrain import ROOT, sha256


def main():
    source = ROOT / "data/raw/iau-gazetteer/MOON_nomenclature_center_pts.kmz"
    if sha256(source) != GAZETTEER_SHA256:
        raise ValueError("Hemisphere landmark source checksum mismatch")
    features = features_from_kmz(source, maximum_latitude_deg=0)
    output = ROOT / "backend/app/data/hemisphere-landmarks.json"
    output.write_text(
        json.dumps(
            {
                "version": "iau-southern-hemisphere-v1",
                "source": {
                    "url": GAZETTEER_URL,
                    "sha256": GAZETTEER_SHA256,
                    "landing_page": "https://planetarynames.wr.usgs.gov/GIS_Downloads",
                    "control_network": "LOLA 2011",
                    "latitude_type": "planetocentric",
                },
                "features": features,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    print(
        f"Prepared {len(features)} adopted southern hemisphere feature centers: {sha256(output)}"
    )


if __name__ == "__main__":
    main()
