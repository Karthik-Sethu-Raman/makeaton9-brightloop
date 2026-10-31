"""payments.py — /api/payments record + list (owner: Manu, T27; module reassigned
from Karthik by the integrator @14:25, ruling logged in PROGRESS @14:45).

The client contract is documented in frontend/pages/payments.js (T28):
  GET  /api/payments -> 200 {"payments": [{id, paid_on, method, amount, note,
                            invoice_id, invoice_number, customer_name}]}
                        (newest first = highest id first, the T21 list law).
  POST /api/payments {invoice_id, method, amount, paid_on, note?}
                     -> 201 {"ok": true, "payment": {...}, "outstanding": <after>}
  Guards (sentences shown verbatim in the page's flash line):
    400 amount shape/ceiling — validators.py amount() mirror (amtEmpty/amtBad)
         + paymentAmount's ceiling law compared in integer paisa, so ₹8.10
         against ₹8.10 outstanding passes (binary floats alone would reject it).
    404 "No invoice needs a payment with that id." — unknown id, or a
         draft/cancelled invoice (nothing is demanded yet / any more).
    409 "That invoice is already fully paid." — state paid (or confirmed with a
         rounding-zero balance: data drift the chase list would skip too).

outstanding/overdue verdicts for the PICKER come from /api/invoices (T21) —
this module's "outstanding balance computed" duty is the figure returned after
a recording, plus the state flip: a recording that clears the balance marks the
invoice paid (simulator land_one_payment precedent, livefeed/simulator.py:93).
Recording against a paid invoice is 409, not silent — money in needs a witness.

Server validates EVERYTHING the client does (graded must-have): required
method/date, method enum, date shape, amount shape, ceiling. The mirror
messages are byte-identical to validators.js via validators.MSG; the two
guards the client's widgets make unreachable (₹0 payment — schema CHECK
amount > 0 — and a malformed date) get their own spoken sentences.
"""
from __future__ import annotations

import re
from datetime import date, datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.api.validators import MSG, amount as amount_rule
from backend.models import connect

router = APIRouter(prefix="/api/payments", tags=["payments"])

IST = ZoneInfo("Asia/Kolkata")

PAY_METHODS = ("upi", "card", "bank_transfer", "cash", "cheque")

MSG_NO_OPEN_INVOICE = "No invoice needs a payment with that id."
MSG_ALREADY_PAID = "That invoice is already fully paid."
MSG_METHOD_REQUIRED = "Enter a payment method."
MSG_METHOD_BAD = "Choose a valid payment method."
MSG_DATE_REQUIRED = "Enter a payment date."
MSG_DATE_BAD = "Enter the date the payment was made."
MSG_AMOUNT_POSITIVE = "Enter an amount above ₹0."  # schema CHECK(amount > 0)

LIST_SQL = """
    SELECT p.id, p.paid_on, p.method, p.amount, p.note,
           p.invoice_id, i.number AS invoice_number, c.name AS customer_name
    FROM payments p
    JOIN invoices i ON i.id = p.invoice_id
    JOIN customers c ON c.id = i.customer_id
"""

# outstanding is computed the T21 way: stored totals minus rounded payment sum
INVOICE_SQL = """
    SELECT i.id, i.number, c.name AS customer_name, i.state, i.total,
           COALESCE(p.paid, 0.0) AS amount_paid
    FROM invoices i
    JOIN customers c ON c.id = i.customer_id
    LEFT JOIN (SELECT invoice_id, ROUND(SUM(amount), 2) AS paid
               FROM payments GROUP BY invoice_id) p ON p.invoice_id = i.id
    WHERE i.id = ?
"""

_DATE_RE = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}")


class PaymentBody(BaseModel):
    invoice_id: int | str | None = None
    method: str | None = None
    amount: float | int | str | None = None
    paid_on: str | None = None
    note: str | None = None


def _now() -> str:
    return datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S")


def _cents(x: float) -> int:
    # validators.js paymentAmount compares in integer paisa; mirror it exactly
    return round(x * 100)


def _outstanding(row: dict) -> float:
    return round(max(0.0, float(row["total"] or 0.0) - float(row["amount_paid"] or 0.0)), 2)


def _payment(conn, payment_id: int) -> dict | None:
    return conn.execute(LIST_SQL + " WHERE p.id = ?", (payment_id,)).fetchone()


def _validate_method(method: str | None) -> str:
    if method is None or not str(method).strip():
        raise HTTPException(status_code=400, detail=MSG_METHOD_REQUIRED)
    m = str(method).strip()
    if m not in PAY_METHODS:
        raise HTTPException(status_code=400, detail=MSG_METHOD_BAD)
    return m


def _validate_paid_on(paid_on: str | None) -> str:
    if paid_on is None or not str(paid_on).strip():
        raise HTTPException(status_code=400, detail=MSG_DATE_REQUIRED)
    d = str(paid_on).strip()
    if not _DATE_RE.fullmatch(d):
        raise HTTPException(status_code=400, detail=MSG_DATE_BAD)
    try:
        date.fromisoformat(d)
    except ValueError:  # e.g. 2026-13-01 / 2026-02-31
        raise HTTPException(status_code=400, detail=MSG_DATE_BAD) from None
    return d


def _validate_amount(amount, outstanding: float) -> float:
    # amount arrives as a STRING from the page (JSON.stringify of the trimmed
    # input) — the mirror rule is string-shaped, so run it as-is.
    result = amount_rule("" if amount is None else str(amount).strip())
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result["message"])
    value = float(str(amount).strip())
    if _cents(value) <= 0:
        raise HTTPException(status_code=400, detail=MSG_AMOUNT_POSITIVE)
    if _cents(value) > _cents(outstanding):
        raise HTTPException(status_code=400, detail=MSG["amtMax"])
    return round(value, 2)


@router.get("")
def list_payments() -> dict:
    conn = connect()
    try:
        return {"payments": conn.execute(LIST_SQL + " ORDER BY p.id DESC").fetchall()}
    finally:
        conn.close()


@router.post("", status_code=201)
def record_payment(body: PaymentBody) -> dict:
    method = _validate_method(body.method)
    paid_on = _validate_paid_on(body.paid_on)

    conn = connect()
    try:
        try:
            invoice_id = int(str(body.invoice_id).strip())
        except (TypeError, ValueError):
            invoice_id = -1  # unfindable by construction -> the 404 below
        row = conn.execute(INVOICE_SQL, (invoice_id,)).fetchone()
        if row is None or row["state"] in ("draft", "cancelled"):
            # unknown id, or an invoice that demands nothing (yet/any more)
            raise HTTPException(status_code=404, detail=MSG_NO_OPEN_INVOICE)
        outstanding = _outstanding(row)
        if row["state"] == "paid" or outstanding <= 0.005:
            raise HTTPException(status_code=409, detail=MSG_ALREADY_PAID)

        value = _validate_amount(body.amount, outstanding)

        cur = conn.execute(
            "INSERT INTO payments (invoice_id, method, amount, paid_on, note, created_at)"
            " VALUES (?,?,?,?,?,?)",
            (row["id"], method, value, paid_on,
             (body.note or "").strip() or None, _now()),
        )
        remaining = round(max(0.0, outstanding - value), 2)
        if remaining <= 0.004:  # cleared -> settled, same law as the simulator
            conn.execute("UPDATE invoices SET state='paid' WHERE id=?", (row["id"],))
            remaining = 0.0
        conn.commit()
        return {
            "ok": True,
            "payment": _payment(conn, cur.lastrowid),
            "outstanding": remaining,
        }
    finally:
        conn.close()
