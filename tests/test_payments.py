"""T27 — Payments API: record against invoice + list, contract per T28's page.

Seeded fixture (models/seed.py, marked SEED): INV-0001 paid in full,
INV-0002 confirmed overdue (2000 of 5304.10 paid -> outstanding 3304.10),
INV-0003 confirmed not-yet-due (outstanding 8556.58), INV-0004 draft.
Seeded payments: ids 1-3 (INV-0001 full, INV-0002 part, INV-0003 advance).
Simulator parked via CADENCE_TICK_SECONDS (test_invoices precedent).
"""
import pytest
from fastapi.testclient import TestClient

from backend.api.main import create_app
from backend.api.validators import MSG


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("CADENCE_DB", str(tmp_path / "test.db"))
    monkeypatch.setenv("CADENCE_TICK_SECONDS", "60")  # never ticks during a test
    with TestClient(create_app()) as c:  # lifespan seeds the fixture
        yield c


def invoice_id(client, number):
    rows = client.get("/api/invoices").json()
    return next(r["id"] for r in rows if r["number"] == number)


def pay(client, number, **over):
    body = {
        "invoice_id": invoice_id(client, number),
        "method": "upi",
        "amount": "1000",
        "paid_on": "2026-10-31",
        "note": "test payment",
    }
    body.update(over)
    return client.post("/api/payments", json=body)


# --- GET list (dynamic DB source, D1) -------------------------------------------------

def test_list_seeded_payments_contract(client):
    r = client.get("/api/payments")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, dict) and isinstance(data["payments"], list)
    rows = data["payments"]
    assert len(rows) == 3, "seed must surface its payments"
    assert {"id", "paid_on", "method", "amount", "note", "invoice_id",
            "invoice_number", "customer_name"} <= set(rows[0])
    assert rows[0]["invoice_number"] == "INV-0003"  # newest first = highest id


def test_record_then_list_shows_it_newest_first(client):
    r = pay(client, "INV-0002", amount="500")
    assert r.status_code == 201
    rows = client.get("/api/payments").json()["payments"]
    assert rows[0]["id"] == r.json()["payment"]["id"]
    assert rows[0]["invoice_number"] == "INV-0002"
    assert rows[0]["note"] == "test payment"


# --- POST record ----------------------------------------------------------------------

def test_record_against_confirmed_returns_outstanding_after(client):
    r = pay(client, "INV-0002", amount="1000")  # 3304.10 - 1000
    assert r.status_code == 201
    out = r.json()
    assert out["ok"] is True
    assert out["outstanding"] == pytest.approx(2304.10)
    assert out["payment"]["method"] == "upi"
    assert out["payment"]["customer_name"]  # join carried the name through


def test_full_payment_flips_invoice_to_paid_and_clears_overdue(client):
    r = pay(client, "INV-0002", amount="3304.10")  # paisa-exact clear
    assert r.status_code == 201
    assert r.json()["outstanding"] == 0.0
    rows = client.get("/api/invoices").json()
    inv = next(x for x in rows if x["number"] == "INV-0002")
    assert inv["state"] == "paid" and inv["outstanding"] == 0.0
    assert inv["overdue"] is False  # settled history, not a chase row


def test_part_payment_keeps_invoice_overdue_verdict(client):
    pay(client, "INV-0002", amount="100")
    rows = client.get("/api/invoices").json()
    inv = next(x for x in rows if x["number"] == "INV-0002")
    assert inv["state"] == "confirmed" and inv["overdue"] is True


# --- amount guards (mirror messages, byte-for-byte parity) ----------------------------

def test_over_ceiling_rejected_one_paisa_over(client):
    r = pay(client, "INV-0002", amount="3304.11")
    assert r.status_code == 400
    assert r.json()["detail"] == MSG["amtMax"] == \
        "Amount must be no more than the outstanding balance."


def test_bad_shape_amount_rejected_with_mirror_messages(client):
    for bad in ("12.345", "-5", "abc"):
        r = pay(client, "INV-0002", amount=bad)
        assert r.status_code == 400, bad
        assert r.json()["detail"] == MSG["amtBad"]
    r = pay(client, "INV-0002", amount="")
    assert r.status_code == 400 and r.json()["detail"] == MSG["amtEmpty"]
    r = pay(client, "INV-0002", amount=None)  # key absent / null
    assert r.status_code == 400 and r.json()["detail"] == MSG["amtEmpty"]


def test_zero_amount_rejected_before_schema_check(client):
    r = pay(client, "INV-0002", amount="0")
    assert r.status_code == 400  # schema CHECK(amount>0) never reached -> no 500


# --- invoice guards -------------------------------------------------------------------

def test_unknown_id_and_draft_invoice_404(client):
    for iid in (9999, "not-a-number"):
        r = pay(client, "INV-0002", invoice_id=iid)
        assert r.status_code == 404, iid
        assert r.json()["detail"] == "No invoice needs a payment with that id."
    r = pay(client, "INV-0004")  # draft: nothing demanded yet
    assert r.status_code == 404
    assert r.json()["detail"] == "No invoice needs a payment with that id."


def test_paid_invoice_409_never_silent(client):
    r = pay(client, "INV-0001")
    assert r.status_code == 409
    assert r.json()["detail"] == "That invoice is already fully paid."


# --- server-side required guards (client validates too — graded must-have) ------------

def test_method_and_date_validated_server_side(client):
    r = pay(client, "INV-0002", method="")
    assert r.status_code == 400 and r.json()["detail"] == "Enter a payment method."
    r = pay(client, "INV-0002", method="paypal")
    assert r.status_code == 400 and r.json()["detail"] == "Choose a valid payment method."
    r = pay(client, "INV-0002", paid_on="")
    assert r.status_code == 400 and r.json()["detail"] == "Enter a payment date."
    for bad in ("31-10-2026", "2026-13-01"):  # wrong shape / impossible month
        r = pay(client, "INV-0002", paid_on=bad)
        assert r.status_code == 400 and \
            r.json()["detail"] == "Enter the date the payment was made.", bad
