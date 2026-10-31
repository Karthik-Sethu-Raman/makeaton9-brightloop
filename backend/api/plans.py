"""plans.py — /api/plans CRUD (owner: Karthik, T14).

The client contract is documented in frontend/pages/plans.js:
  GET    /api/plans      -> 200 [plan rows] (newest first — a just-created plan
                            is immediately the top table row)
  POST   /api/plans      <- {name, billing_frequency, price?, min_quantity?,
                             available_from?, available_to?, close_policy?}
                          -> 201 plan | 400 <human sentence>
  PATCH  /api/plans/{id} <- any of the same fields -> 200 plan | 404 | 400
  DELETE /api/plans/{id} -> 200 {ok:true} | 404 | 409 (still referenced)

Validation mirrors the client (graded must-have: both sides, same sentences):
name uses plans.js checkName's message verbatim; price flows through the shared
price rule and min_quantity through the shared minQuantity rule (the validators.js
mirror — same sentence both sides, drift fails CI). Numbers arrive as JSON numbers
(parseFloat/parseInt on the page; NaN serialises to null) so price/min_quantity
are optional at the API (schema defaults 0 / 1) but validated whenever present.
available_from/to are optional ISO dates; when both are present date_order applies
(the page's dateOrder rule, same sentence). close_policy defaults to the schema's
'renew' when absent and is enum-checked when present. 409 on delete keeps the demo
honest: a plan a subscription or quotation template uses is never silently
orphaned. No auth gate yet — that is T32's RBAC dependency, added there.
"""
from __future__ import annotations

from datetime import date, datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.api.validators import (
    date_order as date_order_rule,
    min_quantity as min_quantity_rule,
    price as price_rule,
)
from backend.models import connect

router = APIRouter(prefix="/api/plans", tags=["plans"])

FREQUENCIES = ("daily", "weekly", "monthly", "yearly")  # schema CHECK enum
CLOSE_POLICIES = ("auto_close", "early_close", "pause", "renew")  # schema enum
FIELDS = (
    "id, name, billing_frequency, price, min_quantity,"
    " available_from, available_to, close_policy, created_at"
)

MSG_NAME_REQUIRED = "Enter a plan name."  # plans.js checkName, verbatim
MSG_FREQ_BAD = "Choose a billing frequency."
MSG_CLOSE_BAD = "Choose a close policy."
MSG_DATE_BAD = "Dates must be valid ISO dates (YYYY-MM-DD)."
MSG_MISSING = "That plan does not exist."
MSG_IN_USE = "That plan is used by a subscription or template and cannot be deleted."


class PlanBody(BaseModel):
    name: str | None = None
    billing_frequency: str | None = None
    price: float | int | str | None = None
    min_quantity: int | float | str | None = None
    available_from: str | None = None
    available_to: str | None = None
    close_policy: str | None = None


def _now() -> str:
    return datetime.now(ZoneInfo("Asia/Kolkata")).strftime("%Y-%m-%d %H:%M:%S")


def _clean_date(value: str, field_name: str) -> str | None:
    """''/None -> NULL; otherwise must parse as ISO YYYY-MM-DD (the date inputs
    can only produce that shape — this guards crafted API writes only)."""
    v = (value or "").strip()
    if not v:
        return None
    try:
        date.fromisoformat(v)
    except ValueError:
        raise HTTPException(status_code=400, detail=MSG_DATE_BAD)
    return v


