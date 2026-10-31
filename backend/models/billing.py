"""billing.py — the billing-run law (owner: Manu, T20).

ONE owner for "generate due invoices from active subscriptions":

  * `run(conn, today)` bills EVERY active subscription whose next_billing_date
    is due — the batch a demo can trigger on demand. `bill_subscription()`
    bills one subscription (the livefeed tick calls it with limit=1).
  * IDEMPOTENT — never twice. Three guards stack: (1) next_billing_date
    advances one full calendar period (plans.add_period, the T13 law) in the
    SAME commit as the invoice; (2) schema.py's UNIQUE index on
    (subscription_id, issue_date) makes a double-bill physically impossible;
    (3) an IntegrityError from a concurrent writer (the livefeed thread bills
    too) is recognised as "already billed" and absorbed, never crashed.
  * NEVER SKIPPED. The billing date advances FROM THE DUE DATE, not from
    today, so a subscription left unbilled for several periods is caught up
    one invoice per period — back-dated issue dates, oldest period first —
    until it reaches today. `limit` caps invoices per call (the tick's demo
    pacing); the next run continues the catch-up, so no period is ever lost.
  * TAXES ARE AUTOMATIC: every line's rate comes from tax_rules via
    taxrules.percent_for (type-specific beats catch-all, T19's law); the
    stored subscription-line rate is only the fallback.
  * Money is never recomputed from scratch: line amounts are the stored
    subscription-line amounts; tax is rounded per line then summed — the
    same arithmetic that priced INV-0001 (test-pinned in test_livefeed).
"""
from __future__ import annotations

import re
import sqlite3
from datetime import date, timedelta

from . import taxrules
from .plans import add_period

DEFAULT_MAX_PERIODS = 24  # catch-up cap per subscription per call


def _today() -> str:
    return date.today().isoformat()


def _r2(x: float) -> float:
    return round(float(x), 2)


def next_invoice_number(conn: sqlite3.Connection) -> str:
    """INV-0001... continuation per schema.py: MAX(numeric suffix) + 1."""
    rows = conn.execute(
        "SELECT number FROM invoices WHERE number LIKE 'INV-%'"
    ).fetchall()
    biggest = max(
        (int(r["number"][4:]) for r in rows if r["number"][4:].isdigit()), default=0
    )
    return f"INV-{biggest + 1:04d}"


def net_days(payment_terms: str | None) -> int:
    """"Net 15" -> 15; unreadable terms default to Net 15 (seed convention)."""
    m = re.search(r"(\d+)", payment_terms or "")
    return int(m.group(1)) if m else 15


def _shift(iso_day: str, days: int) -> str:
    return (date.fromisoformat(iso_day) + timedelta(days=days)).isoformat()


def _due_ids(conn: sqlite3.Connection, today: str) -> list[int]:
    """Active subscriptions with a due billing day, oldest due first."""
    rows = conn.execute(
        "SELECT s.id FROM subscriptions s"
        " WHERE s.state='active' AND s.next_billing_date IS NOT NULL"
        " AND s.next_billing_date <= ? ORDER BY s.next_billing_date, s.id",
        (today,),
    ).fetchall()
    return [r["id"] for r in rows]


def _fetch_sub(conn: sqlite3.Connection, sub_id: int) -> dict:
    row = conn.execute(
        "SELECT s.id, s.number, s.customer_id, s.state, s.payment_terms,"
        " s.next_billing_date, p.billing_frequency"
        " FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.id = ?",
        (sub_id,),
    ).fetchone()
    if row is None:
        raise ValueError(f"Unknown subscription id {sub_id}.")
    return row


def bill_subscription(
    conn: sqlite3.Connection,
    subscription_id: int,
    today: str | None = None,
    limit: int | None = None,
) -> list[dict]:
    """Bill every due period of ONE active subscription.

    Returns the events (one per invoice created, oldest period first).
    Unknown id -> ValueError; a subscription that is not active -> ValueError
    (loud: billing a draft/closed sub is a caller bug, never a silent skip).
    A dormant subscription (next_billing_date NULL) or one not yet due
    returns []. A subscription with no billable lines never blocks the queue:
    its date is advanced past today with no invoice.
    """
    today = today or _today()
    sub = _fetch_sub(conn, subscription_id)
    if sub["state"] != "active":
        raise ValueError(
            f"{sub['number']} is {sub['state']}, not active; nothing to bill."
        )
    events: list[dict] = []
    while limit is None or len(events) < limit:
        # Re-read the due date each pass: a concurrent writer (livefeed tick)
        # may have billed + pushed it while we worked.
        due = conn.execute(
            "SELECT next_billing_date FROM subscriptions WHERE id = ?",
            (subscription_id,),
        ).fetchone()["next_billing_date"]
        if due is None or due > today:
            break
        lines = conn.execute(
            "SELECT product_id, description, quantity, unit_price, tax_percent,"
            " amount FROM subscription_lines WHERE subscription_id = ?"
            " ORDER BY id",
            (subscription_id,),
        ).fetchall()
        if not lines:  # shell subscription: unblock the queue, bill nothing
            conn.execute(
                "UPDATE subscriptions SET next_billing_date = ? WHERE id = ?",
                (add_period(today, sub["billing_frequency"]), subscription_id),
            )
            conn.commit()
            break
        event = _bill_one_period(conn, sub, lines, due, today)
        if event is None:  # absorbed as already-billed by a concurrent writer
            continue
        events.append(event)
    return events


