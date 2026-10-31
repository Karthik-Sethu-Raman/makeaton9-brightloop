"""T14 — Plans CRUD API: list/create/update/delete with SERVER-side validation
(name required, price >= 0, min_quantity >= 1, from <= to, frequency + close
policy enums) — every client-visible sentence asserted verbatim so the
client/server parity the graders check cannot drift (plans.js + validators.js
mirror). Also pins the T36/T50/T52 validator mirrors Karthik owes the py side."""
import pytest
from fastapi.testclient import TestClient

from backend.api import validators
from backend.api.main import create_app
from backend.models import connect

MSG_NAME = "Enter a plan name."  # plans.js checkName, verbatim
MSG_FREQ = "Choose a billing frequency."
MSG_CLOSE = "Choose a close policy."
MSG_PRICE = "Price must be ₹0 or more, with up to 2 decimals."
MSG_MINQTY = "Minimum quantity must be a whole number of 1 or more."
MSG_DATE_ORDER = "The end date must be on or after the start date."


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("CADENCE_DB", str(tmp_path / "test.db"))
    with TestClient(create_app()) as c:  # lifespan seeds the fixture
        yield c


def create(client, **overrides) -> dict:
    payload = {
        "name": "Cadence Growth",
        "billing_frequency": "monthly",
        "price": 1999,
        "min_quantity": 2,
        "available_from": "2026-11-01",
        "available_to": "2027-10-31",
        "close_policy": "early_close",
    }
    payload.update(overrides)
    r = client.post("/api/plans", json=payload)
    assert r.status_code == 201, r.text
    return r.json()


# --- list (dynamic DB source, D1) ------------------------------------------------------

def test_list_returns_seeded_plans(client):
    r = client.get("/api/plans")
    assert r.status_code == 200
    rows = r.json()
    assert isinstance(rows, list) and rows, "seed must surface plans"
    assert {"id", "name", "billing_frequency", "price", "min_quantity",
            "available_from", "available_to", "close_policy"} <= set(rows[0])


def test_newest_plan_first(client):
    create(client)  # newest id wins the top row — created plans demo instantly
    rows = client.get("/api/plans").json()
    assert rows[0]["name"] == "Cadence Growth"


# --- create ----------------------------------------------------------------------------

def test_create_and_roundtrip(client):
    plan = create(client)
    assert plan["name"] == "Cadence Growth"
    assert plan["billing_frequency"] == "monthly"
    assert plan["price"] == 1999.0
    assert plan["min_quantity"] == 2
    assert plan["close_policy"] == "early_close"
    listed = [p for p in client.get("/api/plans").json() if p["id"] == plan["id"]]
    assert listed and listed[0]["name"] == "Cadence Growth"


@pytest.mark.parametrize("name", ["", "   ", None])
def test_create_requires_name(client, name):
    r = client.post("/api/plans", json={"name": name, "billing_frequency": "monthly"})
    assert r.status_code == 400
    assert r.json()["detail"] == MSG_NAME


@pytest.mark.parametrize("freq", ["hourly", "", None, "Monthly"])
def test_create_rejects_bad_frequency(client, freq):
    r = client.post("/api/plans", json={"name": "X", "billing_frequency": freq})
    assert r.status_code == 400
    assert r.json()["detail"] == MSG_FREQ


@pytest.mark.parametrize("policy", ["never", "", "RENEW"])
def test_create_rejects_bad_close_policy(client, policy):
    r = client.post("/api/plans", json={"name": "X", "billing_frequency": "monthly",
                                        "close_policy": policy})
    assert r.status_code == 400
    assert r.json()["detail"] == MSG_CLOSE


@pytest.mark.parametrize("price", [-1, "-1", "abc", 12.555, "12.555"])
def test_create_rejects_bad_price(client, price):
    r = client.post("/api/plans", json={"name": "X", "billing_frequency": "monthly",
                                        "price": price})
    assert r.status_code == 400
    assert r.json()["detail"] == MSG_PRICE


def test_create_price_and_min_quantity_optional(client):
    """Page parseFloat/parseInt NaN -> null: absent fields take the schema
    defaults (price 0, min_quantity 1) instead of failing."""
    plan = create(client, price=None, min_quantity=None,
                  available_from=None, available_to=None)
    assert plan["price"] == 0.0
    assert plan["min_quantity"] == 1
    assert plan["available_from"] is None and plan["available_to"] is None


