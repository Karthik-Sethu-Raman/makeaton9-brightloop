"""db.py — SQLite connection factory (owner: Manu, T02).

Every caller gets: WAL journal (safe concurrent reads while the livefeed thread
writes), foreign keys ON, and plain dict rows so routers/repositories can return
them straight to FastAPI. The DB file lives at data/cadence.db by default; tests
and tools override with the CADENCE_DB env var or an explicit path.
"""
from __future__ import annotations

import os
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
DEFAULT_DB_PATH = ROOT / "data" / "cadence.db"


def db_path() -> Path:
    """DB file location: $CADENCE_DB if set, else <repo>/data/cadence.db."""
    return Path(os.environ.get("CADENCE_DB", str(DEFAULT_DB_PATH)))


def _dict_rows(cursor: sqlite3.Cursor, row: tuple) -> dict:
    return {col[0]: value for col, value in zip(cursor.description, row)}


def connect(path: str | os.PathLike | None = None) -> sqlite3.Connection:
    """Open a connection with WAL, FK enforcement and dict row factory.

    Connections are NOT shared across threads — the livefeed thread and each
    API request open their own (WAL keeps them from blocking each other).
    """
    target = Path(path) if path is not None else db_path()
    target.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(target), timeout=10)
    conn.row_factory = _dict_rows
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def ensure_db(path: str | os.PathLike | None = None) -> sqlite3.Connection:
    """connect() + schema applied. Safe to call on every boot (IF NOT EXISTS)."""
    from .schema import init_db

    conn = connect(path)
    init_db(conn)
    return conn