def _bill_one_period(
    conn: sqlite3.Connection,
    sub: dict,
    lines: list[dict],
    due: str,
    today: str,
) -> dict | None:
    """Insert ONE period's invoice + lines + date push in a single commit.

    Returns the event, or None when a UNIQUE hit proves a concurrent writer
    already billed this exact (subscription, period) — "never twice" absorbs
    it and the loop re-reads the (now pushed) date.
    """
    pay_by = _shift(due, net_days(sub["payment_terms"]))
    for _attempt in range(3):  # retry only a numbering race, never a rebill
        number = next_invoice_number(conn)
        try:
            cur = conn.execute(
                "INSERT INTO invoices (number,subscription_id,customer_id,"
                " issue_date,due_date,state,subtotal,discount_total,tax_total,"
                " total,created_at) VALUES (?,?,?,?,?,'confirmed',0,0,0,0,"
                "datetime('now','localtime'))",
                (number, sub["id"], sub["customer_id"], due, pay_by),
            )
            subtotal = tax_total = 0.0
            for ln in lines:
                pct = taxrules.percent_for(conn, ln["product_id"], ln["tax_percent"])
                conn.execute(
                    "INSERT INTO invoice_lines (invoice_id,description,quantity,"
                    " unit_price,tax_percent,discount_amount,amount)"
                    " VALUES (?,?,?,?,?,0,?)",
                    (cur.lastrowid, ln["description"], ln["quantity"],
                     ln["unit_price"], pct, ln["amount"]),
                )
                subtotal = _r2(subtotal + ln["amount"])
                tax_total = _r2(tax_total + ln["amount"] * pct / 100)
            conn.execute(
                "UPDATE invoices SET subtotal=?, tax_total=?, total=? WHERE id=?",
                (subtotal, tax_total, _r2(subtotal + tax_total), cur.lastrowid),
            )
            conn.execute(
                "UPDATE subscriptions SET next_billing_date=? WHERE id=?",
                (add_period(due, sub["billing_frequency"]), sub["id"]),
            )
            conn.commit()
            return {"kind": "invoice", "number": number, "issue_date": due,
                    "subscription": sub["number"], "total": _r2(subtotal + tax_total)}
        except sqlite3.IntegrityError:
            conn.rollback()
            already = conn.execute(
                "SELECT 1 FROM invoices WHERE subscription_id=? AND issue_date=?",
                (sub["id"], due),
            ).fetchone()
            if already:  # a livefeed tick billed this period mid-run
                conn.execute(  # push only if the winner somehow hasn't
                    "UPDATE subscriptions SET next_billing_date=? WHERE id=?"
                    " AND (next_billing_date IS NULL OR next_billing_date<=?)",
                    (add_period(due, sub["billing_frequency"]), sub["id"], due),
                )
                conn.commit()
                return None
            continue  # numbering race with another writer — fresh number
    raise ValueError("Could not allocate an invoice number.")


def run(
    conn: sqlite3.Connection,
    today: str | None = None,
    max_periods: int = DEFAULT_MAX_PERIODS,
) -> dict:
    """The billing run: invoice EVERY due active subscription, then report.

    Never twice (a second run finds nothing due), never skipped (catch-up
    bills each missed period; `remaining_due` is 0 unless the per-sub cap
    deferred work to the next run). Invoices start life confirmed — the
    payments chase list (and the livefeed) pick them up immediately.
    """
    today = today or _today()
    events: list[dict] = []
    for sub_id in _due_ids(conn, today):
        events += bill_subscription(conn, sub_id, today=today, limit=max_periods)
    return {
        "ran_on": today,
        "count": len(events),
        "invoices": [e["number"] for e in events],
        "total": _r2(sum(e["total"] for e in events)),
        "remaining_due": len(_due_ids(conn, today)),
        "events": events,
    }
