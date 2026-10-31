"""T21 — Invoice API: list/detail + confirm/cancel/send lifecycle guards.

Seeded fixture (models/seed.py, marked SEED): INV-0001 paid in full,
INV-0002 confirmed + due yesterday (part-paid 2000 of 5304.10 -> OVERDUE),
INV-0003 confirmed + due in +20d (part-paid 8000 of 16556.58 -> outstanding,
not overdue), INV-0004 draft. The simulator is parked (first wait >> test
life, test_livefeed precedent) so verdicts are deterministic.
"""
import pytest
from fastapi.testclient import TestClient

from backend.api.main import create_app


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("CADENCE_DB", str(tmp_path / "test.db"))
    monkeypatch.setenv("CADENCE_TICK_SECONDS", "60")  # never ticks during a test
    with TestClient(create_app()) as c:  # lifespan seeds the fixture
        yield c


def by_number(rows, number):
    return next(r for r in rows if r["number"] == number)


# --- list (dynamic DB source, D1) -----------------------------------------------------

def test_list_returns_seeded_invoices_with_contract_fields(client):
    r = client.get("/api/invoices")
    assert r.status_code == 200
    rows = r.json()
    assert isinstance(rows, list) and len(rows) >= 4, "seed must surface invoices"
    assert {"id", "number", "customer_name", "subscription_number", "issue_date",
            "due_date", "state", "total", "amount_paid", "overdue"} <= set(rows[0])
    assert all(row["number"].startswith("INV-") for row in rows)


def test_list_newest_first(client):
    rows = client.get("/api/invoices").json()
    assert rows[0]["number"] == "INV-0004"  # highest id wins the top row


def test_seeded_paid_outstanding_overdue_verdicts(client):
    rows = client.get("/api/invoices").json()
    paid = by_number(rows, "INV-0001")
    assert paid["state"] == "paid" and paid["outstanding"] == 0.0
    assert paid["overdue"] is False
    overdue = by_number(rows, "INV-0002")
    assert overdue["state"] == "confirmed"
    assert overdue["amount_paid"] == 2000.0
    assert overdue["outstanding"] == pytest.approx(3304.10)
    assert overdue["overdue"] is True  # due yesterday IST, balance remains
    outstanding = by_number(rows, "INV-0003")
    assert outstanding["outstanding"] == pytest.approx(8556.58)
    assert outstanding["overdue"] is False  # confirmed but not past due yet
    draft = by_number(rows, "INV-0004")
    assert "outstanding" not in draft  # nothing demanded yet -> page renders dash
    assert draft["overdue"] is False


# --- detail ---------------------------------------------------------------------------

def test_detail_lines_totals_payments(client):
    r = client.get("/api/invoices/3")  # INV-0003, the multi-seat discounted one
    assert r.status_code == 200
    d = r.json()
    assert d["number"] == "INV-0003"
    assert d["lines"] and {"description", "quantity", "unit_price",
                           "tax_percent", "amount"} <= set(d["lines"][0])
    assert d["discount_total"] == pytest.approx(1559.0)
    assert d["tax_total"] == pytest.approx(2525.58)
    assert d["total"] == pytest.approx(16556.58)
    assert d["payments"] and {"method", "amount", "paid_on", "note"} <= set(d["payments"][0])
    assert d["payments"][0]["method"] == "card"


def test_detail_missing_404(client):
    assert client.get("/api/invoices/999").status_code == 404


# --- lifecycle guards (Draft -> Confirmed -> Paid; sentences shown verbatim) -----------

def test_confirm_draft_then_refuse_reconfirm(client):
    r = client.post("/api/invoices/4/confirm")  # INV-0004 draft
    assert r.status_code == 200
    assert r.json()["state"] == "confirmed"
    assert r.json()["outstanding"] == pytest.approx(5304.10)  # demanded now
    again = client.post("/api/invoices/4/confirm")
    assert again.status_code == 409
    assert again.json()["detail"] == "Only a draft invoice can be confirmed."


def test_send_requires_confirmed_then_idempotent(client):
    r = client.post("/api/invoices/4/send")  # draft: refuse with the reason
    assert r.status_code == 409
    assert r.json()["detail"] == "Confirm the invoice before sending it to the customer."
    assert client.post("/api/invoices/4/confirm").status_code == 200
    sent = client.post("/api/invoices/4/send")
    assert sent.status_code == 200 and sent.json()["state"] == "confirmed"
    resent = client.post("/api/invoices/4/send")  # re-send is legal, not an error
    assert resent.status_code == 200
    paid_send = client.post("/api/invoices/1/send")  # INV-0001 settled
    assert paid_send.status_code == 409
    assert paid_send.json()["detail"] == "A paid invoice cannot be sent again."


def test_cancel_guards_paid_and_repeated(client):
    paid = client.post("/api/invoices/1/cancel")  # INV-0001 paid
    assert paid.status_code == 409
    assert paid.json()["detail"] == "A paid invoice cannot be cancelled."
    r = client.post("/api/invoices/2/cancel")  # INV-0002 confirmed -> cancellable
    assert r.status_code == 200
    body = r.json()
    assert body["state"] == "cancelled"
    assert "outstanding" not in body  # cancelled: nothing demanded any more -> dash
    assert body["overdue"] is False
    again = client.post("/api/invoices/2/cancel")
    assert again.status_code == 409
    assert again.json()["detail"] == "This invoice is already cancelled."


def test_action_on_missing_invoice_404(client):
    assert client.post("/api/invoices/999/confirm").status_code == 404
    assert client.post("/api/invoices/999/cancel").status_code == 404
    assert client.post("/api/invoices/999/send").status_code == 404
