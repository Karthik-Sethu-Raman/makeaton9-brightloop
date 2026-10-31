"""T20 — the billing-run law (owner: Manu).

Pins the task sentence word for word: due invoices are generated from ACTIVE
subscriptions, idempotent (never twice — even under a concurrent writer, even
at the raw-SQL level via schema's UNIQUE index), never skipped (a sub left
unbilled for several periods is caught up one invoice per period, back-dated,
oldest first), and taxes come automatically from tax_rules.
"""
import sqlite3
from datetime import date, timedelta

import pytest

from backend.models import billing
from backend.models import db as mdb
from backend.models import seed as mseed
from backend.models.plans import add_period

TODAY = date.today().isoformat()


def _seeded(tmp_path):
    conn = mdb.ensure_db(tmp_path / "t.db")
    assert mseed.seed_if_empty(conn) is True
    return conn


def _set_due(conn, number, day):
    conn.execute(
        "UPDATE subscriptions SET next_billing_date=? WHERE number=?", (day, number)
    )
    conn.commit()


def _sub_invoices(conn, sub_id):
    return list(conn.execute(
        "SELECT * FROM invoices WHERE subscription_id=? ORDER BY issue_date, id",
        (sub_id,),
    ).fetchall())


def test_run_bills_every_due_active_subscription(tmp_path):
    conn = _seeded(tmp_path)
    out = billing.run(conn)
    # Seed: SUB-0001 + SUB-0002 due today; SUB-0003 due in 10 days; 4/5/6 not active.
    assert out["count"] == 2
    assert out["remaining_due"] == 0
    assert out["invoices"] == ["INV-0005", "INV-0006"]  # seed holds INV-0001..0004
    assert [e["subscription"] for e in out["events"]] == ["SUB-0001", "SUB-0002"]
    assert out["total"] == pytest.approx(5518.86 + 5304.10)

    first = conn.execute(
        "SELECT * FROM invoices WHERE number='INV-0005'"
    ).fetchone()
    assert first["state"] == "confirmed"          # born into the chase list
    assert first["issue_date"] == TODAY
    assert first["due_date"] == (date.today() + timedelta(days=15)).isoformat()
    assert first["subtotal"] == pytest.approx(4677.0)   # 3 x 1559 (Odoo variant)
    assert first["tax_total"] == pytest.approx(841.86)  # 18% GST via tax_rules
    assert first["total"] == pytest.approx(5518.86)     # == seeded INV-0001

    # SUB-0003 (not due) gained nothing; both billed subs pushed a full period.
    assert len(_sub_invoices(conn, 3)) == 1               # only seeded INV-0003
    nb = conn.execute(
        "SELECT next_billing_date FROM subscriptions WHERE id=1"
    ).fetchone()["next_billing_date"]
    assert nb == add_period(TODAY, "monthly") and nb > TODAY
    conn.close()


def test_second_run_bills_nothing_and_sql_cannot_double_bill(tmp_path):
    conn = _seeded(tmp_path)
    billing.run(conn)
    again = billing.run(conn)                       # never twice
    assert again["count"] == 0 and again["remaining_due"] == 0
    assert conn.execute("SELECT COUNT(*) c FROM invoices").fetchone()["c"] == 6

    with pytest.raises(sqlite3.IntegrityError):     # the DB-level guard itself
        conn.execute(
            "INSERT INTO invoices (number,subscription_id,customer_id,issue_date,"
            " due_date,created_at) VALUES ('INV-9999', 1, 1, ?, ?,"
            " datetime('now','localtime'))", (TODAY, TODAY)
        )
    conn.close()


def test_taxes_come_from_tax_rules_not_the_stored_line(tmp_path):
    conn = _seeded(tmp_path)
    conn.execute("UPDATE subscription_lines SET tax_percent=0 WHERE subscription_id=1")
    conn.commit()
    billing.run(conn)
    line = conn.execute(
        "SELECT * FROM invoice_lines WHERE invoice_id="
        " (SELECT id FROM invoices WHERE number='INV-0005')"
    ).fetchone()
    assert line["tax_percent"] == 18.0              # rule beats the stored 0
    inv = conn.execute("SELECT * FROM invoices WHERE number='INV-0005'").fetchone()
    assert inv["tax_total"] == pytest.approx(841.86)
    conn.close()


