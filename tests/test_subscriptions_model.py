"""T16 — subscriptions model tests (owner: Manu). Numbering continuation,
the legal state machine, line pricing through the T11 law, and the
totals-vs-seeded-invoice drift guard (money math has ONE owner)."""
from datetime import date

import pytest

from backend.models import db as mdb
from backend.models import seed as mseed
from backend.models import subscriptions as subs


def _seeded(tmp_path):
    conn = mdb.ensure_db(tmp_path / "t.db")
    assert mseed.seed_if_empty(conn) is True
    return conn


# Seeded subs: 1 SUB-0001 active (due today) 2 SUB-0002 active (due today)
# 3 SUB-0003 active 4 SUB-0004 quotation 5 SUB-0005 draft 6 SUB-0006 closed.
# Seeded lines price product1+variant1(Odoo) = 999+560 = 1559 (T11 law).


# ---- 1. numbering ---------------------------------------------------------

def test_next_number_continues_the_seed_sequence(tmp_path):
    conn = _seeded(tmp_path)
    assert subs.next_number(conn) == "SUB-0007"
    conn.close()


def test_next_number_starts_at_0001_on_empty_db(tmp_path):
    conn = mdb.ensure_db(tmp_path / "t.db")
    assert subs.next_number(conn) == "SUB-0001"
    conn.close()


def test_create_gets_a_fresh_number_and_saves_rows(tmp_path):
    conn = _seeded(tmp_path)
    row = subs.create(conn, customer_id=1, plan_id=1)
    assert row["number"] == "SUB-0007"
    assert row["state"] == "draft"
    assert row["start_date"] == date.today().isoformat()
    assert row["payment_terms"] == "Net 15"
    assert subs.next_number(conn) == "SUB-0008"   # sequence advanced
    conn.close()


# ---- 2. create validation --------------------------------------------------

def test_create_unknown_customer_and_plan_raise_sentences(tmp_path):
    conn = _seeded(tmp_path)
    with pytest.raises(ValueError, match="Unknown customer id 99"):
        subs.create(conn, customer_id=99, plan_id=1)
    with pytest.raises(ValueError, match="Unknown plan id 99"):
        subs.create(conn, customer_id=1, plan_id=99)
    conn.close()


def test_create_rejects_unknown_state_and_bad_date(tmp_path):
    conn = _seeded(tmp_path)
    with pytest.raises(ValueError, match="Unknown subscription state 'live'"):
        subs.create(conn, customer_id=1, plan_id=1, state="live")
    with pytest.raises(ValueError, match="Start date must be a date"):
        subs.create(conn, customer_id=1, plan_id=1, start_date="tomorrow")
    conn.close()


# ---- 3. lines are priced by the T11 law only -------------------------------

def test_create_with_lines_prices_through_variant_law(tmp_path):
    conn = _seeded(tmp_path)
    row = subs.create(
        conn, customer_id=1, plan_id=1,
        lines=[{"product_id": 1, "variant_id": 1, "quantity": 2,
                "tax_percent": 18.0}],
    )
    ln = subs.lines(conn, row["id"])
    assert len(ln) == 1
    assert ln[0]["unit_price"] == 1559.0          # 999 + 560 Odoo delta
    assert ln[0]["amount"] == 3118.0
    assert ln[0]["description"] == "Cadence Books (brand: Odoo)"
    assert ln[0]["tax_percent"] == 18.0
    conn.close()


def test_add_line_appends_and_mismatched_variant_raises(tmp_path):
    conn = _seeded(tmp_path)
    ln = subs.add_line(conn, 4, product_id=2, quantity=1, tax_percent=18.0)
    assert ln["unit_price"] == 1499.0             # no variant = plain price
    # variant 1 belongs to product 1 — must never price onto product 2
    with pytest.raises(ValueError, match="does not belong to product 2"):
        subs.add_line(conn, 4, product_id=2, variant_id=1, quantity=1)
    conn.close()


def test_closed_subscription_lines_are_immutable(tmp_path):
    conn = _seeded(tmp_path)                        # SUB-0006 seeded closed
    with pytest.raises(ValueError, match="SUB-0006 is closed"):
        subs.add_line(conn, 6, product_id=1, quantity=1)
    with pytest.raises(ValueError, match="SUB-0006 is closed"):
        subs.set_lines(conn, 6, [{"product_id": 1, "quantity": 1}])
    conn.close()


