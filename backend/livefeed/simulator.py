"""simulator.py — the dynamic-data engine (owner: Manu, T03).

A daemon thread (start()/stop(), wired by T01's lifespan) opens the DB every
~3 s and runs tick(): one due subscription gets invoiced, one payment lands on
the oldest outstanding invoice, and every other tick a subscription walks one
legal state forward. When nothing is due and nothing is owed, the next billing
day of an active subscription is pulled to today — the feed NEVER goes quiet
during a demo. Every tick moves real rows in SQLite (DECISIONS D1: dynamic
data persisted locally, never static JSON).

Safety properties the tests pin down: the thread waits a full interval BEFORE
its first mutation (short-lived boots like test runs write nothing), each tick
uses its own WAL connection (readers never block), billing is idempotent
(next_billing_date moves forward the moment an invoice exists), and the sub
state machine only walks forward (closed is terminal).
"""
from __future__ import annotations

import logging
import os
import sqlite3
import threading
from datetime import date, datetime
from zoneinfo import ZoneInfo

from ..models import billing
from ..models import connect
from ..models import taxrules

IST = ZoneInfo("Asia/Kolkata")
logger = logging.getLogger("cadence.livefeed")

PAY_METHODS = ("upi", "card", "bank_transfer", "cash", "cheque")
NEXT_STATE = {"draft": "quotation", "quotation": "confirmed", "confirmed": "active"}
DEFAULT_TICK_SECONDS = 3.0

# Confirmed invoices still carrying a balance (the chase list, oldest first).
_OUTSTANDING_SQL = """
SELECT i.id, i.number, i.customer_id, i.due_date, i.total,
       ROUND(i.total - COALESCE(SUM(p.amount), 0), 2) AS remaining
FROM invoices i LEFT JOIN payments p ON p.invoice_id = i.id
WHERE i.state = 'confirmed'
GROUP BY i.id
HAVING remaining > 0.004
"""


def _now() -> str:
    return datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S")


def _today() -> str:
    return date.today().isoformat()


def _r2(x: float) -> float:
    return round(x, 2)


def next_number(conn: sqlite3.Connection, table: str, prefix: str) -> str:
    """Numbering law moved to the model layer (T20): models.billing owns
    INV- continuation; kept as a thin redirect so no caller breaks."""
    if (table, prefix) == ("invoices", "INV-"):
        return billing.next_invoice_number(conn)
    rows = conn.execute(
        f"SELECT number FROM {table} WHERE number LIKE ?", (prefix + "%",)
    ).fetchall()
    biggest = max((int(r["number"][len(prefix):]) for r in rows), default=0)
    return f"{prefix}{biggest + 1:04d}"


# ---- the three mutations ------------------------------------------------


def land_one_payment(conn: sqlite3.Connection) -> dict | None:
    """Pay a slice of the oldest-due outstanding invoice; mark it paid when clear."""
    inv = conn.execute(
        _OUTSTANDING_SQL + " ORDER BY i.due_date, i.id LIMIT 1"
    ).fetchone()
    if inv is None:
        return None
    slice_ = max(500.0, _r2(inv["total"] * 0.3))
    amount = _r2(min(slice_, inv["remaining"]))
    n = conn.execute("SELECT COUNT(*) c FROM payments").fetchone()["c"]
    method = PAY_METHODS[n % len(PAY_METHODS)]
    conn.execute(
        "INSERT INTO payments (invoice_id,method,amount,paid_on,note,created_at)"
        " VALUES (?,?,?,?,?,?)",
        (inv["id"], method, amount, _today(),
         f"Auto-collect #{n + 1} (simulated {method})", _now()),
    )
    if inv["remaining"] - amount <= 0.004:
        conn.execute("UPDATE invoices SET state='paid' WHERE id=?", (inv["id"],))
    conn.commit()
    return {"kind": "payment", "invoice": inv["number"], "amount": amount,
            "method": method}


def advance_one_subscription(conn: sqlite3.Connection) -> dict | None:
    """Walk the lowest-id sub one legal forward step (draft -> ... -> active)."""
    row = conn.execute(
        "SELECT id, number, state FROM subscriptions"
        " WHERE state IN ('draft','quotation','confirmed') ORDER BY id LIMIT 1"
    ).fetchone()
    if row is None:
        return None
    new = NEXT_STATE[row["state"]]
    conn.execute("UPDATE subscriptions SET state=? WHERE id=?", (new, row["id"]))
    if new == "active":
        # A sub becomes billable the day it activates, if it had no date yet.
        conn.execute(
            "UPDATE subscriptions SET next_billing_date=COALESCE(next_billing_date, ?)"
            " WHERE id=?", (_today(), row["id"]),
        )
    conn.commit()
    return {"kind": "subscription", "number": row["number"], "state": new}


def tax_percent_for(conn: sqlite3.Connection, product_id: int, fallback: float) -> float:
    """Rate from tax_rules for the product's type — now owned by
    models.taxrules.percent_for (T19 moved the law next to the other model
    laws so the copy action and billing share it); kept as a thin alias."""
    return taxrules.percent_for(conn, product_id, fallback)


