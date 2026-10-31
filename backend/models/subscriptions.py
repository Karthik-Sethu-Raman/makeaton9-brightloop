"""subscriptions.py — subscription lifecycle law (owner: Manu, T16).

One owner for three rules the whole app obeys:

  1. NUMBERING — `next_number()` continues SUB-0001... as MAX(numeric
     suffix)+1 (schema.py's law), so SEED rows and live-created rows share
     one sequence and can never collide or fork.
  2. STATE MACHINE — Draft -> Quotation -> Confirmed -> Active -> Closed.
     `transition()` refuses every illegal move with a friendly sentence
     (closed is terminal; you cannot walk a live subscription backwards).
     Side effects live here too: activation arms billing (next_billing_date
     defaults to today when NULL), closing disarms it (next_billing_date
     NULL = dormant, the same marker plans.term_end_action uses for pause).
  3. LINES + TOTALS — lines are priced ONLY through variants.price_line
     (the T11 law: unit_price = sales_price + variant delta), and
     `totals()` computes subtotal / tax / grand total from the stored rows
     — the same arithmetic INV-0001 was seeded with (test-pinned).

Unknown ids/states raise ValueError, never a silent fallback (T11/T13
philosophy: loud failure beats quietly wrong money). T17's API is a thin
wrapper over this module.
"""
from __future__ import annotations

import sqlite3
from datetime import date

from . import variants

# Schema order; CHECK constraint on subscriptions.state uses the same tuple.
STATES = ("draft", "quotation", "confirmed", "active", "closed")

# Legal moves only. Forward steps (+ skipping quotation), revision back to
# draft, and closing from any pre-terminal state (a draft can be scrapped,
# a quotation declined, a confirmed order cancelled). Closed is terminal.
LEGAL_TRANSITIONS: dict[str, set[str]] = {
    "draft": {"quotation", "confirmed", "closed"},
    "quotation": {"confirmed", "draft", "closed"},
    "confirmed": {"active", "closed"},
    "active": {"closed"},
    "closed": set(),
}


def _round2(x: float) -> float:
    return round(float(x) + 0.0, 2)


def next_number(conn: sqlite3.Connection) -> str:
    """SUB-0001... continuation: MAX(numeric suffix) + 1 (schema.py law)."""
    rows = conn.execute(
        "SELECT number FROM subscriptions WHERE number LIKE 'SUB-%'"
    ).fetchall()
    biggest = max(
        (int(r["number"][4:]) for r in rows if r["number"][4:].isdigit()), default=0
    )
    return f"SUB-{biggest + 1:04d}"


def get(conn: sqlite3.Connection, subscription_id: int) -> dict | None:
    return conn.execute(
        "SELECT * FROM subscriptions WHERE id = ?", (subscription_id,)
    ).fetchone()


def list_subs(
    conn: sqlite3.Connection,
    state: str | None = None,
    customer_id: int | None = None,
    plan_id: int | None = None,
) -> list[dict]:
    """Filtered subscription rows, newest first (a just-created sub is the
    top table row — products/plans API convention)."""
    sql = "SELECT * FROM subscriptions WHERE 1=1"
    args: list = []
    if state is not None:
        sql += " AND state = ?"
        args.append(state)
    if customer_id is not None:
        sql += " AND customer_id = ?"
        args.append(customer_id)
    if plan_id is not None:
        sql += " AND plan_id = ?"
        args.append(plan_id)
    sql += " ORDER BY id DESC"
    return list(conn.execute(sql, args).fetchall())


def create(
    conn: sqlite3.Connection,
    customer_id: int,
    plan_id: int,
    start_date: str | None = None,
    payment_terms: str = "Net 15",
    state: str = "draft",
    lines: list[dict] | None = None,
) -> dict:
    """Insert a subscription at `state` (default draft) with a fresh number.

    `lines` (optional): [{product_id, variant_id?, quantity, tax_percent?}]
    priced through variants.price_line — callers never compute money.

    Raises ValueError (friendly sentence) for unknown customer / plan,
    unknown state, or a malformed start date.
    """
    if conn.execute(
        "SELECT id FROM customers WHERE id = ?", (customer_id,)
    ).fetchone() is None:
        raise ValueError(f"Unknown customer id {customer_id}.")
    if conn.execute(
        "SELECT id FROM plans WHERE id = ?", (plan_id,)
    ).fetchone() is None:
        raise ValueError(f"Unknown plan id {plan_id}.")
    if state not in STATES:
        raise ValueError(f"Unknown subscription state '{state}'.")
    if start_date is None:
        start_date = date.today().isoformat()
    else:
        try:
            date.fromisoformat(str(start_date))
        except ValueError:
            raise ValueError("Start date must be a date (YYYY-MM-DD).") from None

    # Retry on the (rare) UNIQUE collision if two creates race for one number.
    for _ in range(3):
        number = next_number(conn)
        try:
            cur = conn.execute(
                "INSERT INTO subscriptions (number,customer_id,plan_id,state,"
                " start_date,payment_terms,created_at) VALUES (?,?,?,?,?,?,"
                "datetime('now','localtime'))",
                (number, customer_id, plan_id, state, str(start_date), payment_terms),
            )
            break
        except sqlite3.IntegrityError:
            if conn.execute(
                "SELECT id FROM subscriptions WHERE number = ?", (number,)
            ).fetchone() is None:
                raise  # collision was NOT the number — do not mask it
    else:  # pragma: no cover — three concurrent collisions
        raise ValueError("Could not allocate a subscription number.")

    sub_id = cur.lastrowid
    if lines:
        set_lines(conn, sub_id, lines)
    row = get(conn, sub_id)
    conn.commit()
    return row


