"""T10 — Products CRUD API: list/create/update/delete with SERVER-side
validation (name required, price >= 0 via the validators.js mirror). Covers the
task line's two required cases plus the client-parity sentences the products
page renders inline (products.js checkName's message, verbatim)."""
import pytest
from fastapi.testclient import TestClient

from backend.api import validators
from backend.api.main import create_app
from backend.models import connect


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("CADENCE_DB", str(tmp_path / "test.db"))
    with TestClient(create_app()) as c:  # lifespan seeds the fixture
        yield c


def create(client, **overrides) -> dict:
    payload = {"name": "Cadence Analytics", "type": "software",
               "sales_price": 4999, "cost_price": 1200, "notes": "per-site"}
    payload.update(overrides)
    r = client.post("/api/products", json=payload)
    assert r.status_code == 201, r.text
    return r.json()


# --- list (dynamic DB source, D1) ----------------------------------------------------

def test_list_returns_seeded_products(client):
    r = client.get("/api/products")
    assert r.status_code == 200
    rows = r.json()
    assert isinstance(rows, list) and rows, "seed must surface products"
    assert {"id", "name", "type", "sales_price", "cost_price", "notes"} <= set(rows[0])


def test_newest_product_first(client):
    create(client)  # newest id wins the top row — created products demo instantly
    rows = client.get("/api/products").json()
    assert rows[0]["name"] == "Cadence Analytics"


# --- create --------------------------------------------------------------------------

def test_create_and_roundtrip(client):
    product = create(client)
    assert product["name"] == "Cadence Analytics"
    assert product["type"] == "software"
    assert product["sales_price"] == 4999.0
    assert product["cost_price"] == 1200.0
    assert product["notes"] == "per-site"
    listed = [p for p in client.get("/api/products").json() if p["id"] == product["id"]]
    assert listed and listed[0]["name"] == "Cadence Analytics"


@pytest.mark.parametrize("name", ["", "   ", None])
def test_create_requires_name(client, name):
    body = {"name": name, "type": "software"}
    r = client.post("/api/products", json=body)
    assert r.status_code == 400
    assert r.json()["detail"] == "Enter a product name."  # products.js checkName


@pytest.mark.parametrize("price", [-1, 12.555, "abc", "12.5.5"])
def test_create_rejects_invalid_price(client, price):
    r = client.post("/api/products", json={"name": "X", "type": "service",
                                           "sales_price": price})
    assert r.status_code == 400
    assert r.json()["detail"] == validators.MSG["priceBad"]  # mirrored sentence


def test_create_rejects_bad_type(client):
    r = client.post("/api/products", json={"name": "X", "type": "hardware"})
    assert r.status_code == 400
    assert r.json()["detail"] == "Choose a product type."


def test_create_prices_optional_default_zero(client):
    # prices absent (or null — the page's parseFloat(NaN) serialises to null)
    # default to 0.0 rather than failing; present-but-invalid still 400s above
    r = client.post("/api/products", json={"name": "Bare", "type": "addon"})
    assert r.status_code == 201
    assert r.json()["sales_price"] == 0.0 and r.json()["cost_price"] == 0.0


def test_create_accepts_string_prices(client):
    r = client.post("/api/products", json={"name": "Str", "type": "service",
                                           "sales_price": "1250.50"})
    assert r.status_code == 201
    assert r.json()["sales_price"] == 1250.5


# --- update --------------------------------------------------------------------------

def test_patch_updates_fields(client):
    product = create(client)
    r = client.patch(f"/api/products/{product['id']}",
                     json={"sales_price": 5999, "notes": "tiered"})
    assert r.status_code == 200
    assert r.json()["sales_price"] == 5999.0
    assert r.json()["name"] == "Cadence Analytics"  # untouched fields survive
    assert client.get("/api/products").json()[0]["notes"] == "tiered"  # persisted


def test_patch_validates_like_create(client):
    product = create(client)
    r = client.patch(f"/api/products/{product['id']}", json={"sales_price": -5})
    assert r.status_code == 400
    assert r.json()["detail"] == validators.MSG["priceBad"]


def test_patch_missing_product_404(client):
    r = client.patch("/api/products/99999", json={"name": "Ghost"})
    assert r.status_code == 404


# --- delete --------------------------------------------------------------------------

def test_delete_then_404(client):
    product = create(client)
    assert client.delete(f"/api/products/{product['id']}").status_code == 200
    assert client.delete(f"/api/products/{product['id']}").status_code == 404
    assert all(p["id"] != product["id"]
               for p in client.get("/api/products").json())


def test_delete_referenced_product_409(client, tmp_path):
    product = create(client)
    conn = connect()  # simulate a subscription line quoting it (T16's writer)
    try:
        conn.execute("PRAGMA foreign_keys=ON")
        sub = conn.execute(
            "SELECT id FROM subscriptions LIMIT 1").fetchone()
        conn.execute(
            "INSERT INTO subscription_lines (subscription_id, product_id,"
            " description, quantity, unit_price, tax_percent, amount)"
            " VALUES (?, ?, 'line', 1, 100, 0, 100)", (sub["id"], product["id"]))
        conn.commit()
    finally:
        conn.close()
    r = client.delete(f"/api/products/{product['id']}")
    assert r.status_code == 409
    assert "cannot be deleted" in r.json()["detail"]
