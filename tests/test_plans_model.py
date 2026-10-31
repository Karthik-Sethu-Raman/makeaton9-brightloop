"""T13 — plans model tests (owner: Manu). The four plan-behaviour laws +
seed parity + simulator drift guard (billing period law has ONE owner)."""
from datetime import date, timedelta

import pytest

from backend.livefeed import simulator as sim
from backend.models import db as mdb
from backend.models import plans as mp
from backend.models import seed as mseed


def _seeded(tmp_path):
    conn = mdb.ensure_db(tmp_path / "t.db")
    assert mseed.seed_if_empty(conn) is True
    return conn


# Seeded plans: 1=Books Monthly(renew) 2=Books Yearly(auto_close, to +365d)
# 3=Inventory Monthly(pause) 4=Support Weekly(early_close, min qty 3)
# 5=Books Daily Trial(auto_close, from -7d).


# ---- 1. billing periods are calendar-true -------------------------------

def test_add_period_daily_and_weekly():
    assert mp.add_period("2026-10-31", "daily") == "2026-11-01"
    assert mp.add_period("2026-10-31", "weekly") == "2026-11-07"


def test_add_period_monthly_clamps_to_month_end():
    assert mp.add_period("2026-01-31", "monthly") == "2026-02-28"  # no Feb 31
    assert mp.add_period("2026-08-31", "monthly") == "2026-09-30"
    assert mp.add_period("2026-12-15", "monthly") == "2027-01-15"  # year rolls


def test_add_period_yearly_handles_leap_day():
    assert mp.add_period("2024-02-29", "yearly") == "2025-02-28"
    assert mp.add_period("2026-10-31", "yearly") == "2027-10-31"


def test_add_period_unknown_frequency_never_guesses():
    with pytest.raises(ValueError, match="Unknown billing frequency"):
        mp.add_period("2026-10-31", "fortnightly")


# ---- 2. availability window ---------------------------------------------

def test_every_seeded_plan_is_orderable_today(tmp_path):
    conn = _seeded(tmp_path)
    for pid in (1, 2, 3, 4, 5):
        ok, msg = mp.is_available(conn, pid)
        assert ok, msg
    conn.close()


def test_window_before_from_and_past_to_are_refused_with_sentences(tmp_path):
    conn = _seeded(tmp_path)
    before = (date.today() - timedelta(days=120)).isoformat()
    ok, msg = mp.is_available(conn, 1, day=before)      # Books Monthly from -90d
    assert not ok and msg.startswith("Books Monthly is available from")
    past = (date.today() + timedelta(days=400)).isoformat()
    ok, msg = mp.is_available(conn, 2, day=past)        # Books Yearly to +365d
    assert not ok and "closed for new orders" in msg
    conn.close()


def test_unknown_plan_id_is_loud_not_silent(tmp_path):
    conn = _seeded(tmp_path)
    with pytest.raises(ValueError, match="Unknown plan id 999"):
        mp.is_available(conn, 999)
    conn.close()


# ---- 3. plan-level minimum quantity --------------------------------------

def test_plan_floor_named_in_message(tmp_path):
    conn = _seeded(tmp_path)
    plan4 = mp.get(conn, 4)                            # Support Weekly, min 3
    assert mp.check_quantity(plan4, "2") == (
        False, "Minimum quantity for Support Weekly is 3.")
    assert mp.check_quantity(plan4, "3")[0] is True
    assert mp.check_quantity(plan4, "abc") == (False, "Quantity must be a whole number.")
    assert mp.check_quantity(mp.get(conn, 1), 1)[0] is True   # floor 1
    conn.close()


def test_can_start_joins_window_and_floor(tmp_path):
    conn = _seeded(tmp_path)
    assert mp.can_start(conn, 4, quantity=2)[1].startswith("Minimum quantity")
    assert mp.can_start(conn, 4, quantity=3) == (True, "")
    conn.close()


# ---- 4. close policy ------------------------------------------------------

def _sub(expiry):
    return {"number": "SUB-0099", "expiry_date": expiry}


def test_renew_policy_never_auto_closes():
    assert mp.term_end_action({"close_policy": "renew"}, _sub("2020-01-01")) == "renew"


def test_early_close_renews_automatically_but_is_customer_closable():
    p = {"close_policy": "early_close"}
    assert mp.term_end_action(p, _sub("2020-01-01")) == "renew"
    assert mp.may_close_early(p) is True
    assert mp.may_close_early({"close_policy": "renew"}) is False


def test_auto_close_closes_only_once_term_ended():
    p = {"close_policy": "auto_close"}
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    assert mp.term_end_action(p, _sub(yesterday)) == "close"
    assert mp.term_end_action(p, _sub(yesterday), day=tomorrow) == "close"
    assert mp.term_end_action(p, _sub(tomorrow)) == "renew"   # not yet ended


def test_pause_pauses_on_expiry_day_itself():
    p = {"close_policy": "pause"}
    today = date.today().isoformat()
    assert mp.term_end_action(p, _sub(today)) == "pause"       # >= expiry
    assert mp.term_end_action(p, _sub(None)) == "renew"        # no term = open


# ---- seed parity + simulator drift guard ----------------------------------

def test_seeded_plans_use_only_legal_enums(tmp_path):
    conn = _seeded(tmp_path)
    rows = conn.execute("SELECT * FROM plans").fetchall()
    assert {r["billing_frequency"] for r in rows} <= set(mp.FREQUENCIES)
    assert {r["close_policy"] for r in rows} <= set(mp.CLOSE_POLICIES)
    conn.close()


def test_simulator_pushes_dates_via_the_model_law(tmp_path):
    """livefeed must advance next_billing_date through plans.add_period —
    one law, never a private 30-day-month approximation (T13 retire)."""
    conn = _seeded(tmp_path)
    sim.bill_due_subscription(conn)                     # SUB-0001, Books Monthly
    nb = conn.execute(
        "SELECT next_billing_date FROM subscriptions WHERE id=1"
    ).fetchone()["next_billing_date"]
    assert nb == mp.add_period(date.today().isoformat(), "monthly")
    conn.close()