def lines(conn: sqlite3.Connection, subscription_id: int) -> list[dict]:
    """Stored lines of one subscription, insertion order."""
    return list(
        conn.execute(
            "SELECT * FROM subscription_lines WHERE subscription_id = ?"
            " ORDER BY id",
            (subscription_id,),
        ).fetchall()
    )


def add_line(
    conn: sqlite3.Connection,
    subscription_id: int,
    product_id: int,
    variant_id: int | None = None,
    quantity: int = 1,
    tax_percent: float = 0.0,
) -> dict:
    """Append one line, priced by the T11 law (variants.price_line)."""
    _guard_open(conn, subscription_id)
    priced = variants.price_line(conn, product_id, variant_id, quantity, tax_percent)
    cur = conn.execute(
        "INSERT INTO subscription_lines (subscription_id,product_id,variant_id,"
        " description,quantity,unit_price,tax_percent,amount)"
        " VALUES (?,?,?,?,?,?,?,?)",
        (
            subscription_id,
            priced["product_id"],
            priced["variant_id"],
            priced["description"],
            priced["quantity"],
            priced["unit_price"],
            priced["tax_percent"],
            priced["amount"],
        ),
    )
    row = conn.execute(
        "SELECT * FROM subscription_lines WHERE id = ?", (cur.lastrowid,)
    ).fetchone()
    conn.commit()
    return row


def set_lines(
    conn: sqlite3.Connection, subscription_id: int, specs: list[dict]
) -> list[dict]:
    """Replace all lines of a subscription with freshly priced ones.

    specs: [{product_id, variant_id?, quantity, tax_percent?}]. Used by
    create-with-lines and by a future "edit lines while draft" flow — the
    closed-state guard keeps history immutable once a sub is closed.
    """
    _guard_open(conn, subscription_id)
    conn.execute(
        "DELETE FROM subscription_lines WHERE subscription_id = ?",
        (subscription_id,),
    )
    for spec in specs:
        priced = variants.price_line(
            conn,
            spec.get("product_id"),
            spec.get("variant_id"),
            spec.get("quantity", 1),
            spec.get("tax_percent", 0.0),
        )
        conn.execute(
            "INSERT INTO subscription_lines (subscription_id,product_id,variant_id,"
            " description,quantity,unit_price,tax_percent,amount)"
            " VALUES (?,?,?,?,?,?,?,?)",
            (
                subscription_id,
                priced["product_id"],
                priced["variant_id"],
                priced["description"],
                priced["quantity"],
                priced["unit_price"],
                priced["tax_percent"],
                priced["amount"],
            ),
        )
    rows = lines(conn, subscription_id)
    conn.commit()
    return rows


def totals(conn: sqlite3.Connection, subscription_id: int) -> dict:
    """Subtotal (pre-tax) / tax / grand total from the stored lines.

    Tax is rounded per line, then summed — the same arithmetic the seeded
    invoices used (SUB-0001 -> INV-0001 is pinned by test), so a future
    invoice generated from these lines shows identical figures.
    """
    _guard_exists(conn, subscription_id)
    subtotal = 0.0
    tax_total = 0.0
    for ln in lines(conn, subscription_id):
        subtotal += ln["amount"]
        tax_total += _round2(ln["amount"] * ln["tax_percent"] / 100.0)
    return {
        "subtotal": _round2(subtotal),
        "tax_total": _round2(tax_total),
        "total": _round2(_round2(subtotal) + _round2(tax_total)),
        "line_count": len(lines(conn, subscription_id)),
    }


def transition(
    conn: sqlite3.Connection, subscription_id: int, to_state: str
) -> dict:
    """Move a subscription one legal step (or a legal skip) forward.

    Raises ValueError with a ready-to-show sentence for unknown id, unknown
    target state, or an illegal move. Side effects: -> 'active' arms billing
    (next_billing_date = today when NULL, so the livefeed bills it on the
    next tick — an activate-now demo scene); -> 'closed' disarms billing.
    """
    row = get(conn, subscription_id)
    if row is None:
        raise ValueError(f"Unknown subscription id {subscription_id}.")
    if to_state not in STATES:
        raise ValueError(f"Unknown subscription state '{to_state}'.")
    frm = row["state"]
    if to_state == frm:
        raise ValueError(f"{row['number']} is already {frm}.")
    if to_state not in LEGAL_TRANSITIONS[frm]:
        raise ValueError(f"{row['number']} cannot move from {frm} to {to_state}.")

    if to_state == "active" and not row["next_billing_date"]:
        conn.execute(
            "UPDATE subscriptions SET state = ?, next_billing_date = ? WHERE id = ?",
            (to_state, date.today().isoformat(), subscription_id),
        )
    elif to_state == "closed":
        conn.execute(
            "UPDATE subscriptions SET state = ?, next_billing_date = NULL"
            " WHERE id = ?",
            (to_state, subscription_id),
        )
    else:
        conn.execute(
            "UPDATE subscriptions SET state = ? WHERE id = ?",
            (to_state, subscription_id),
        )
    updated = get(conn, subscription_id)
    conn.commit()
    return updated


# ---- guards ---------------------------------------------------------------


def _guard_exists(conn: sqlite3.Connection, subscription_id: int) -> dict:
    row = get(conn, subscription_id)
    if row is None:
        raise ValueError(f"Unknown subscription id {subscription_id}.")
    return row


def _guard_open(conn: sqlite3.Connection, subscription_id: int) -> dict:
    """Lines may only change while a subscription is not closed (history
    stays immutable after close — same spirit as invoice cancel)."""
    row = _guard_exists(conn, subscription_id)
    if row["state"] == "closed":
        raise ValueError(f"{row['number']} is closed; its lines cannot change.")
    return row
