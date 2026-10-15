"""Regression checks for source-cell proximity and approved feature selection."""

import zipfile

import numpy as np
from prepare_science_layers import distances_to_psr_cells, features_from_kmz
from rasterio.transform import from_origin


def test_psr_distance_is_to_pixel_area_not_its_center():
    mask = np.zeros((7, 7), dtype=bool)
    mask[3, 3] = True
    transform = from_origin(-70, 70, 20, 20)
    # Center (0,0), exact pixel edge (10,0), then 30 m and diagonal offsets.
    result = distances_to_psr_cells(
        mask, transform, np.array([0.0, 10, 40, 40]), np.array([0.0, 0, 0, 50])
    )
    np.testing.assert_allclose(result, [0, 0, 30, 50], atol=1e-10)


def test_tree_distance_matches_brute_force_all_psr_rectangles():
    rng = np.random.default_rng(41)
    mask = rng.random((40, 40)) < 0.3
    transform = from_origin(-400, 400, 20, 20)
    points = rng.uniform(-390, 390, size=(150, 2))
    rows, cols = np.where(mask)
    centers = np.column_stack((-400 + (cols + 0.5) * 20, 400 - (rows + 0.5) * 20))
    offsets = np.maximum(np.abs(points[:, None, :] - centers[None, :, :]) - 10, 0)
    expected = np.sqrt((offsets**2).sum(axis=2)).min(axis=1)
    actual = distances_to_psr_cells(mask, transform, points[:, 0], points[:, 1])
    np.testing.assert_allclose(actual, expected, atol=1e-10)


def test_feature_import_filters_unapproved_and_normalizes_longitude(tmp_path):
    def placemark(name, status, latitude):
        fields = {
            "clean_name": name,
            "center_lat": latitude,
            "center_lon": "271.6553",
            "approval": status,
            "link": "http://planetarynames.wr.usgs.gov/Feature/1439",
            "diameter": "32.705418",
            "type": "Crater, craters",
        }
        data = "".join(
            f'<SimpleData name="{key}">{value}</SimpleData>'
            for key, value in fields.items()
        )
        return f"<Placemark><name>{name}</name><ExtendedData><SchemaData>{data}</SchemaData></ExtendedData></Placemark>"

    kml = '<kml xmlns="http://www.opengis.net/kml/2.2"><Document>'
    kml += placemark("de Gerlache", "Adopted by IAU", "-88.4849")
    kml += placemark("Unofficial Ridge", "Proposed", "-89")
    kml += placemark("Northern Crater", "Adopted by IAU", "1")
    kml += "</Document></kml>"
    path = tmp_path / "catalogue.kmz"
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("catalogue.kml", kml)
    features = features_from_kmz(path)
    assert len(features) == 1
    assert features[0]["id"] == "iau-1439"
    assert features[0]["source_url"].startswith("https://")
    np.testing.assert_allclose(features[0]["longitude_deg_east"], -88.3447)
