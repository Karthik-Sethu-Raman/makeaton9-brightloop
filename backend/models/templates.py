"""templates.py — quotation templates + the copy action (owner: Manu, T19).

A template is the sales-rep artefact: a named bundle of plan + product lines
that stays valid N days from creation. Two laws live here:

  1. PRICING AT COPY TIME — lines are stored bare (product, variant, qty) and
     priced the moment a subscription is copied from the template, through
     variants.price_line (the T11 +delta law) with tax auto-applied by
     taxrules.percent_for (the T20 billing law). Nothing is frozen at template
     creation, so a price change made yesterday is what today's quote shows.
  2. VALIDITY WINDOW — `new_subscription()` refuses a copy once today is past
     created_at + valid_days (ready-to-show sentence), the same "valid N days"
     wording the statement's quotation scene uses.

`new_subscription()` itself delegates to subscriptions.create(state=
'quotation') — numbering, the SUB-0001 sequence and the state machine stay
owned by that module; the copy is just a create with priced lines.
"""
from __future__ import annotations

import sqlite3
from datetime import date, timedelta

from . import subscriptions, taxrules, variants

DEFAULT_VALID_DAYS = 30


def _round2(x: float) -> float:
    return round(float(x) + 0.0, 2)


def get(conn: sqlite3.Connection, template_id: int) -> dict | None:
    return conn.execute(
        "SELECT * FROM quotation_templates WHERE id = ?", (template_id,)
    ).fetchone()


def _guard_exists(conn: sqlite3.Connection, template_id: int) -> dict:
    row = get(conn, template_id)
    if row is None:
        raise ValueError(f"Unknown template id {template_id}.")
    return row


def create(
    conn: sqlite3.Connection,
    name: str,
    plan_id: int | None,
    valid_days: int = DEFAULT_VALID_DAYS,
    lines: list[dict] | None = None,
) -> dict:
    """Insert a template after model-level validation.

    lines: [{product_id, variant_id?, quantity}] — priced through
    variants.price_line for validation only; the stored row keeps the bare
    trio so copies always price at CURRENT prices + CURRENT tax rules.

    Raises ValueError (friendly sentence) for: blank name, missing/unknown
    plan, non-whole or <1 validity, empty lines, or any bad line (unknown
    product/variant, quantity < 1 — variants.price_line's sentences).
    """
    name = str(name or "").strip()
    if not name:
        raise ValueError("Enter a template name.")
    if plan_id is None:
        raise ValueError("Choose a plan.")
    if conn.execute(
        "SELECT id FROM plans WHERE id = ?", (plan_id,)
    ).fetchone() is None:
        raise ValueError(f"Unknown plan id {plan_id}.")
    try:
        fval = float(valid_days)
    except (TypeError, ValueError):
        fval = -1.0  # forces the friendly sentence below
    # is_integer() rejects 3.5; the upper bound keeps int() safe on inf.
    if not (1 <= fval <= 36500 and fval.is_integer()):
        raise ValueError(
            "Template validity must be a whole number of days (1 or more)."
        )
    days = int(fval)
    if not lines:
        raise ValueError("Add at least one product line.")

    # Validate every line BEFORE writing anything (no half-inserted template).
    for spec in lines:
        variants.price_line(
            conn,
            spec.get("product_id"),
            spec.get("variant_id"),
            spec.get("quantity", 1),
            0.0,  # tax is applied at copy time, never stored on a template
        )

    cur = conn.execute(
        "INSERT INTO quotation_templates (name,plan_id,valid_days,created_at)"
        " VALUES (?,?,?,datetime('now','localtime'))",
        (name, plan_id, days),
    )
    template_id = cur.lastrowid
    for spec in lines:
        conn.execute(
            "INSERT INTO quotation_template_lines (template_id,product_id,"
            " variant_id,quantity) VALUES (?,?,?,?)",
            (
                template_id,
                spec.get("product_id"),
                spec.get("variant_id"),
                int(spec.get("quantity", 1)),
            ),
        )
    conn.commit()
    return detail(conn, template_id)