def _clean_fields(body: PlanBody, partial: bool) -> dict:
    """Validate the fields actually present. partial=True (PATCH) leaves the rest
    untouched; partial=False (POST) requires name+billing_frequency and defaults
    price 0 / min_quantity 1 / close_policy 'renew' per the schema."""
    out: dict = {}
    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail=MSG_NAME_REQUIRED)
        out["name"] = name
    elif not partial:
        raise HTTPException(status_code=400, detail=MSG_NAME_REQUIRED)
    if body.billing_frequency is not None:
        if body.billing_frequency not in FREQUENCIES:
            raise HTTPException(status_code=400, detail=MSG_FREQ_BAD)
        out["billing_frequency"] = body.billing_frequency
    elif not partial:
        raise HTTPException(status_code=400, detail=MSG_FREQ_BAD)
    if body.price is not None:
        result = price_rule(str(body.price).strip())
        if not result["ok"]:
            raise HTTPException(status_code=400, detail=result["message"])
        out["price"] = float(str(body.price).strip())
    if body.min_quantity is not None:
        result = min_quantity_rule(body.min_quantity)
        if not result["ok"]:
            raise HTTPException(status_code=400, detail=result["message"])
        out["min_quantity"] = int(str(body.min_quantity).strip())
    if body.available_from is not None:
        out["available_from"] = _clean_date(body.available_from, "available_from")
    if body.available_to is not None:
        out["available_to"] = _clean_date(body.available_to, "available_to")
    if "available_from" in out and "available_to" in out:
        result = date_order_rule(out["available_from"], out["available_to"])
        if not result["ok"]:
            raise HTTPException(status_code=400, detail=result["message"])
    if body.close_policy is not None:
        if body.close_policy not in CLOSE_POLICIES:
            raise HTTPException(status_code=400, detail=MSG_CLOSE_BAD)
        out["close_policy"] = body.close_policy
    return out


def _fetch(conn, plan_id: int) -> dict | None:
    return conn.execute(
        f"SELECT {FIELDS} FROM plans WHERE id = ?", (plan_id,)
    ).fetchone()


@router.get("")
def list_plans() -> list[dict]:
    conn = connect()
    try:
        return conn.execute(f"SELECT {FIELDS} FROM plans ORDER BY id DESC").fetchall()
    finally:
        conn.close()


@router.post("", status_code=201)
def create_plan(body: PlanBody) -> dict:
    cleaned = _clean_fields(body, partial=False)
    cleaned.setdefault("price", 0.0)
    cleaned.setdefault("min_quantity", 1)
    cleaned.setdefault("available_from", None)
    cleaned.setdefault("available_to", None)
    cleaned.setdefault("close_policy", "renew")
    cleaned["created_at"] = _now()
    conn = connect()
    try:
        cur = conn.execute(
            "INSERT INTO plans (name, billing_frequency, price, min_quantity,"
            " available_from, available_to, close_policy, created_at)"
            " VALUES (:name, :billing_frequency, :price, :min_quantity,"
            " :available_from, :available_to, :close_policy, :created_at)",
            cleaned,
        )
        conn.commit()
        return _fetch(conn, cur.lastrowid)
    finally:
        conn.close()


@router.patch("/{plan_id}")
def update_plan(plan_id: int, body: PlanBody) -> dict:
    cleaned = _clean_fields(body, partial=True)
    conn = connect()
    try:
        row = _fetch(conn, plan_id)
        if row is None:
            raise HTTPException(status_code=404, detail=MSG_MISSING)
        if "available_from" in cleaned or "available_to" in cleaned:
            # dateOrder applies to the EFFECTIVE window: a PATCH of one side is
            # checked against the stored other side (the page edits both at once,
            # a crafted one-sided PATCH still cannot produce from > to).
            new_from = cleaned.get("available_from", row["available_from"])
            new_to = cleaned.get("available_to", row["available_to"])
            result = date_order_rule(new_from, new_to)
            if not result["ok"]:
                raise HTTPException(status_code=400, detail=result["message"])
        if cleaned:
            sets = ", ".join(f"{field} = :{field}" for field in cleaned)
            conn.execute(f"UPDATE plans SET {sets} WHERE id = {plan_id}", cleaned)
            conn.commit()
        return _fetch(conn, plan_id)
    finally:
        conn.close()


@router.delete("/{plan_id}")
def delete_plan(plan_id: int) -> dict:
    conn = connect()
    try:
        if _fetch(conn, plan_id) is None:
            raise HTTPException(status_code=404, detail=MSG_MISSING)
        used = conn.execute(
            "SELECT 1 FROM subscriptions WHERE plan_id = ?"
            " UNION ALL SELECT 1 FROM quotation_templates WHERE plan_id = ?"
            " LIMIT 1",
            (plan_id, plan_id),
        ).fetchone()
        if used is not None:
            raise HTTPException(status_code=409, detail=MSG_IN_USE)
        conn.execute("DELETE FROM plans WHERE id = ?", (plan_id,))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()
