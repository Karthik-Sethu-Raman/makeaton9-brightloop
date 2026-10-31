"""T02 — seed fixture tests (owner: Manu). Proves the demo data is consistent."""
from backend.models import db as mdb
from backend.models import seed as mseed


def _seeded(tmp_path):
    conn = mdb.ensure_db(tmp_path / "t.db")
    assert mseed.seed_if_empty(conn) is True
    return conn


def test_seed_runs_once_then_never_again(tmp_path):
    conn = _seeded(tmp_path)
    assert mseed.seed_if_empty(conn) is False  # app_meta guard: no duplicates
    again = conn.execute("SELECT COUNT(*) c FROM customers").fetchone()["c"]
    assert again == 3
    conn.close()


def test_seed_has_statement_variant_plus_560(tmp_path):
    conn = _seeded(tmp_path)
    row = conn.execute(
        "SELECT attribute, value, price_delta FROM product_variants"
        " WHERE attribute='brand' AND value='Odoo'"
    ).fetchone()
    assert row["price_delta"] == 560.0  # the statement's Odoo-brand example
    conn.close()


def test_seed_covers_state_machine_and_payment_states(tmp_path):
    conn = _seeded(tmp_path)
    states = {r["state"] for r in conn.execute("SELECT state FROM subscriptions")}
    assert {"draft", "quotation", "active", "closed"} <= states
    istates = {r["state"] for r in conn.execute("SELECT state FROM invoices")}
    assert {"draft", "confirmed", "paid"} <= istates  # paid/outstanding/overdue scenes
    methods = {r["method"] for r in conn.execute("SELECT method FROM payments")}
    assert len(methods) == 3
    conn.close()


def test_seed_invoice_totals_are_arithmetically_consistent(tmp_path):
    """subtotal - discount + tax == total, tax == pct of discounted base."""
    conn = _seeded(tmp_path)
    inv = conn.execute(
        "SELECT number, subtotal, discount_total, tax_total, total"
        " FROM invoices WHERE number='INV-0003'"
    ).fetchone()
    base = inv["subtotal"] - inv["discount_total"]
    assert round(base * 0.18, 2) == round(inv["tax_total"], 2)
    assert round(base + inv["tax_total"], 2) == round(inv["total"], 2)
    conn.close()
