"""backend.models — SQLite data layer (owner: Manu).

App boot (T01/T03) only needs these two: ensure_db() applies the schema,
seed_if_empty() inserts the SEED fixture once. Routers/repos import db, schema,
passwords directly.
"""
from .db import connect, db_path, ensure_db
from .seed import seed_if_empty

# T19: template repo + copy action, and the shared auto-tax law (the
# simulator's billing helper delegates to it). Imported by name, never *.
# T20: billing run — THE law for due invoices from active subscriptions
# (the livefeed tick delegates to it with limit=1).
from . import billing, taxrules, templates

__all__ = [
    "connect", "db_path", "ensure_db", "seed_if_empty", "billing", "taxrules",
    "templates",
]