def bill_due_subscription(conn: sqlite3.Connection) -> dict | None:
    """Invoice ONE due active sub — DELEGATED to models.billing (T20's shared
    law: idempotent date push in the same commit, auto tax from tax_rules,
    UNIQUE-indexed against double-billing). limit=1 keeps the tick's demo
    pacing: one invoice per beat; the batch run catches up the rest."""
    row = conn.execute(
        "SELECT id FROM subscriptions WHERE state='active'"
        " AND next_billing_date IS NOT NULL AND next_billing_date <= ?"
        " ORDER BY next_billing_date, id LIMIT 1", (_today(),),
    ).fetchone()
    if row is None:
        return None
    events = billing.bill_subscription(conn, row["id"], limit=1)
    return events[0] if events else None


def _reschedule_billing_day(conn: sqlite3.Connection) -> dict | None:
    """Demo keeps moving: nothing due and nothing owed, so a billing day arrives
    early for the longest-waiting active subscription."""
    row = conn.execute(
        "SELECT id, number FROM subscriptions WHERE state='active'"
        " AND next_billing_date IS NOT NULL ORDER BY next_billing_date, id LIMIT 1"
    ).fetchone()
    if row is None:
        return None
    conn.execute(
        "UPDATE subscriptions SET next_billing_date=? WHERE id=?", (_today(), row["id"])
    )
    conn.commit()
    return {"kind": "billing_day", "subscription": row["number"]}


def _shift(iso_day: str, days: int) -> str:
    return (date.fromisoformat(iso_day) + timedelta(days=days)).isoformat()


def tick(conn: sqlite3.Connection) -> list[dict]:
    """One simulator beat. Returns the events that happened (possibly [])."""
    events: list[dict] = []
    billed = bill_due_subscription(conn)
    if billed:
        events.append(billed)
    paid = land_one_payment(conn)
    if paid:
        events.append(paid)
    tick.n += 1
    if tick.n % 2 == 0:  # states advance slower than money moves
        advanced = advance_one_subscription(conn)
        if advanced:
            events.append(advanced)
    if billed is None and paid is None:  # feed drained -> schedule fresh work
        rescheduled = _reschedule_billing_day(conn)
        if rescheduled:
            events.append(rescheduled)
    return events


tick.n = 0


# ---- the read side (T04's overview polls this contract) ------------------


def summary(conn: sqlite3.Connection) -> dict:
    """Live KPIs read straight from the books — never static JSON."""
    active = conn.execute(
        "SELECT COUNT(*) c FROM subscriptions WHERE state='active'"
    ).fetchone()["c"]
    revenue = conn.execute(
        "SELECT COALESCE(ROUND(SUM(amount), 2), 0) v FROM payments"
    ).fetchone()["v"]
    owed = conn.execute(
        "SELECT COALESCE(SUM(remaining), 0) v FROM (" + _OUTSTANDING_SQL + ")"
    ).fetchone()["v"]
    overdue = conn.execute(
        "SELECT COUNT(*) c FROM invoices WHERE state='confirmed' AND due_date < ?",
        (_today(),),
    ).fetchone()["c"]
    recent = conn.execute(
        "SELECT i.number AS invoice, p.amount, p.method, p.paid_on"
        " FROM payments p JOIN invoices i ON i.id = p.invoice_id"
        " ORDER BY p.id DESC LIMIT 5"
    ).fetchall()
    return {
        "updated_at": _now(),
        "kpis": {
            "active_subscriptions": active,
            "revenue_collected": round(float(revenue), 2),
            "outstanding": round(float(owed), 2),
            "overdue_invoices": overdue,
        },
        "activity": [dict(r) for r in recent],
    }


# ---- the thread (started/stopped by T01's app lifespan) ------------------

_thread: threading.Thread | None = None
_stop = threading.Event()
_lock = threading.Lock()


def tick_seconds() -> float:
    try:
        return float(os.environ.get("CADENCE_TICK_SECONDS", DEFAULT_TICK_SECONDS))
    except ValueError:
        return DEFAULT_TICK_SECONDS


def _run(interval: float) -> None:
    while not _stop.wait(interval):  # wait FIRST: short-lived boots mutate nothing
        conn = None
        try:
            conn = connect()
            tick(conn)
        except Exception:  # a locked WAL write retries on the next beat
            logger.exception("livefeed tick failed")
        finally:
            if conn is not None:
                conn.close()


def start() -> bool:
    """Boot the feed thread (app lifespan call). No-op if already running."""
    global _thread
    with _lock:
        if _thread is not None and _thread.is_alive():
            return False
        _stop.clear()
        _thread = threading.Thread(
            target=_run, args=(tick_seconds(),), name="cadence-livefeed", daemon=True
        )
        _thread.start()
        return True


def stop() -> None:
    """Signal + join the feed thread (app shutdown call). Idempotent."""
    global _thread
    with _lock:
        _stop.set()
        t, _thread = _thread, None
    if t is not None:
        t.join(timeout=2.0)
