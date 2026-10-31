"""invoices.py — /api/invoices list/detail + lifecycle actions (owner: Karthik, T21).

The client contract is documented in frontend/pages/invoices.js (T22):
  GET  /api/invoices          -> [invoice rows] (newest first) with customer_name,
                                 subscription_number, amount_paid, outstanding,
                                 overdue. outstanding is sent ONLY for
                                 confirmed/paid invoices — the page renders a grey
                                 dash for draft/cancelled ("nothing is demanded
                                 yet / any more"), and a server-sent 0 for a draft
                                 would defeat that; omitting the key lets the
                                 page derive dash per DESIGN.
  GET  /api/invoices/{id}     -> detail: list fields + lines + stored totals
                                 (subtotal/discount_total/tax_total/total) +
                                 payments list.
  POST /api/invoices/{id}/confirm -> draft -> confirmed. Any other state: 409.
  POST /api/invoices/{id}/cancel  -> draft|confirmed -> cancelled. paid/cancelled:
                                 409 (a settled invoice is history, not a choice).
  POST /api/invoices/{id}/send    -> confirmed only (idempotent resend -> 200);
                                 draft -> 409 "confirm first". Print is
                                 client-side (window.print, T41 CSS).

overdue verdict (server wins, page trusts it): state == confirmed AND
outstanding > 0.005 AND due_date < today (IST, calendar date, lexicographic
'YYYY-MM-DD' compare on the first 10 chars — seed and simulator both write
ISO dates). Guards return FastAPI's {"detail": sentence}; the page shows the
sentence verbatim in its flash line, so these are written as spoken sentences.
No auth gate yet — that is T32's RBAC dependency, added there (T10/T14 same).
"""
from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException

from backend.models import connect

router = APIRouter(prefix="/api/invoices", tags=["invoices"])

IST = ZoneInfo("Asia/Kolkata")

LIST_SQL = """
    SELECT i.id, i.number, c.name AS customer_name, s.number AS subscription_number,
           i.issue_date, i.due_date, i.state, i.total,
           COALESCE(p.paid, 0.0) AS amount_paid
    FROM invoices i
    JOIN customers c ON c.id = i.customer_id
    LEFT JOIN subscriptions s ON s.id = i.subscription_id
    LEFT JOIN (SELECT invoice_id, ROUND(SUM(amount), 2) AS paid
               FROM payments GROUP BY invoice_id) p ON p.invoice_id = i.id
"""

MSG_MISSING = "That invoice does not exist."
MSG_CONFIRM_ONLY_DRAFT = "Only a draft invoice can be confirmed."
MSG_CANCEL_PAID = "A paid invoice cannot be cancelled."
MSG_CANCEL_ALREADY = "This invoice is already cancelled."
MSG_SEND_CONFIRM_FIRST = "Confirm the invoice before sending it to the customer."
MSG_SEND_PAID = "A paid invoice cannot be sent again."
MSG_SEND_CANCELLED = "A cancelled invoice cannot be sent."


def _today_iso() -> str:
    return datetime.now(IST).strftime("%Y-%m-%d")


def _enrich(row: dict) -> dict:
    """Compute the verdict fields the page trusts: overdue always (boolean),
    outstanding only where something is actually demanded."""
    out = dict(row)
    out["amount_paid"] = round(float(out["amount_paid"] or 0.0), 2)
    if out["state"] in ("confirmed", "paid"):
        outstanding = 0.0 if out["state"] == "paid" else max(
            0.0, round(float(out["total"] or 0.0) - out["amount_paid"], 2)
        )
        out["outstanding"] = outstanding
        due = str(out.get("due_date") or "")[:10]
        out["overdue"] = (
            out["state"] == "confirmed"
            and outstanding > 0.005
            and bool(due)
            and due < _today_iso()
        )
    else:  # draft / cancelled: nothing demanded — dash, never past-due
        out["overdue"] = False
    return out


def _fetch(conn, invoice_id: int) -> dict | None:
    row = conn.execute(
        LIST_SQL + " WHERE i.id = ?", (invoice_id,)
    ).fetchone()
    return _enrich(row) if row is not None else None


def _detail(conn, invoice_id: int) -> dict | None:
    row = _fetch(conn, invoice_id)
    if row is None:
        return None
    row["lines"] = conn.execute(
        "SELECT description, quantity, unit_price, tax_percent, amount"
        " FROM invoice_lines WHERE invoice_id = ? ORDER BY id",
        (invoice_id,),
    ).fetchall()
    totals = conn.execute(
        "SELECT subtotal, discount_total, tax_total FROM invoices WHERE id = ?",
        (invoice_id,),
    ).fetchone()
    for field in ("subtotal", "discount_total", "tax_total"):
        row[field] = round(float(totals[field]), 2)
    row["payments"] = conn.execute(
        "SELECT method, amount, paid_on, note FROM payments"
        " WHERE invoice_id = ? ORDER BY id",
        (invoice_id,),
    ).fetchall()
    return row


def _load_or_404(conn, invoice_id: int) -> dict:
    row = _fetch(conn, invoice_id)
    if row is None:
        raise HTTPException(status_code=404, detail=MSG_MISSING)
    return row


def _set_state(conn, invoice_id: int, state: str) -> None:
    conn.execute(
        "UPDATE invoices SET state = ? WHERE id = ?", (state, invoice_id)
    )
    conn.commit()


@router.get("")
def list_invoices() -> list[dict]:
    conn = connect()
    try:
        return [_enrich(r) for r in conn.execute(LIST_SQL + " ORDER BY i.id DESC")]
    finally:
        conn.close()


@router.get("/{invoice_id}")
def invoice_detail(invoice_id: int) -> dict:
    conn = connect()
    try:
        detail = _detail(conn, invoice_id)
        if detail is None:
            raise HTTPException(status_code=404, detail=MSG_MISSING)
        return detail
    finally:
        conn.close()


@router.post("/{invoice_id}/confirm")
def confirm_invoice(invoice_id: int) -> dict:
    conn = connect()
    try:
        row = _load_or_404(conn, invoice_id)
        if row["state"] != "draft":
            raise HTTPException(status_code=409, detail=MSG_CONFIRM_ONLY_DRAFT)
        _set_state(conn, invoice_id, "confirmed")
        return _detail(conn, invoice_id)
    finally:
        conn.close()


@router.post("/{invoice_id}/cancel")
def cancel_invoice(invoice_id: int) -> dict:
    conn = connect()
    try:
        row = _load_or_404(conn, invoice_id)
        if row["state"] == "paid":
            raise HTTPException(status_code=409, detail=MSG_CANCEL_PAID)
        if row["state"] == "cancelled":
            raise HTTPException(status_code=409, detail=MSG_CANCEL_ALREADY)
        _set_state(conn, invoice_id, "cancelled")
        return _detail(conn, invoice_id)
    finally:
        conn.close()


@router.post("/{invoice_id}/send")
def send_invoice(invoice_id: int) -> dict:
    conn = connect()
    try:
        row = _load_or_404(conn, invoice_id)
        if row["state"] == "draft":
            raise HTTPException(status_code=409, detail=MSG_SEND_CONFIRM_FIRST)
        if row["state"] == "paid":
            raise HTTPException(status_code=409, detail=MSG_SEND_PAID)
        if row["state"] == "cancelled":
            raise HTTPException(status_code=409, detail=MSG_SEND_CANCELLED)
        # confirmed: sending is a re-issuable act (no sent_at column in the
        # schema; the page flashes "Invoice sent to the customer.") — the
        # returned detail is the honest current state, idempotent by design.
        return _detail(conn, invoice_id)
    finally:
        conn.close()
