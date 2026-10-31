"""variants.py — product-variant repo + line pricing (owner: Manu, T11).

A variant is one (attribute, value) pair on a product — e.g. brand "Odoo" —
carrying a rupee price_delta. THE pricing law of the app lives here:

    unit_price = product.sales_price + variant.price_delta   (variant optional)

`price_line()` turns (product, variant, qty, tax%) into a ready-to-insert
subscription/invoice line — same columns and same description convention the
SEED fixture uses ("Cadence Books (brand: Odoo)"). One function computes it,
everywhere: seed rows, the livefeed simulator, and T20's billing run all call
this so the +₹560 can never drift between screens.
"""
from __future__ import annotations

import sqlite3


def _round2(x: float) -> float:
    return round(float(x) + 0.0, 2)


def list_for_product(conn: sqlite3.Connection, product_id: int) -> list[dict]:
    """All variants of one product, cheapest delta first (stable for UI lists)."""
    rows = conn.execute(
        "SELECT * FROM product_variants WHERE product_id = ?"
        " ORDER BY price_delta, attribute, value",
        (product_id,),
    ).fetchall()
    return list(rows)


def create(
    conn: sqlite3.Connection,
    product_id: int,
    attribute: str,
    value: str,
    price_delta: float = 0.0,
) -> dict:
    """Insert a variant after model-level validation.

    Raises ValueError (friendly sentence) for: unknown product, blank
    attribute/value, non-numeric delta, or a duplicate (attribute, value)
    pair on the same product (schema UNIQUE constraint).
    """
    product = conn.execute(
        "SELECT id, name FROM products WHERE id = ?", (product_id,)
    ).fetchone()
    if product is None:
        raise ValueError(f"Unknown product id {product_id}.")

    attribute = str(attribute or "").strip()
    value = str(value or "").strip()
    if not attribute:
        raise ValueError("Enter an attribute name.")
    if not value:
        raise ValueError("Enter a value.")
    try:
        delta = _round2(price_delta if price_delta is not None else 0.0)
    except (TypeError, ValueError):
        raise ValueError("Price delta must be a number.") from None

    try:
        cur = conn.execute(
            "INSERT INTO product_variants (product_id,attribute,value,price_delta,created_at)"
            " VALUES (?,?,?,?,datetime('now','localtime'))",
            (product_id, attribute, value, delta),
        )
    except sqlite3.IntegrityError:
        raise ValueError(
            f"{product['name']} already has a {attribute} '{value}' variant."
        ) from None
    row = conn.execute(
        "SELECT * FROM product_variants WHERE id = ?", (cur.lastrowid,)
    ).fetchone()
    conn.commit()
    return row


def get(conn: sqlite3.Connection, variant_id: int) -> dict | None:
    return conn.execute(
        "SELECT * FROM product_variants WHERE id = ?", (variant_id,)
    ).fetchone()


def unit_price(
    conn: sqlite3.Connection, product_id: int, variant_id: int | None = None
) -> float:
    """Sales price with the variant delta folded in (the T11 law).

    variant_id None → plain sales price. A variant that does not exist or
    belongs to a different product is an error, not a silent fallback —
    billing must never charge a mismatched pair.
    """
    product = conn.execute(
        "SELECT sales_price FROM products WHERE id = ?", (product_id,)
    ).fetchone()
    if product is None:
        raise ValueError(f"Unknown product id {product_id}.")
    if variant_id is None:
        return _round2(product["sales_price"])
    variant = get(conn, variant_id)
    if variant is None:
        raise ValueError(f"Unknown variant id {variant_id}.")
    if variant["product_id"] != product_id:
        raise ValueError(
            f"Variant {variant_id} does not belong to product {product_id}."
        )
    return _round2(product["sales_price"] + variant["price_delta"])


def price_line(
    conn: sqlite3.Connection,
    product_id: int,
    variant_id: int | None,
    quantity: int,
    tax_percent: float = 0.0,
) -> dict:
    """One priced line, column-for-column like a subscription_lines row.

    Description convention matches the SEED fixture exactly, so seeded rows
    and freshly priced rows are indistinguishable in the UI.
    """
    product = conn.execute(
        "SELECT name, sales_price FROM products WHERE id = ?", (product_id,)
    ).fetchone()
    if product is None:
        raise ValueError(f"Unknown product id {product_id}.")
    try:
        qty = int(quantity)
    except (TypeError, ValueError):
        raise ValueError("Quantity must be a whole number.") from None
    if qty < 1:
        raise ValueError("Quantity must be at least 1.")
    try:
        tax = _round2(tax_percent or 0.0)
    except (TypeError, ValueError):
        raise ValueError("Tax percent must be a number.") from None
    if not 0 <= tax <= 100:
        raise ValueError("Tax percent must be between 0 and 100.")

    variant = get(conn, variant_id) if variant_id is not None else None
    if variant_id is not None and variant is None:
        raise ValueError(f"Unknown variant id {variant_id}.")
    if variant is not None and variant["product_id"] != product_id:
        raise ValueError(
            f"Variant {variant_id} does not belong to product {product_id}."
        )

    price = _round2(
        product["sales_price"] + (variant["price_delta"] if variant else 0.0)
    )
    description = (
        f"{product['name']} ({variant['attribute']}: {variant['value']})"
        if variant is not None
        else product["name"]
    )
    return {
        "product_id": product_id,
        "variant_id": variant_id,
        "description": description,
        "quantity": qty,
        "unit_price": price,
        "tax_percent": tax,
        "amount": _round2(qty * price),
    }
