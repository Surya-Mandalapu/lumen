from __future__ import annotations

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api import router
from app.settings import settings

app = FastAPI(
    title="Stealth Lumen API",
    version="0.1.0",
    description=(
        "Prototype lunar south-pole comparison interfaces. Results are planning indicators, "
        "not flight-certified mission products."
    ),
)
app.include_router(router)


if settings.static_dir.exists():
    assets_dir = settings.static_dir / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def frontend(path: str) -> FileResponse:
        requested = settings.static_dir / path
        if requested.is_file():
            return FileResponse(requested)
        return FileResponse(settings.static_dir / "index.html")
else:
    @app.get("/", include_in_schema=False)
    def root() -> dict[str, str]:
        return {
            "service": "stealth-lumen-api",
            "docs": "/docs",
            "frontend": "Run the Vite development server or build apps/web.",
        }