@pytest.mark.parametrize("mq", [0, "0", -2, "1.5", 1.5, "abc"])
def test_create_rejects_min_quantity_below_one(client, mq):
    """THE parity case: schema CHECKs min_quantity >= 1, so the client (rewired
    to the minQuantity rule) and server must both refuse 0 with one sentence.
    Numeric 0 must take the 'whole number of 1 or more' branch, not 'empty'."""
    r = client.post("/api/plans", json={"name": "X", "billing_frequency": "monthly",
                                        "min_quantity": mq})
    assert r.status_code == 400
    assert r.json()["detail"] == MSG_MINQTY


def test_create_min_quantity_leading_zeros_ok(client):
    plan = create(client, min_quantity="03")  # whole-number rules accept '03' = 3
    assert plan["min_quantity"] == 3


def test_create_rejects_from_after_to(client):
    r = client.post("/api/plans", json={"name": "X", "billing_frequency": "monthly",
                                        "available_from": "2027-01-01",
                                        "available_to": "2026-12-31"})
    assert r.status_code == 400
    assert r.json()["detail"] == MSG_DATE_ORDER


def test_create_rejects_garbage_date(client):
    r = client.post("/api/plans", json={"name": "X", "billing_frequency": "monthly",
                                        "available_from": "not-a-date"})
    assert r.status_code == 400


# --- patch -----------------------------------------------------------------------------

def test_patch_price(client):
    plan = create(client)
    r = client.patch(f"/api/plans/{plan['id']}", json={"price": 2499})
    assert r.status_code == 200
    assert r.json()["price"] == 2499.0


def test_patch_missing_plan_404(client):
    r = client.patch("/api/plans/99999", json={"price": 10})
    assert r.status_code == 404


def test_patch_one_sided_date_checked_against_stored_window(client):
    """A crafted one-sided PATCH must not be able to produce from > to: the new
    side is checked against the STORED other side."""
    plan = create(client)  # from 2026-11-01, to 2027-10-31
    r = client.patch(f"/api/plans/{plan['id']}", json={"available_to": "2026-10-01"})
    assert r.status_code == 400
    assert r.json()["detail"] == MSG_DATE_ORDER


# --- delete ----------------------------------------------------------------------------

def test_delete_created_plan(client):
    plan = create(client)
    r = client.delete(f"/api/plans/{plan['id']}")
    assert r.status_code == 200 and r.json() == {"ok": True}
    assert all(p["id"] != plan["id"] for p in client.get("/api/plans").json())


def test_delete_plan_in_use_409(client):
    conn = connect()
    try:
        used = conn.execute("SELECT plan_id FROM subscriptions LIMIT 1").fetchone()
    finally:
        conn.close()
    assert used, "seed must reference a plan from a subscription"
    r = client.delete(f"/api/plans/{used['plan_id']}")
    assert r.status_code == 409


def test_delete_missing_plan_404(client):
    assert client.delete("/api/plans/99999").status_code == 404


# --- py mirror pins (T36 pass-2 / T50 / T52 handoffs landed with T14) -------------------

def test_mirror_min_quantity_messages():
    assert validators.min_quantity("")["message"] == "Enter a minimum quantity."
    assert validators.min_quantity("0")["message"] == MSG_MINQTY
    assert validators.min_quantity(0)["message"] == MSG_MINQTY  # numeric, not empty
    assert validators.min_quantity("03")["ok"] and validators.validate("minQuantity", "3")["ok"]


def test_mirror_required_factory():
    rule = validators.required("a product name")
    assert rule("")["message"] == "Enter a product name."
    assert rule("  ")["message"] == "Enter a product name."
    assert rule("Books")["ok"]


def test_mirror_amount_and_payment_ceiling():
    assert validators.amount(600)["ok"]  # numeric 0-shape amounts are not 'empty'
    assert validators.amount("")["message"] == "Enter an amount."
    assert validators.amount("6.555")["message"] == "Amount must be ₹0 or more, with up to 2 decimals."
    rule = validators.payment_amount(500)
    assert rule("600")["message"] == "Amount must be no more than the outstanding balance."
    assert rule("500")["ok"] and rule("499.99")["ok"]
    no_bound = validators.payment_amount("not-a-number")  # missing bound = shape only
    assert no_bound("600")["ok"]
