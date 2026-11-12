"""Run scientific calculations in a killable process with one shared deadline."""

from __future__ import annotations

import asyncio
import json
import os
import subprocess
import sys
from pathlib import Path

from fastapi import HTTPException, Request

from app.settings import settings

ANALYSIS_SECONDS = 120.0  # Safety watchdog; the performance target is successful averages under 30s.
_active = False


async def bounded_analysis(operation: str, payload: dict, request: Request) -> dict:
    global _active
    # Fail fast instead of allowing queue time to consume the caller's deadline.
    if _active:
        raise HTTPException(
            429,
            detail={
                "code": "queue_full",
                "message": "Another analysis is running. Your inputs are saved; retry shortly.",
            },
        )
    _active = True
    process = None
    communication = None
    try:
        async with asyncio.timeout(ANALYSIS_SECONDS):
            environment = os.environ.copy()
            environment["LUMEN_DATA_ROOT"] = str(settings.data_root)
            environment["LUMEN_KERNEL_ROOT"] = str(settings.kernel_root)
            environment["PYTHONPATH"] = (
                str(Path(__file__).resolve().parents[2])
                + os.pathsep
                + environment.get("PYTHONPATH", "")
            )
            # Uvicorn uses SelectorEventLoop on Windows, which lacks asyncio subprocesses.
            process = subprocess.Popen(  # noqa: ASYNC220
                [sys.executable, "-m", "app.analysis_worker", operation],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env=environment,
                creationflags=0x08000000 if os.name == "nt" else 0,
            )
            communication = asyncio.create_task(
                asyncio.to_thread(process.communicate, json.dumps(payload).encode())
            )
            while not communication.done():
                if await request.is_disconnected():
                    raise HTTPException(499, "Analysis canceled.")
                await asyncio.wait({communication}, timeout=0.05)
            output, _ = communication.result()
            if process.returncode:
                raise HTTPException(503, "The analysis worker stopped. Your inputs are retained.")
            result = json.loads(output)
            if "error" in result:
                raise HTTPException(result["status"], result["error"])
            return result["result"]
    except TimeoutError as exc:
        raise HTTPException(
            504,
            detail={
                "code": "timeout",
                "message": "Analysis reached its time limit and was stopped. Try a smaller area or shorter mission window.",
            },
        ) from exc
    except (OSError, ValueError, KeyError) as exc:
        raise HTTPException(503, "Analysis service unavailable. Your inputs are retained.") from exc
    finally:
        if process is not None and process.poll() is None:
            process.kill()
            await asyncio.to_thread(process.wait)
        if communication is not None and not communication.done():
            communication.cancel()
            await asyncio.gather(communication, return_exceptions=True)
        _active = False
