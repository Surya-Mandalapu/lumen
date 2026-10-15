"""Analytic regression fixtures for the actual terrain-preparation functions."""

import numpy as np
from prepare_terrain import (
    RADIUS_M,
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
