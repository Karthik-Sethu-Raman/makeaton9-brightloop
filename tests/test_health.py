"""T01 — vertical slice: app factory boots, health endpoint answers, shell +
frontend mounts serve, CORS stays off, lifespan seeds the fixture (tmp DB)."""
import pytest
from fastapi.testclient import TestClient

from backend.api.main import create_app


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("CADENCE_DB", str(tmp_path / "test.db"))
    with TestClient(create_app()) as c:  # `with` runs the lifespan (seed + livefeed hooks)
        yield c


def test_health_ok(client):
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert body["db"] == "ok"
    assert body["app"] == "cadence"


def test_shell_served_at_root(client):
    r = client.get("/")
    assert r.status_code == 200
    assert "Cadence" in r.text
    assert "router.js" in r.text  # SPA boot seam (T06) is actually served


def test_reset_page_served(client):
    assert "reset" in client.get("/reset.html").text.lower()


def test_frontend_modules_mounted(client):
    for url in (
        "/frontend/styles/tokens.css",
        "/frontend/styles/layout.css",
        "/frontend/pages/router.js",
        "/frontend/pages/overview.js",
        "/frontend/components/table.js",
        "/frontend/validation/validators.js",
    ):
        assert client.get(url).status_code == 200, url


def test_cors_off(client):
    r = client.get("/api/health")
    assert "access-control-allow-origin" not in r.headers


def test_seed_ran_on_boot(client):
    from backend.models import connect

    conn = connect()  # reads CADENCE_DB, still pointed at the tmp DB by the fixture
    try:
        n = conn.execute("SELECT COUNT(*) AS n FROM users").fetchone()["n"]
    finally:
        conn.close()
    assert n >= 3  # admin/staff/customer fixture accounts are in
