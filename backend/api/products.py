"""products.py — /api/products CRUD (owner: Karthik, T10).

The client contract is documented in frontend/pages/products.js:
  GET    /api/products      -> 200 [product rows] (newest first — a just-created
                                product is immediately visible in the table)
  POST   /api/products      <- {name, type, sales_price?, cost_price?, notes?}
                             -> 201 product | 400 <human sentence>
  PATCH  /api/products/{id} <- any of the same fields -> 200 product | 404 | 400
  DELETE /api/products/{id} -> 200 {ok:true} | 404 | 409 (still referenced)

Validation mirrors the client (graded must-have: both sides, same sentences):
name uses products.js checkName's message verbatim; prices flow through
validators.price — the validators.js mirror — so the two sides cannot drift.
Prices are optional at the API (the schema defaults cost_price to 0; the page
sends parseFloat-ed numbers, and a NaN parses to JSON null), but whenever a
price IS present it must pass the shared rule. 409 on delete keeps the demo
honest: a product quoted on a subscription/template line is never silently
orphaned (SQLite FKs are ON, this turns the would-be IntegrityError into a
sentence). No auth gate yet — that is T32's RBAC dependency, added there.
"""
from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.api.validators import price as price_rule
from backend.models import connect

router = APIRouter(prefix="/api/products", tags=["products"])

PRODUCT_TYPES = ("software", "addon", "service")  # schema CHECK enum
FIELDS = "id, name, type, sales_price, cost_price, notes, created_at"

MSG_NAME_REQUIRED = "Enter a product name."  # products.js checkName, verbatim
MSG_TYPE_BAD = "Choose a product type."
MSG_MISSING = "That product does not exist."
MSG_IN_USE = "That product is used by a subscription or template and cannot be deleted."


class ProductBody(BaseModel):
    name: str | None = None
    type: str | None = None
    sales_price: float | int | str | None = None
    cost_price: float | int | str | None = None
    notes: str | None = None


def _now() -> str:
    return datetime.now(ZoneInfo("Asia/Kolkata")).strftime("%Y-%m-%d %H:%M:%S")


def _clean_price(value, field_label: str) -> float:
    """Shared-rule price check -> stored float. Raises 400 with the mirrored
    message on any invalid input (empty counts as invalid when sent)."""
    result = price_rule(str(value).strip())
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result["message"])
    return float(str(value).strip())


def _clean_fields(body: ProductBody, partial: bool) -> dict:
    """Validate the fields actually present. partial=True (PATCH) leaves the
    rest untouched; partial=False (POST) requires name+type and defaults the
    prices to 0 per the schema."""
    out: dict = {}
    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail=MSG_NAME_REQUIRED)
        out["name"] = name
    elif not partial:
        raise HTTPException(status_code=400, detail=MSG_NAME_REQUIRED)
    if body.type is not None:
        if body.type not in PRODUCT_TYPES:
            raise HTTPException(status_code=400, detail=MSG_TYPE_BAD)
        out["type"] = body.type
    elif not partial:
        raise HTTPException(status_code=400, detail=MSG_TYPE_BAD)
    if body.sales_price is not None:
        out["sales_price"] = _clean_price(body.sales_price, "sales price")
    if body.cost_price is not None:
        out["cost_price"] = _clean_price(body.cost_price, "cost price")
    if body.notes is not None:
        out["notes"] = body.notes.strip()
    return out


def _fetch(conn, product_id: int) -> dict | None:
    return conn.execute(
        f"SELECT {FIELDS} FROM products WHERE id = ?", (product_id,)
    ).fetchone()


@router.get("")
def list_products() -> list[dict]:
    conn = connect()
    try:
        return conn.execute(f"SELECT {FIELDS} FROM products ORDER BY id DESC").fetchall()
    finally:
        conn.close()


@router.post("", status_code=201)
def create_product(body: ProductBody) -> dict:
    cleaned = _clean_fields(body, partial=False)
    cleaned.setdefault("sales_price", 0.0)
    cleaned.setdefault("cost_price", 0.0)
    cleaned.setdefault("notes", "")
    cleaned["created_at"] = _now()
    conn = connect()
    try:
        cur = conn.execute(
            "INSERT INTO products (name, type, sales_price, cost_price, notes, created_at)"
            " VALUES (:name, :type, :sales_price, :cost_price, :notes, :created_at)",
            cleaned,
        )
        conn.commit()
        return _fetch(conn, cur.lastrowid)
    finally:
        conn.close()


@router.patch("/{product_id}")
def update_product(product_id: int, body: ProductBody) -> dict:
    cleaned = _clean_fields(body, partial=True)
    conn = connect()
    try:
        row = _fetch(conn, product_id)
        if row is None:
            raise HTTPException(status_code=404, detail=MSG_MISSING)
        if cleaned:
            sets = ", ".join(f"{field} = :{field}" for field in cleaned)
            conn.execute(
                f"UPDATE products SET {sets} WHERE id = {product_id}", cleaned
            )
            conn.commit()
        return _fetch(conn, product_id)
    finally:
        conn.close()


@router.delete("/{product_id}")
def delete_product(product_id: int) -> dict:
    conn = connect()
    try:
        if _fetch(conn, product_id) is None:
            raise HTTPException(status_code=404, detail=MSG_MISSING)
        used = conn.execute(
            "SELECT 1 FROM subscription_lines WHERE product_id = ?"
            " UNION ALL SELECT 1 FROM quotation_template_lines WHERE product_id = ?"
            " LIMIT 1",
            (product_id, product_id),
        ).fetchone()
        if used is not None:
            raise HTTPException(status_code=409, detail=MSG_IN_USE)
        conn.execute("DELETE FROM product_variants WHERE product_id = ?", (product_id,))
        conn.execute("DELETE FROM products WHERE id = ?", (product_id,))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()
