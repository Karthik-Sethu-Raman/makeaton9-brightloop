"""T35 — /api/reports/finance: the Overview screen's chart + overdue data.

Seeded fixture (models/seed.py, marked SEED): payments at -22d (INV-0001,
5518.86), -5d (INV-0002, 2000.00), -3d (INV-0003, 8000.00); INV-0002 is
confirmed, due yesterday, part-paid -> the one OVERDUE invoice. Simulator
parked (CADENCE_TICK_SECONDS=60, first wait >> test life) so every figure is
deterministic.
"""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient

from backend.api.main import create_app
from backend.models import connect

IST = ZoneInfo("Asia/Kolkata")


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("CADENCE_DB", str(tmp_path / "test.db"))
    monkeypatch.setenv("CADENCE_TICK_SECONDS", "60")  # never ticks during a test
    with TestClient(create_app()) as c:  # lifespan seeds the fixture
        yield c


def test_finance_shape_and_window(client):
    r = client.get("/api/reports/finance")
    assert r.status_code == 200
    body = r.json()
    assert body["window_days"] == 30 and body["window_label"] == "Last 30 days"
    series = body["revenue_series"]
    assert len(series) == 30, "window must be contiguous, zeros included"
    today = datetime.now(IST).date()
    assert series[0]["date"] == (today - timedelta(days=29)).isoformat()
    assert series[-1]["date"] == today.isoformat()
    assert all(p["total"] >= 0 for p in series)
    assert body["series_total"] == round(sum(p["total"] for p in series), 2)


def test_series_sums_only_payments_inside_the_window(client):
    # days=7 window: seed payments at -5d and -3d are inside, -22d is outside.
    body = client.get("/api/reports/finance?days=7").json()
    assert body["window_days"] == 7 and len(body["revenue_series"]) == 7
    assert body["series_total"] == 10000.00  # 2000.00 + 8000.00, not 15518.86 more


def test_series_is_db_backed_not_static(client):
    before = client.get("/api/reports/finance").json()
    today = datetime.now(IST).strftime("%Y-%m-%d")
    conn = connect()  # respects CADENCE_DB — write the same way the simulator does
    try:
        conn.execute(
            "INSERT INTO payments (invoice_id, method, amount, paid_on, note, created_at)"
            " VALUES (1, 'cash', 111.11, ?, 'T35 dynamic-proof', ?)",
            (today, today),
        )
        conn.commit()
    finally:
        conn.close()
    after = client.get("/api/reports/finance").json()
    assert after["revenue_series"][-1]["total"] == round(
        before["revenue_series"][-1]["total"] + 111.11, 2
    ), "a payment landing today must move today's point (D1 dynamic data)"
    assert after["series_total"] > before["series_total"]


def test_overdue_rows_match_invoice_list_contract(client):
    body = client.get("/api/reports/finance").json()
    assert body["overdue_count"] >= 1, "seed's INV-0002 must be overdue"
    assert len(body["overdue"]) <= 5, "overview list rule: 4-6 rows max"
    row = next(r for r in body["overdue"] if r["number"] == "INV-0002")
    assert {"id", "number", "customer_name", "due_date", "state", "total",
            "amount_paid", "outstanding", "overdue"} <= set(row)
    assert row["state"] == "confirmed" and row["overdue"] is True
    assert row["outstanding"] > 0
    assert all(r["overdue"] is True for r in body["overdue"])


def test_days_param_clamped(client):
    assert client.get("/api/reports/finance?days=1").json()["window_days"] == 7
    assert client.get("/api/reports/finance?days=400").json()["window_days"] == 120
