"""T08 — auth API: signup/login/me + forgot/reset, server-side validation with the
validators.js-mirrored messages (client AND server parity is graded). Covers the
task line's two required cases (invalid password, duplicate email) plus the
reset.html contract and the mirror's Unicode/code-point traps."""
import pytest
from fastapi.testclient import TestClient

from backend.api import validators
from backend.api.main import create_app

ADMIN = ("admin@brightloop.test", "Admin@12345")  # SEED users (backend/models/seed.py)
CUSTOMER = ("shop@aralamstores.test", "Shop@12345")


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("CADENCE_DB", str(tmp_path / "test.db"))
    with TestClient(create_app()) as c:  # lifespan seeds the fixture
        yield c


def auth_get(client, path, token=""):
    return client.get(path, headers={"x-auth-token": token})


# --- signup ---------------------------------------------------------------------------

def test_signup_ok_and_me_roundtrip(client):
    r = client.post("/api/auth/signup", json={"email": "new.user@shop.test", "password": "Welcome@123"})
    assert r.status_code == 200
    body = r.json()
    assert body["token"]
    assert body["user"]["email"] == "new.user@shop.test"
    assert body["user"]["role"] == "customer"  # least privilege on open signup
    me = auth_get(client, "/api/auth/me", body["token"])
    assert me.status_code == 200
    assert me.json() == {"email": "new.user@shop.test", "role": "customer"}


@pytest.mark.parametrize(
    "bad",
    [
        "Ab1!efg",           # 7 chars — policy is MORE than 8
        "lowercase1!long",   # no uppercase
        "UPPERCASE1!LONG",   # no lowercase
        "NoSpecial12345",    # no special character
    ],
)
def test_signup_rejects_weak_password(client, bad):
    r = client.post("/api/auth/signup", json={"email": "x@y.test", "password": bad})
    assert r.status_code == 400
    assert r.json()["detail"] == validators.MSG["password"]  # exact mirrored sentence


@pytest.mark.parametrize(
    "email_value, message_key",
    [("not-an-email", "emailBad"), ("", "emailEmpty"), ("a@b", "emailBad")],
)
def test_signup_rejects_bad_email(client, email_value, message_key):
    r = client.post("/api/auth/signup", json={"email": email_value, "password": "Welcome@123"})
    assert r.status_code == 400
    assert r.json()["detail"] == validators.MSG[message_key]


def test_signup_duplicate_email(client):
    r = client.post("/api/auth/signup", json={"email": ADMIN[0], "password": "Welcome@123"})
    assert r.status_code == 409
    assert r.json()["detail"] == "That email is already registered."


# --- login / me -----------------------------------------------------------------------

def test_login_seeded_admin_roundtrip(client):
    r = client.post("/api/auth/login", json={"email": ADMIN[0], "password": ADMIN[1]})
    assert r.status_code == 200
    assert r.json()["user"]["role"] == "admin"
    me = auth_get(client, "/api/auth/me", r.json()["token"])
    assert me.status_code == 200
    assert me.json()["role"] == "admin"


def test_login_wrong_password(client):
    r = client.post("/api/auth/login", json={"email": ADMIN[0], "password": "Wrong@12345"})
    assert r.status_code == 401
    assert r.json()["detail"] == "Email or password is incorrect."


def test_login_unknown_email_same_message(client):
    r = client.post("/api/auth/login", json={"email": "ghost@nowhere.test", "password": "Whatever@1"})
    assert r.status_code == 401
    assert r.json()["detail"] == "Email or password is incorrect."  # no user enumeration


def test_me_requires_valid_token(client):
    assert auth_get(client, "/api/auth/me", "garbage-token").status_code == 401
    assert auth_get(client, "/api/auth/me", "").status_code == 401


# --- forgot / reset (static/reset.html contract) --------------------------------------

def test_forgot_unknown_email(client):
    r = client.post("/api/auth/forgot", json={"email": "ghost@nowhere.test"})
    assert r.status_code == 404
    assert r.json()["detail"] == "No account uses that email."


def test_forgot_reset_roundtrip(client, capsys):
    r = client.post("/api/auth/forgot", json={"email": CUSTOMER[0]})
    assert r.status_code == 200
    url = r.json()["reset_url"]
    assert r.json()["ok"] is True
    assert url.startswith("/reset.html?token=")
    assert url in capsys.readouterr().out  # second demo channel: link hits the server log

    token = url.split("token=", 1)[1]
    weak = client.post("/api/auth/reset", json={"token": token, "password": "short"})
    assert weak.status_code == 400
    assert weak.json()["detail"] == validators.MSG["password"]

    ok = client.post("/api/auth/reset", json={"token": token, "password": "NewPass@999"})
    assert ok.status_code == 200 and ok.json() == {"ok": True}  # weak try didn't burn the token

    again = client.post("/api/auth/reset", json={"token": token, "password": "NewPass@999"})
    assert again.status_code == 404  # single use

    assert client.post("/api/auth/login", json={"email": CUSTOMER[0], "password": "NewPass@999"}).status_code == 200
    assert client.post("/api/auth/login", json={"email": CUSTOMER[0], "password": CUSTOMER[1]}).status_code == 401


def test_reset_garbage_token(client):
    r = client.post("/api/auth/reset", json={"token": "no-such-token", "password": "NewPass@999"})
    assert r.status_code == 404
    assert r.json()["detail"] == "That reset link has expired. Request a new one."


# --- validators mirror parity (pure rules, no HTTP) -----------------------------------

def test_mirror_unicode_digit_trap():
    assert validators.validate("quantity", "１２３")["ok"] is False  # fullwidth digits rejected ([0-9], not \d)
    assert validators.validate("quantity", "03")["ok"] is True      # leading zeros accepted


def test_mirror_password_counts_code_points():
    assert validators.validate("password", "😀Aa!bcd")["ok"] is False   # 7 code points
    assert validators.validate("password", "😀Aa!bcd😀")["ok"] is False  # 8 — still not MORE than 8
    assert validators.validate("password", "😀Aa!bcde😀")["ok"] is True  # 9 code points


def test_mirror_price_and_usage_limit():
    assert validators.validate("price", "12.50")["ok"] is True
    assert validators.validate("price", "12.505")["ok"] is False
    assert validators.validate("usageLimit", "0")["ok"] is False
    assert validators.validate("usageLimit", "03")["ok"] is True   # 3, value-based
    assert validators.validate("usageLimit", "")["ok"] is True     # empty = no limit
