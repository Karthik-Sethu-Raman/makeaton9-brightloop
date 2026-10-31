"""T19 — quotation-template model tests (owner: Manu).

Pins: pricing-at-copy-time (T11 variant law + auto tax from tax_rules), the
validity window sentence, template-create validation, and the copy action
producing a real quotation subscription through subscriptions.create.
"""
import pytest

from backend.livefeed import simulator
from backend.models import db as mdb
from backend.models import seed as mseed
from backend.models import subscriptions as msubs
from backend.models import taxrules
from backend.models import templates as mt


def _seeded(tmp_path):
    conn = mdb.ensure_db(tmp_path / "t.db")
    assert mseed.seed_if_empty(conn) is True
    return conn


# Seeded template 1 = "Large Retailer Bundle": plan 2 (Books Yearly), 30 days,
# lines (p1+v1 Odoo x10 -> 1559 each), (p2 x2 -> 1499), (p3 x5 -> 499).
# Products 1/2 are software (GST 18%), 3 is addon (GST 18%), 4 service (12%).


def test_seeded_template_prices_with_auto_tax(tmp_path):
    conn = _seeded(tmp_path)
    lines = mt.priced_lines(conn, 1)
    assert [ln["unit_price"] for ln in lines] == [1559.0, 1499.0, 499.0]
    assert [ln["tax_percent"] for ln in lines] == [18.0, 18.0, 18.0]
    assert [ln["amount"] for ln in lines] == [15590.0, 2998.0, 2495.0]
    t = mt.totals(conn, 1)
    assert t["subtotal"] == 21083.0
    assert t["tax_total"] == 3794.94
    assert t["total"] == 24877.94
    conn.close()


def test_detail_and_list_shape(tmp_path):
    conn = _seeded(tmp_path)
    d = mt.detail(conn, 1)
    assert d["name"] == "Large Retailer Bundle"
    assert d["plan_name"] == "Books Yearly"
    assert d["billing_frequency"] == "yearly"
    assert d["totals"]["line_count"] == 3
    assert d["expired"] is False
    import datetime as dt

    assert d["valid_until"] == (dt.date.today() + dt.timedelta(days=30)).isoformat()
    listed = mt.list_templates(conn)
    assert listed[0]["id"] == 1 and "totals" in listed[0]
    conn.close()


def test_copy_creates_quotation_subscription(tmp_path):
    conn = _seeded(tmp_path)
    sub = mt.new_subscription(conn, 1, 3)
    assert sub["number"] == "SUB-0007"          # seed ends at SUB-0006
    assert sub["state"] == "quotation"
    assert sub["customer_id"] == 3 and sub["plan_id"] == 2
    assert sub["from_template"] == "Large Retailer Bundle"
    assert sub["totals"] == {
        "subtotal": 21083.0, "tax_total": 3794.94, "total": 24877.94,
        "line_count": 3,
    }
    stored = msubs.lines(conn, sub["id"])
    assert [ln["description"] for ln in stored] == [
        "Cadence Books (brand: Odoo)", "Cadence Inventory", "Priority Support",
    ]
    assert all(ln["tax_percent"] == 18.0 for ln in stored)
    conn.close()


def test_copy_twice_new_number_each_time(tmp_path):
    conn = _seeded(tmp_path)
    a = mt.new_subscription(conn, 1, 1)
    b = mt.new_subscription(conn, 1, 2)
    assert a["number"] != b["number"]
    assert {a["number"], b["number"]} == {"SUB-0007", "SUB-0008"}
    conn.close()


def test_copy_refuses_expired_template(tmp_path):
    conn = _seeded(tmp_path)
    # A template whose 5-day window closed 10 days ago.
    tid = mt.create(conn, "Old Offer", 1, valid_days=5,
                    lines=[{"product_id": 1, "quantity": 1}])["id"]
    conn.execute(
        "UPDATE quotation_templates SET created_at = date('now','localtime','-10 days')"
        " WHERE id = ?", (tid,))
    conn.commit()
    with pytest.raises(ValueError, match=r"Old Offer expired on \d{4}-\d\d-\d\d"):
        mt.new_subscription(conn, tid, 1)
    conn.close()


def test_copy_guards_unknown_ids(tmp_path):
    conn = _seeded(tmp_path)
    with pytest.raises(ValueError, match="Unknown template id 99."):
        mt.new_subscription(conn, 99, 1)
    with pytest.raises(ValueError, match="Unknown customer id 99."):
        mt.new_subscription(conn, 1, 99)
    conn.close()


def test_create_validation_sentences(tmp_path):
    conn = _seeded(tmp_path)
    good = [{"product_id": 1, "variant_id": 1, "quantity": 2}]
    with pytest.raises(ValueError, match="Enter a template name."):
        mt.create(conn, "  ", 1, lines=good)
    with pytest.raises(ValueError, match="Choose a plan."):
        mt.create(conn, "X", None, lines=good)
    with pytest.raises(ValueError, match="Unknown plan id 99."):
        mt.create(conn, "X", 99, lines=good)
    for bad_days in (0, -3, 3.5, "soon"):
        with pytest.raises(ValueError, match="whole number of days"):
            mt.create(conn, "X", 1, valid_days=bad_days, lines=good)
    with pytest.raises(ValueError, match="Add at least one product line."):
        mt.create(conn, "X", 1, lines=[])
    with pytest.raises(ValueError, match="Unknown product id 99."):
        mt.create(conn, "X", 1, lines=[{"product_id": 99, "quantity": 1}])
    with pytest.raises(ValueError, match="does not belong"):
        mt.create(conn, "X", 1, lines=[{"product_id": 1, "variant_id": 4,
                                        "quantity": 1}])
    # Nothing above may have half-inserted a template.
    assert conn.execute("SELECT COUNT(*) c FROM quotation_templates"
                        ).fetchone()["c"] == 1
    conn.close()


def test_create_then_copy_roundtrip(tmp_path):
    conn = _seeded(tmp_path)
    d = mt.create(conn, "Starter Bundle", 4, valid_days=14,
                  lines=[{"product_id": 1, "variant_id": 2, "quantity": 4},
                         {"product_id": 3, "quantity": 1}])
    assert d["totals"]["line_count"] == 2
    # 999 x4 + 499 = 4495 pre-tax; 18% on both -> 809.10 tax.
    assert d["totals"]["subtotal"] == 4495.0
    assert d["totals"]["tax_total"] == 809.1
    assert mt.list_templates(conn)[0]["id"] == d["id"]   # newest first
    sub = mt.new_subscription(conn, d["id"], 1)
    assert sub["state"] == "quotation" and sub["number"] == "SUB-0007"
    assert sub["totals"]["total"] == pytest.approx(5304.1)
    assert sub["from_template"] == "Starter Bundle"
    conn.close()


def test_taxrules_law_and_simulator_alias(tmp_path):
    conn = _seeded(tmp_path)
    assert taxrules.percent_for(conn, 1) == 18.0    # software-specific rule
    assert taxrules.percent_for(conn, 3) == 18.0    # addon rule
    assert taxrules.percent_for(conn, 4) == 12.0    # service rule
    assert taxrules.percent_for(conn, 99, 7.5) == 7.5   # unknown -> fallback
    # The simulator's billing helper is now the same law (T19 delegation).
    assert simulator.tax_percent_for(conn, 1, 0.0) == 18.0
    conn.close()
