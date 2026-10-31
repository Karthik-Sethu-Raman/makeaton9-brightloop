"""T11 — variants model tests (owner: Manu). The +₹560 pricing law + seed parity."""
import pytest

from backend.models import db as mdb
from backend.models import seed as mseed
from backend.models import variants as mv


def _seeded(tmp_path):
    conn = mdb.ensure_db(tmp_path / "t.db")
    assert mseed.seed_if_empty(conn) is True
    return conn


# Seeded ids: products 1=Books 999, 2=Inventory 1499, 3=Support 499.
# Variants: 1=(p1 brand Odoo +560), 2=(p1 brand Tally +0), 3=(p2 brand Odoo +560),
#           4=(p2 tier Multi-warehouse +400).


def test_unit_price_law_delta_folded_in(tmp_path):
    conn = _seeded(tmp_path)
    assert mv.unit_price(conn, 1, 1) == 1559.0   # 999 + 560 (statement example)
    assert mv.unit_price(conn, 1, 2) == 999.0    # Tally variant adds nothing
    assert mv.unit_price(conn, 2, 4) == 1899.0   # 1499 + 400
    conn.close()


def test_unit_price_no_variant_is_plain_sales_price(tmp_path):
    conn = _seeded(tmp_path)
    assert mv.unit_price(conn, 2) == 1499.0
    assert mv.unit_price(conn, 2, None) == 1499.0
    conn.close()


def test_unit_price_rejects_mismatched_pair(tmp_path):
    conn = _seeded(tmp_path)
    with pytest.raises(ValueError, match="does not belong"):
        mv.unit_price(conn, 1, 4)  # variant 4 is Inventory's, not Books'
    with pytest.raises(ValueError, match="Unknown product"):
        mv.unit_price(conn, 99, 1)
    with pytest.raises(ValueError, match="Unknown variant"):
        mv.unit_price(conn, 1, 99)
    conn.close()


def test_price_line_matches_every_seeded_subscription_line(tmp_path):
    """Drift guard: the hand-written SEED lines must equal price_line() output
    for description, unit_price and amount — the fixture and the code are one law."""
    conn = _seeded(tmp_path)
    rows = conn.execute(
        "SELECT * FROM subscription_lines ORDER BY id"
    ).fetchall()
    assert len(rows) >= 6
    for r in rows:
        line = mv.price_line(conn, r["product_id"], r["variant_id"],
                             r["quantity"], r["tax_percent"])
        assert line["description"] == r["description"], r["id"]
        assert line["unit_price"] == r["unit_price"], r["id"]
        assert line["amount"] == r["amount"], r["id"]
    conn.close()


def test_price_line_shape_and_description_convention(tmp_path):
    conn = _seeded(tmp_path)
    line = mv.price_line(conn, 1, 1, 3, 18.0)
    assert line == {
        "product_id": 1, "variant_id": 1,
        "description": "Cadence Books (brand: Odoo)",
        "quantity": 3, "unit_price": 1559.0, "tax_percent": 18.0,
        "amount": 4677.0,
    }
    plain = mv.price_line(conn, 3, None, 2)
    assert plain["description"] == "Priority Support"
    assert plain["unit_price"] == 499.0 and plain["amount"] == 998.0
    conn.close()


def test_price_line_validates_quantity_and_tax(tmp_path):
    conn = _seeded(tmp_path)
    with pytest.raises(ValueError, match="at least 1"):
        mv.price_line(conn, 1, None, 0)
    with pytest.raises(ValueError, match="whole number"):
        mv.price_line(conn, 1, None, "two")
    with pytest.raises(ValueError, match="between 0 and 100"):
        mv.price_line(conn, 1, None, 1, 150)
    conn.close()


def test_create_variant_then_price_uses_it(tmp_path):
    conn = _seeded(tmp_path)
    row = mv.create(conn, 1, "tier", "Pro", 250.5)
    assert row["attribute"] == "tier" and row["value"] == "Pro"
    assert mv.unit_price(conn, 1, row["id"]) == 1249.5  # 999 + 250.5
    # new line priced through the same law
    line = mv.price_line(conn, 1, row["id"], 2, 18.0)
    assert line["description"] == "Cadence Books (tier: Pro)"
    assert line["amount"] == 2499.0
    conn.close()


def test_create_variant_validation_errors(tmp_path):
    conn = _seeded(tmp_path)
    with pytest.raises(ValueError, match="Enter an attribute"):
        mv.create(conn, 1, "  ", "Odoo", 5)
    with pytest.raises(ValueError, match="Enter a value"):
        mv.create(conn, 1, "brand", "", 5)
    with pytest.raises(ValueError, match="Unknown product"):
        mv.create(conn, 99, "brand", "Odoo", 5)
    with pytest.raises(ValueError, match="must be a number"):
        mv.create(conn, 1, "brand", "Sage", "lots")
    conn.close()


def test_create_variant_duplicate_is_friendly_error(tmp_path):
    conn = _seeded(tmp_path)
    with pytest.raises(ValueError, match="already has a brand 'Odoo'"):
        mv.create(conn, 1, "brand", "Odoo", 5)
    conn.close()


def test_list_for_product_orders_by_delta(tmp_path):
    conn = _seeded(tmp_path)
    names = [v["value"] for v in mv.list_for_product(conn, 1)]
    assert names == ["Tally", "Odoo"]  # 0-delta first, then +560
    assert mv.list_for_product(conn, 3) == []
    conn.close()
