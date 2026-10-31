"""main.py — FastAPI app factory + the vertical-slice boot seam (owner: Karthik, T01).

create_app() wires, in order: DB ensure+seed on boot (lifespan), the livefeed
simulator when backend/livefeed/simulator.py exists (T03 seam — start()/stop(),
skipped silently until it lands), its router when backend/livefeed/router.py
exists, JSON under /api, frontend/ ES modules at /frontend, and the static/ SPA
shell at / (html=True -> index.html at /, reset.html at /reset.html). CORS
middleware is deliberately NOT added: the SPA is same-origin, so the browser
needs no cross-origin headers and the API surface stays closed.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from importlib.util import find_spec
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from backend.models import ensure_db, seed_if_empty

ROOT = Path(__file__).resolve().parent.parent.parent
logger = logging.getLogger("cadence.api")


def _load_livefeed() -> tuple:
    """T03 seam: start()/stop() from backend.livefeed.simulator, when it exists.

    find_spec (not try/import) so a broken simulator surfaces as a real error
    instead of being mistaken for "not landed yet".
    """
    if find_spec("backend.livefeed.simulator") is None:
        logger.info("livefeed simulator not present yet (T03) - booting without it")
        return None, None
    from backend.livefeed.simulator import start, stop

    return start, stop


def create_app() -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        conn = ensure_db()
        try:
            if seed_if_empty(conn):
                logger.info("seeded first-boot fixture data")
        finally:
            conn.close()
        start, stop = _load_livefeed()
        if start is not None:
            start()
        yield
        if stop is not None:
            stop()

    app = FastAPI(title="Cadence API", lifespan=lifespan)

    @app.get("/api/health")
    def health() -> dict:
        conn = ensure_db()  # cheap: IF-NOT-EXISTS schema; also self-heals a wiped data/
        try:
            conn.execute("SELECT 1")
        finally:
            conn.close()
        return {"status": "ok", "app": "cadence", "db": "ok"}

    if find_spec("backend.livefeed.router") is not None:  # T03's /api/live/summary
        from backend.livefeed.router import router as livefeed_router

        app.include_router(livefeed_router)

    # /api/auth (T08) + /api/products (T10) — registered BEFORE the "/" static
    # mount: routes match in order, so anything added after app.mount("/") would
    # be shadowed by it.
    from backend.api.auth import router as auth_router
    from backend.api.products import router as products_router

    app.include_router(auth_router)
    app.include_router(products_router)

    # Mount order matters: "/" catches everything, so /frontend goes first.
    app.mount("/frontend", StaticFiles(directory=ROOT / "frontend"), name="frontend")
    app.mount("/", StaticFiles(directory=ROOT / "static", html=True), name="shell")
    return app


app = create_app()  # uvicorn target: backend.api.main:app