def test_catch_up_never_skips_missed_periods(tmp_path):
    conn = _seeded(tmp_path)
    # SUB-0002 parked in the future: isolate SUB-0001, unpaid for ~3 months.
    _set_due(conn, "SUB-0002", add_period(TODAY, "monthly"))
    past = (date.today() - timedelta(days=95)).isoformat()
    _set_due(conn, "SUB-0001", past)

    expected, step = [], past
    while step <= TODAY:                            # one invoice per period
        expected.append(step)
        step = add_period(step, "monthly")
    assert len(expected) >= 3                       # the fixture really went stale

    out = billing.run(conn)
    assert out["count"] == len(expected)
    assert out["remaining_due"] == 0
    got = [e["issue_date"] for e in out["events"]]
    assert got == expected                          # no period skipped, oldest first
    for a, b in zip(got, got[1:]):                  # consecutive calendar periods
        assert add_period(a, "monthly") == b
    assert all(d <= TODAY for d in got)             # back-dated, never future
    nb = conn.execute(
        "SELECT next_billing_date FROM subscriptions WHERE number='SUB-0001'"
    ).fetchone()["next_billing_date"]
    assert nb > TODAY                               # fully caught up
    conn.close()


def test_limit_defers_work_but_a_followup_run_never_loses_it(tmp_path):
    conn = _seeded(tmp_path)
    _set_due(conn, "SUB-0002", add_period(TODAY, "monthly"))
    past = (date.today() - timedelta(days=70)).isoformat()
    _set_due(conn, "SUB-0001", past)

    first = billing.bill_subscription(conn, 1, limit=1)   # the tick's pacing
    assert len(first) == 1
    still = conn.execute(
        "SELECT COUNT(*) c FROM subscriptions WHERE state='active'"
        " AND next_billing_date IS NOT NULL AND next_billing_date <= ?",
        (TODAY,),
    ).fetchone()["c"]
    assert still == 1                               # more periods still owed
    out = billing.run(conn)                         # the run finishes the job
    assert out["remaining_due"] == 0
    conn.close()


def test_guards_loud_and_quiet(tmp_path):
    conn = _seeded(tmp_path)
    with pytest.raises(ValueError, match="Unknown subscription id"):
        billing.bill_subscription(conn, 999)
    with pytest.raises(ValueError, match="SUB-0004 is quotation, not active"):
        billing.bill_subscription(conn, 4)
    assert billing.bill_subscription(conn, 3) == []        # active, due in 10 days
    _set_due(conn, "SUB-0003", None)                      # dormant (pause law)
    assert billing.bill_subscription(conn, 3) == []
    conn.close()


def test_concurrent_double_bill_is_absorbed_not_crashed(tmp_path):
    """A livefeed tick bills the same period mid-run: UNIQUE hits, the run
    detects 'already billed', pushes the date, returns no event for it."""
    conn = _seeded(tmp_path)
    conn.execute(  # the 'winner' — same subscription, same issue day
        "INSERT INTO invoices (number,subscription_id,customer_id,issue_date,"
        " due_date,created_at) VALUES ('INV-0099', 1, 1, ?, ?,"
        " datetime('now','localtime'))", (TODAY, TODAY)
    )
    conn.commit()
    events = billing.bill_subscription(conn, 1)
    assert events == []                             # never twice, no exception
    nb = conn.execute(
        "SELECT next_billing_date FROM subscriptions WHERE id=1"
    ).fetchone()["next_billing_date"]
    assert nb > TODAY                               # and the date still advanced
    conn.close()


def test_no_lines_subscription_unblocks_the_queue_without_invoicing(tmp_path):
    conn = _seeded(tmp_path)
    conn.execute("DELETE FROM subscription_lines WHERE subscription_id=1")
    conn.commit()
    assert billing.bill_subscription(conn, 1) == []
    nb = conn.execute(
        "SELECT next_billing_date FROM subscriptions WHERE id=1"
    ).fetchone()["next_billing_date"]
    assert nb == add_period(TODAY, "monthly")       # pushed from today, no invoice
    conn.close()
