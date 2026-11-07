"""Analytic regression fixtures for the actual terrain-preparation functions."""

import numpy as np
from prepare_terrain import (
    RADIUS_M,
    candidate_grid,
    cap_tile_bounds,
    geographic_to_projected,
    horizon_profiles,
    projected_to_geographic,
)
from rasterio.transform import from_origin


def test_projection_roundtrip():
    x = np.array([-10000.0, 0, 500, 10000])
    y = np.array([500.0, -10000, 10000, 0])
    lat, lon = projected_to_geographic(x, y)
    actual_x, actual_y = geographic_to_projected(lat, lon)
    np.testing.assert_allclose(actual_x, x, atol=1e-8)
    np.testing.assert_allclose(actual_y, y, atol=1e-8)


def test_cap_tiles_partition_the_87_to_90_degree_south_candidate_grid():
    points = set()
    for tile_x in range(10):
        for tile_y in range(10):
            x, y, bounds = candidate_grid((tile_x, tile_y))
            assert bounds == cap_tile_bounds(tile_x, tile_y)
            assert np.all((x >= bounds[0]) & (x < bounds[2]))
            assert np.all((y >= bounds[1]) & (y < bounds[3]))
            lat, _ = projected_to_geographic(x, y)
            assert np.all(np.rad2deg(lat) <= -87)
            tile_points = set(zip(x.tolist(), y.tolist(), strict=True))
            assert not points.intersection(tile_points)
            points.update(tile_points)
    assert 100_000 < len(points) < 110_000
    assert (0, 0) not in points


def test_flat_sphere_observer_depression_and_ridge_direction():
    # Broad synthetic fixtures are scientific unit tests only, never app data.
    dem = np.zeros((441, 441), dtype=np.float32)
    transform = from_origin(-220500, 220500, 1000, 1000)
    lat, lon = projected_to_geographic(np.array([0.0]), np.array([3000.0]))
    azimuth, horizon, _, valid = horizon_profiles(
        dem, transform, lat, lon, np.array([0.0])
    )
    expected = -np.rad2deg(np.arccos(RADIUS_M / (RADIUS_M + 2)))
    assert valid.all()
    np.testing.assert_allclose(horizon, expected, atol=0.0001)
    # At longitude zero, local north points towards increasing projected y.
    # A broad elevated strip must block north, while east stays unobstructed.
    yy = transform.f + (np.arange(441) + 0.5) * transform.e
    xx = transform.c + (np.arange(441) + 0.5) * transform.a
    dem[(yy > 20000) & (yy < 30000), :] = np.where(np.abs(xx) < 2000, 2000, 0)
    _, elevated, _, valid = horizon_profiles(dem, transform, lat, lon, np.array([0.0]))
    assert valid.all()
    assert elevated[0, azimuth == 0][0] > 5
    assert elevated[0, azimuth == 90][0] < 0


def test_missing_terrain_invalidates_candidate():
    dem = np.zeros((441, 441), dtype=np.float32)
    dem[190:200, 215:225] = np.nan
    transform = from_origin(-220500, 220500, 1000, 1000)
    lat, lon = projected_to_geographic(np.array([0.0]), np.array([3000.0]))
    _, _, _, valid = horizon_profiles(dem, transform, lat, lon, np.array([0.0]))
    assert not valid[0]
