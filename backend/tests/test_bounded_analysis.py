"""Exercise real process termination, admission control and disconnect cleanup."""

import asyncio
import subprocess
import sys
from time import perf_counter

import pytest
from fastapi import HTTPException

from app.services import bounded_analysis as service


class Connected:
    async def is_disconnected(self):
        return False


def install_worker(monkeypatch, code):
    original = subprocess.Popen
    processes = []

    def spawn(*args, **kwargs):
        process = original([sys.executable, "-c", code], **kwargs)
        processes.append(process)
        return process

    monkeypatch.setattr(service.subprocess, "Popen", spawn)
    return processes


def test_deadline_kills_worker_and_releases_capacity(monkeypatch):
    processes = install_worker(monkeypatch, "import time; time.sleep(60)")
    monkeypatch.setattr(service, "ANALYSIS_SECONDS", 0.2)
    start = perf_counter()
    with pytest.raises(HTTPException) as failure:
        asyncio.run(service.bounded_analysis("search", {}, Connected()))
    assert failure.value.status_code == 504
    assert failure.value.detail["code"] == "timeout"
    assert perf_counter() - start < 2
    assert processes[0].poll() is not None
    assert not service._active


def test_no_queue_and_cancel_kills_worker(monkeypatch):
    processes = install_worker(monkeypatch, "import time; time.sleep(60)")

    async def exercise():
        task = asyncio.create_task(service.bounded_analysis("search", {}, Connected()))
        await asyncio.sleep(0.1)
        with pytest.raises(HTTPException) as failure:
            await service.bounded_analysis("preview", {}, Connected())
        assert failure.value.status_code == 429
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

    asyncio.run(exercise())
    assert processes[0].poll() is not None
    assert not service._active


def test_disconnect_kills_worker(monkeypatch):
    processes = install_worker(monkeypatch, "import time; time.sleep(60)")

    class Disconnected:
        async def is_disconnected(self):
            return True

    with pytest.raises(HTTPException) as failure:
        asyncio.run(service.bounded_analysis("preview", {}, Disconnected()))
    assert failure.value.status_code == 499
    assert processes[0].poll() is not None
    assert not service._active


def test_worker_result_is_decoded(monkeypatch):
    install_worker(monkeypatch, 'import json; print(json.dumps({"result":{"ok": True}}))')
    assert asyncio.run(service.bounded_analysis("search", {}, Connected())) == {"ok": True}


def test_http_safety_watchdog_is_separate_from_latency_target(monkeypatch):
    from fastapi.testclient import TestClient

    from app.main import app

    assert service.ANALYSIS_SECONDS == 120
    processes = install_worker(monkeypatch, "import time; time.sleep(60)")
    monkeypatch.setattr(service, "ANALYSIS_SECONDS", .2)
    start = perf_counter()
    response = TestClient(app).post(
        "/api/v1/candidates/search",
        json={
            "region": {
                "selector_type": "circle",
                "center": {"latitude_deg": -89.9, "longitude_deg_east": 0},
                "search_radius_km": 3,
            },
            "time_range": {"start_utc": "2028-10-01T00:00:00Z", "end_utc": "2028-10-02T00:00:00Z"},
        },
    )
    elapsed = perf_counter() - start
    assert response.status_code == 504
    assert response.json()["detail"]["code"] == "timeout"
    assert elapsed < 2
    assert processes[0].poll() is not None
    assert not service._active
