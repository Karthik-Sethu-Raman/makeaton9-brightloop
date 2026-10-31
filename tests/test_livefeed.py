"""T03 — livefeed simulator (owner: Manu).

Proves the dynamic-data engine: mutations are real DB writes, billing is
idempotent, the sub state machine only walks forward, the feed never drains
to silence, and summary() KPIs match the seeded books exactly (the contract
T04's overview page polls).
"""
from datetime import date, timedelta

from backend.livefeed import simulator as sim
from backend.models import db as mdb
from backend.models import seed as mseed

KPI_KEYS = {"active_subscriptions", "revenue_collected", "outstanding",
            "overdue_invoices"}


def _seeded(tmp_path):
    conn = mdb.ensure_db(tmp_path / "t.db")
    assert mseed.seed_if_empty(conn) is True
    return conn


def test_summary_matches_the_seeded_books(tmp_path):
    conn = _seeded(tmp_path)
    s = sim.summary(conn)
    assert set(s["kpis"]) == KPI_KEYS
    assert s["updated_at"]  # freshness stamp for the 3 s poll
    assert s["kpis"]["active_subscriptions"] == 3       # SUB-0001/0002/0003
    assert s["kpis"]["revenue_collected"] == 15518.86   # 5518.86 + 2000 + 8000
    assert s["kpis"]["outstanding"] == 11860.68         # (5304.1-2000)+(16556.58-8000)
    assert s["kpis"]["overdue_invoices"] == 1           # INV-0002, due yesterday
    assert s["activity"] and s["activity"][0]["amount"] > 0
    conn.close()


def test_payments_land_until_outstanding_drains_and_flips_paid(tmp_path):
    conn = _seeded(tmp_path)
    before = sim.summary(conn)["kpis"]
    for _ in range(30):
        if sim.land_one_payment(conn) is None:
            break
    after = sim.summary(conn)["kpis"]
    assert after["revenue_collected"] > before["revenue_collected"]
    assert after["outstanding"] < before["outstanding"]
    state = conn.execute(
        "SELECT state FROM invoices WHERE number='INV-0002'"
    ).fetchone()["state"]
    assert state == "paid"          # oldest-due invoice got chased to zero
    assert after["outstanding"] == 0.0
    conn.close()


def test_subscription_states_walk_forward_only(tmp_path):
    conn = _seeded(tmp_path)
    for _ in range(6):              # 5 legal moves exist, the 6th is a no-op
        sim.advance_one_subscription(conn)
    states = {r["number"]: r["state"]
              for r in conn.execute("SELECT number, state FROM subscriptions")}
    assert states["SUB-0004"] == "active"   # quotation -> confirmed -> active
    assert states["SUB-0005"] == "active"   # draft -> quotation -> confirmed -> active
    assert states["SUB-0006"] == "closed"   # terminal state: never picked
    nb = conn.execute(
        "SELECT next_billing_date FROM subscriptions WHERE number='SUB-0005'"
    ).fetchone()["next_billing_date"]
    assert nb is not None                    # billable the day it activates
    assert sim.advance_one_subscription(conn) is None
    conn.close()


def test_bill_due_is_taxed_and_idempotent(tmp_path):
    conn = _seeded(tmp_path)
    ev = sim.bill_due_subscription(conn)
    assert ev["subscription"] == "SUB-0001"            # due today, earliest
    inv = conn.execute(
        "SELECT * FROM invoices WHERE number=?", (ev["number"],)
    ).fetchone()
    assert inv["state"] == "confirmed"
    assert inv["subtotal"] == 4677.0                   # 3 x 1559 (Odoo variant)
    assert inv["tax_total"] == 841.86                  # 18% GST via tax_rules
    assert inv["total"] == 5518.86
    assert inv["due_date"] == (date.today() + timedelta(days=15)).isoformat()  # Net 15
    assert sim.bill_due_subscription(conn)["subscription"] == "SUB-0002"  # also due
    assert sim.bill_due_subscription(conn) is None     # SUB-0003 due in 10 days
    dup = conn.execute(
        "SELECT COUNT(*) c FROM invoices WHERE subscription_id=1"
    ).fetchone()["c"]
    assert dup == 2     # seed's INV-0001 + exactly ONE new (never billed twice)
    nb = conn.execute(
        "SELECT next_billing_date FROM subscriptions WHERE id=1"
    ).fetchone()["next_billing_date"]
    assert nb > date.today().isoformat()               # pushed a full period
    conn.close()


def test_tick_keeps_the_feed_alive_forever(tmp_path):
    conn = _seeded(tmp_path)
    seed_kpis = sim.summary(conn)["kpis"]
    for _ in range(40):
        sim.tick(conn)
    live = sim.summary(conn)["kpis"]
    assert set(live) == KPI_KEYS
    assert live["revenue_collected"] > seed_kpis["revenue_collected"]
    assert live["active_subscriptions"] > seed_kpis["active_subscriptions"]
    n_invoices = conn.execute("SELECT COUNT(*) c FROM invoices").fetchone()["c"]
    assert n_invoices > 4                              # fresh invoices billed
    # 40 ticks far exceed what the seeded outstanding can absorb, so the
    # reschedule mechanism must have created fresh due work, not silence.
    assert live["outstanding"] > 0 or n_invoices > 6
    conn.close()


def test_start_stop_thread_lifecycle(monkeypatch):
    monkeypatch.setenv("CADENCE_TICK_SECONDS", "60")    # first wait >> test life
    try:
        assert sim.start() is True
        assert sim.start() is False                     # never two feed threads
        t = sim._thread
        assert t.is_alive() and t.daemon
        sim.stop()
        assert not t.is_alive()                         # joined, not abandoned
        sim.stop()                                      # idempotent shutdown
    finally:
        sim.stop()
