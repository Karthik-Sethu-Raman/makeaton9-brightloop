"""router.py — /api/live/* (owner: Manu, T03).

Thin HTTP skin over simulator.summary(): every poll reads live rows from
SQLite — the numbers change because the simulator thread keeps mutating them
(DECISIONS D1: never static JSON). T01's create_app() includes this router
automatically the moment this module exists (find_spec-guarded seam).
"""
from __future__ import annotations

from fastapi import APIRouter

from ..models import ensure_db
from .simulator import summary

router = APIRouter()


@router.get("/api/live/summary")
def live_summary() -> dict:
    conn = ensure_db()  # IF-NOT-EXISTS schema; self-heals a wiped data/ dir
    try:
        return summary(conn)
    finally:
        conn.close()
