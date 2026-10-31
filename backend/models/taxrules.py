"""taxrules.py — the automatic-tax law (owner: Manu).

ONE function owns "which GST rate applies to this product": a type-specific
rule in tax_rules beats the catch-all (product_type IS NULL), lowest id breaks
ties, and no rule at all means the caller's fallback (0.0 → tax-free). The
simulator (T03) and any billing/copy flow all go through it so the same line
can never carry two different rates on two screens.
"""
from __future__ import annotations

import sqlite3


def percent_for(
    conn: sqlite3.Connection, product_id: int, fallback: float = 0.0
) -> float:
    """Rate from tax_rules for the product's type; type-specific beats catch-all."""
    row = conn.execute(
        "SELECT tr.rate_percent FROM tax_rules tr, products p WHERE p.id=?"
        " AND (tr.product_type IS NULL OR tr.product_type = p.type)"
        " ORDER BY (tr.product_type IS NOT NULL) DESC, tr.id LIMIT 1",
        (product_id,),
    ).fetchone()
    return float(row["rate_percent"]) if row else float(fallback)