def template_lines(conn: sqlite3.Connection, template_id: int) -> list[dict]:
    """Stored (bare) lines of one template, insertion order."""
    _guard_exists(conn, template_id)
    return list(
        conn.execute(
            "SELECT * FROM quotation_template_lines WHERE template_id = ?"
            " ORDER BY id",
            (template_id,),
        ).fetchall()
    )


def priced_lines(conn: sqlite3.Connection, template_id: int) -> list[dict]:
    """Template lines priced NOW: T11 variant law + tax auto from tax_rules.

    This is the single pricing path — detail(), totals() and the copy action
    all call it, so a template's displayed figures and the subscription it
    produces can never disagree.
    """
    out = []
    for ln in template_lines(conn, template_id):
        pct = taxrules.percent_for(conn, ln["product_id"])
        out.append(
            variants.price_line(
                conn, ln["product_id"], ln["variant_id"], ln["quantity"], pct
            )
        )
    return out


def totals(conn: sqlite3.Connection, template_id: int) -> dict:
    """Subtotal / tax / grand total of the template priced today.

    Same arithmetic as subscriptions.totals (tax rounded per line, then
    summed) so a copied subscription shows identical figures.
    """
    subtotal = 0.0
    tax_total = 0.0
    rows = priced_lines(conn, template_id)
    for ln in rows:
        subtotal += ln["amount"]
        tax_total += _round2(ln["amount"] * ln["tax_percent"] / 100.0)
    return {
        "subtotal": _round2(subtotal),
        "tax_total": _round2(tax_total),
        "total": _round2(_round2(subtotal) + _round2(tax_total)),
        "line_count": len(rows),
    }


def valid_until(conn: sqlite3.Connection, template_id: int) -> date:
    """Last day the template may be copied: created_at + valid_days."""
    row = _guard_exists(conn, template_id)
    created = date.fromisoformat(str(row["created_at"])[:10])
    return created + timedelta(days=int(row["valid_days"]))


def detail(conn: sqlite3.Connection, template_id: int) -> dict:
    """One template with plan name, priced totals and validity, for show."""
    row = _guard_exists(conn, template_id)
    plan = conn.execute(
        "SELECT name, billing_frequency FROM plans WHERE id = ?", (row["plan_id"],)
    ).fetchone()
    out = dict(row)
    out["plan_name"] = plan["name"] if plan else None
    out["billing_frequency"] = plan["billing_frequency"] if plan else None
    out["totals"] = totals(conn, template_id)
    out["valid_until"] = valid_until(conn, template_id).isoformat()
    out["expired"] = date.today() > valid_until(conn, template_id)
    return out


def list_templates(conn: sqlite3.Connection) -> list[dict]:
    """All templates (newest first — the products/plans table convention),
    each as full a dict as detail() produces."""
    ids = [
        r["id"]
        for r in conn.execute(
            "SELECT id FROM quotation_templates ORDER BY id DESC"
        ).fetchall()
    ]
    return [detail(conn, i) for i in ids]


def new_subscription(
    conn: sqlite3.Connection,
    template_id: int,
    customer_id: int,
    start_date: str | None = None,
) -> dict:
    """THE copy action: a fresh quotation subscription from this template.

    Lines are priced at call time (current prices, current tax rules) and the
    subscription is created in the 'quotation' state — the statement's
    template-to-quote flow. Returns the subscription row + totals + the
    template name, ready for a "SUB-0007 created from Large Retailer Bundle —
    ₹24,877.94" flash.

    Raises ValueError for unknown template/customer, a template with no plan,
    or an expired template (today past created_at + valid_days).
    """
    row = _guard_exists(conn, template_id)
    if row["plan_id"] is None:
        raise ValueError("Template has no plan; choose a plan before copying.")
    until = valid_until(conn, template_id)
    if date.today() > until:
        raise ValueError(
            f"{row['name']} expired on {until.isoformat()}; create a new template."
        )
    lines = priced_lines(conn, template_id)
    if not lines:
        raise ValueError("Add at least one product line.")
    sub = subscriptions.create(
        conn,
        customer_id=customer_id,
        plan_id=row["plan_id"],
        start_date=start_date,
        state="quotation",
        lines=lines,
    )
    out = dict(sub)
    out["totals"] = subscriptions.totals(conn, sub["id"])
    out["from_template"] = row["name"]
    return out
