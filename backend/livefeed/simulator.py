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
import re
import sqlite3
import threading
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from ..models import connect
from ..models.plans import add_period

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
    """SUB-/INV- continuation per schema.py: MAX(numeric suffix) + 1."""
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
    """Rate from tax_rules for the product's type; type-specific beats catch-all."""
    row = conn.execute(
        "SELECT tr.rate_percent FROM tax_rules tr, products p WHERE p.id=?"
        " AND (tr.product_type IS NULL OR tr.product_type = p.type)"
        " ORDER BY (tr.product_type IS NOT NULL) DESC, tr.id LIMIT 1",
        (product_id,),
    ).fetchone()
    return float(row["rate_percent"]) if row else float(fallback)


def bill_due_subscription(conn: sqlite3.Connection) -> dict | None:
    """Invoice ONE active sub whose next_billing_date is due, then push the date
    a full period forward — that push IS the idempotency guard (never twice)."""
    sub = conn.execute(
        "SELECT s.id, s.number, s.customer_id, s.payment_terms, p.billing_frequency"
        " FROM subscriptions s JOIN plans p ON p.id = s.plan_id"
        " WHERE s.state='active' AND s.next_billing_date <= ?"
        " ORDER BY s.next_billing_date, s.id LIMIT 1", (_today(),),
    ).fetchone()
    if sub is None:
        return None
    lines = conn.execute(
        "SELECT sl.product_id, sl.description, sl.quantity, sl.unit_price,"
        " sl.tax_percent, sl.amount FROM subscription_lines sl"
        " WHERE sl.subscription_id=? ORDER BY sl.id", (sub["id"],),
    ).fetchall()
    if not lines:  # nothing to bill: just move the date so it never blocks the queue
        conn.execute(
            "UPDATE subscriptions SET next_billing_date=? WHERE id=?",
            (add_period(_today(), sub["billing_frequency"]), sub["id"]),
        )
        conn.commit()
        return None

    today = _today()
    m = re.search(r"(\d+)", sub["payment_terms"] or "")  # "Net 15" -> 15
    net_days = int(m.group(1)) if m else 15
    number = next_number(conn, "invoices", "INV-")
    cur = conn.execute(
        "INSERT INTO invoices (number,subscription_id,customer_id,issue_date,due_date,"
        " state,subtotal,discount_total,tax_total,total,created_at)"
        " VALUES (?,?,?,?,?,'confirmed',0,0,0,0,?)",
        (number, sub["id"], sub["customer_id"], today,
         _shift(today, net_days), _now()),
    )
    subtotal = tax_total = 0.0
    for ln in lines:
        pct = tax_percent_for(conn, ln["product_id"], ln["tax_percent"])
        conn.execute(
            "INSERT INTO invoice_lines (invoice_id,description,quantity,unit_price,"
            " tax_percent,discount_amount,amount) VALUES (?,?,?,?,?,0,?)",
            (cur.lastrowid, ln["description"], ln["quantity"], ln["unit_price"],
             pct, ln["amount"]),
        )
        subtotal = _r2(subtotal + ln["amount"])
        tax_total = _r2(tax_total + ln["amount"] * pct / 100)
    conn.execute(
        "UPDATE invoices SET subtotal=?, tax_total=?, total=? WHERE id=?",
        (subtotal, tax_total, _r2(subtotal + tax_total), cur.lastrowid),
    )
    conn.execute(
        "UPDATE subscriptions SET next_billing_date=? WHERE id=?",
        (add_period(today, sub["billing_frequency"]), sub["id"]),
    )
    conn.commit()
    return {"kind": "invoice", "number": number, "subscription": sub["number"],
            "total": _r2(subtotal + tax_total)}


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