def test_set_lines_replaces_whole_set(tmp_path):
    conn = _seeded(tmp_path)
    subs.set_lines(conn, 5, [
        {"product_id": 1, "variant_id": 2, "quantity": 1, "tax_percent": 18.0},
        {"product_id": 3, "quantity": 3, "tax_percent": 18.0},
    ])
    ln = subs.lines(conn, 5)
    assert [x["amount"] for x in ln] == [999.0, 1497.0]
    conn.close()


# ---- 4. totals compute + seeded-invoice drift guard -------------------------

def test_totals_match_the_seeded_invoices(tmp_path):
    conn = _seeded(tmp_path)
    t1 = subs.totals(conn, 1)                       # SUB-0001 -> INV-0001
    assert t1 == {"subtotal": 4677.0, "tax_total": 841.86,
                  "total": 5518.86, "line_count": 1}
    t2 = subs.totals(conn, 2)                       # SUB-0002 -> INV-0002
    assert t2 == {"subtotal": 4495.0, "tax_total": 809.1,
                  "total": 5304.1, "line_count": 2}
    conn.close()


def test_totals_of_lineless_subscription_are_zero(tmp_path):
    conn = _seeded(tmp_path)                        # SUB-0005 draft has lines;
    row = subs.create(conn, customer_id=1, plan_id=1)   # new one has none
    assert subs.totals(conn, row["id"]) == {
        "subtotal": 0.0, "tax_total": 0.0, "total": 0.0, "line_count": 0}
    conn.close()


# ---- 5. the state machine ---------------------------------------------------

def test_full_legal_path_draft_to_active_arms_billing(tmp_path):
    conn = _seeded(tmp_path)
    row = subs.create(conn, customer_id=1, plan_id=1)   # draft, no billing day
    assert row["next_billing_date"] is None
    for expected in ("quotation", "confirmed", "active"):
        row = subs.transition(conn, row["id"], expected)
        assert row["state"] == expected
    assert row["next_billing_date"] == date.today().isoformat()  # armed now
    conn.close()


def test_illegal_moves_raise_with_the_number_and_both_states(tmp_path):
    conn = _seeded(tmp_path)
    with pytest.raises(ValueError, match="SUB-0004 cannot move from quotation to active"):
        subs.transition(conn, 4, "active")
    with pytest.raises(ValueError, match="SUB-0006 cannot move from closed to active"):
        subs.transition(conn, 6, "active")         # closed is terminal
    with pytest.raises(ValueError, match="already quotation"):
        subs.transition(conn, 4, "quotation")      # no-op is also refused
    with pytest.raises(ValueError, match="Unknown subscription state"):
        subs.transition(conn, 4, "paused")
    with pytest.raises(ValueError, match="Unknown subscription id 99"):
        subs.transition(conn, 99, "active")
    conn.close()


def test_closing_disarms_billing_and_every_open_state_may_close(tmp_path):
    conn = _seeded(tmp_path)
    row = subs.transition(conn, 1, "closed")       # SUB-0001 was active+due
    assert row["state"] == "closed"
    assert row["next_billing_date"] is None        # dormant marker
    subs.transition(conn, 4, "closed")             # quotation may be declined
    subs.transition(conn, 5, "closed")             # draft may be scrapped
    conn.close()


def test_draft_may_skip_quotation_and_quotation_may_revise(tmp_path):
    conn = _seeded(tmp_path)
    assert subs.transition(conn, 5, "confirmed")["state"] == "confirmed"
    row = subs.create(conn, customer_id=2, plan_id=1)
    row = subs.transition(conn, row["id"], "quotation")
    assert subs.transition(conn, row["id"], "draft")["state"] == "draft"
    conn.close()


def test_seed_states_are_all_in_the_enum(tmp_path):
    conn = _seeded(tmp_path)
    for row in subs.list_subs(conn):
        assert row["state"] in subs.STATES
    conn.close()


# ---- 6. filtered listing for T17 -------------------------------------------

def test_list_subs_filters_state_customer_plan(tmp_path):
    conn = _seeded(tmp_path)
    assert len(subs.list_subs(conn, state="active")) == 3
    assert len(subs.list_subs(conn, customer_id=2)) == 2
    assert len(subs.list_subs(conn, plan_id=1)) == 2
    newest = subs.list_subs(conn, state="active")[0]["id"]
    assert newest == 3                             # newest first
    assert subs.list_subs(conn, state="closed") == [
        subs.get(conn, 6)]                         # single closed sub
    conn.close()
