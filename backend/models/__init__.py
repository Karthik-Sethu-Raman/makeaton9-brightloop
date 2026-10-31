"""backend.models — SQLite data layer (owner: Manu).

App boot (T01/T03) only needs these two: ensure_db() applies the schema,
seed_if_empty() inserts the SEED fixture once. Routers/repos import db, schema,
passwords directly.
"""
from .db import connect, db_path, ensure_db
from .seed import seed_if_empty

__all__ = ["connect", "db_path", "ensure_db", "seed_if_empty"]
