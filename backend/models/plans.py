"""plans.py — plan-behaviour law (owner: Manu, T13).

A plan owns four rules every other module must obey, not re-implement:

  1. BILLING PERIODS — `add_period(day, frequency)` advances a date one
     CALENDAR-true period: monthly = same day next month (Jan 31 -> Feb 28),
     yearly = same date next year (Feb 29 -> Feb 28), weekly +7, daily +1.
     The livefeed simulator and T20's billing run both push next_billing_date
     through this one function, so "a full period" can never drift between
     screens. (The simulator's old 30/365-day approximation is retired.)
  2. AVAILABILITY WINDOW — `is_available()` checks available_from/to (NULL =
     open-ended) and returns a friendly sentence, ready for the API to show.
  3. MIN QUANTITY — `check_quantity()` enforces the PLAN's floor (e.g. Support
     Weekly needs 3). The form-level minQuantity rule (validators, >= 1) checks
     the input shape; this checks the plan's business floor. Both must pass.
  4. CLOSE POLICY — `term_end_action()` is what the billing run does when a
     subscription's term ends: renew (keep billing — also the auto behaviour
     of 'renew' and 'early_close'), close (auto_close at expiry), or pause
     (halt billing until resumed). `may_close_early()` is the customer-side
     permission the T17 transition endpoint guards on.

Unknown ids/frequencies raise ValueError — never a silent fallback (T11
philosophy: loud failure beats quietly wrong money).
"""
from __future__ import annotations

import calendar as _cal
import sqlite3
from datetime import date, timedelta

FREQUENCIES = ("daily", "weekly", "monthly", "yearly")
CLOSE_POLICIES = ("auto_close", "early_close", "pause", "renew")


def get(conn: sqlite3.Connection, plan_id: int) -> dict | None:
    return conn.execute("SELECT * FROM plans WHERE id = ?", (plan_id,)).fetchone()


def add_period(iso_day: str, frequency: str) -> str:
    """One calendar-true billing period after iso_day (YYYY-MM-DD in, out).

    Month-end and leap-day are clamped to the target month's last day, the
    way a human reads "monthly"/"yearly" on an invoice.
    """
    if frequency not in FREQUENCIES:
        raise ValueError(f"Unknown billing frequency '{frequency}'.")
    d = date.fromisoformat(iso_day)
    if frequency == "daily":
        nxt = d + timedelta(days=1)
    elif frequency == "weekly":
        nxt = d + timedelta(days=7)
    elif frequency == "monthly":
        y, m = (d.year + 1, 1) if d.month == 12 else (d.year, d.month + 1)
        nxt = date(y, m, min(d.day, _cal.monthrange(y, m)[1]))
    else:  # yearly
        y = d.year + 1
        nxt = date(y, d.month, min(d.day, _cal.monthrange(y, d.month)[1]))
    return nxt.isoformat()


def is_available(
    conn: sqlite3.Connection, plan_id: int, day: str | None = None
) -> tuple[bool, str]:
    """Is the plan inside its available_from..available_to window on `day`?

    day defaults to today (IST server-local). NULL bounds are open-ended.
    """
    plan = get(conn, plan_id)
    if plan is None:
        raise ValueError(f"Unknown plan id {plan_id}.")
    d = day or date.today().isoformat()
    if plan["available_from"] and d < plan["available_from"]:
        return False, f"{plan['name']} is available from {plan['available_from']}."
    if plan["available_to"] and d > plan["available_to"]:
        return False, f"{plan['name']} closed for new orders on {plan['available_to']}."
    return True, ""


def check_quantity(plan_row: dict, quantity) -> tuple[bool, str]:
    """Enforce the plan's min_quantity floor on a (possibly string) quantity."""
    floor = int(plan_row["min_quantity"] or 1)
    try:
        q = int(str(quantity).strip())
    except (TypeError, ValueError):
        return False, "Quantity must be a whole number."
    if q < floor:
        return False, f"Minimum quantity for {plan_row['name']} is {floor}."
    return True, ""


def can_start(
    conn: sqlite3.Connection,
    plan_id: int,
    quantity=None,
    day: str | None = None,
) -> tuple[bool, str]:
    """One gate for opening a subscription: window + (optional) plan floor."""
    ok, msg = is_available(conn, plan_id, day)
    if not ok:
        return ok, msg
    if quantity is not None:
        return check_quantity(get(conn, plan_id), quantity)
    return True, ""


def term_end_action(plan_row: dict, subscription_row, day: str | None = None) -> str:
    """What the billing run does at this subscription's term end.

    'renew'  — keep billing (next date advances). Auto-behaviour of the
               'renew' and 'early_close' policies; 'auto_close'/'pause'
               BEFORE expiry also just renew.
    'close'  — 'auto_close' whose expiry_date has arrived: close the sub.
    'pause'  — 'pause' whose expiry_date has arrived: stop billing until
               resumed (schema has no paused state; a NULL next_billing_date
               is the dormancy marker).
    """
    policy = plan_row["close_policy"]
    if policy not in CLOSE_POLICIES:
        raise ValueError(f"Unknown close policy '{policy}'.")
    if policy in ("renew", "early_close"):
        return "renew"
    sub = dict(subscription_row) if subscription_row is not None else {}
    expiry = sub.get("expiry_date")
    d = day or date.today().isoformat()
    term_ended = bool(expiry) and d >= expiry
    if policy == "auto_close":
        return "close" if term_ended else "renew"
    return "pause" if term_ended else "renew"   # policy == "pause"


def may_close_early(plan_row: dict) -> bool:
    """May the CUSTOMER close this subscription before term end? (T17 guard)"""
    return plan_row["close_policy"] == "early_close"
