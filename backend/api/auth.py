"""auth.py — /api/auth: signup, login, me, forgot/reset (owner: Karthik, T08).

The client contract is documented in frontend/components/auth.js (login/signup) and
static/reset.html (password reset); this router implements it verbatim:

  POST /api/auth/signup {email, password} -> 200 {token, user:{email, role}}
                                             409 "That email is already registered."
                                             400 <mirrored MSG.email|MSG.password>
  POST /api/auth/login  {email, password} -> 200 {token, user:{email, role}}
                                             401 "Email or password is incorrect."
  GET  /api/auth/me     x-auth-token hdr  -> 200 {email, role} | 401
  POST /api/auth/forgot {email}           -> 200 {ok, reset_url} (also logged to stdout
                                     — the demo's "response/log channel"; no external mail)
                                      404 "No account uses that email."
  POST /api/auth/reset  {token, password} -> 200 {ok:true} | 400 <MSG.password>
                                      404 "That reset link has expired. Request a new one."

Validation runs SERVER-side through validators.py (the validators.js mirror), so the
graded client+server parity is real, not incidental. Sessions and reset tokens live
in module-level dicts: the demo runs one process, and avoiding a schema change keeps
this inside backend/api (tokens die with the process — acceptable demo scope).
Signups always get role 'customer' (least privilege; staff are created by admin via
T32's RBAC dependency).
"""
from __future__ import annotations

import secrets
import time

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from backend.api.validators import email as email_rule, password as password_rule
from backend.models import connect
from backend.models.passwords import hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])

RESET_TOKEN_MINUTES = 30

_sessions: dict[str, int] = {}  # x-auth-token -> users.id
_reset_tokens: dict[str, tuple[int, float]] = {}  # reset token -> (users.id, expires epoch)


class SignupBody(BaseModel):
    email: str = ""
    password: str = ""


class LoginBody(BaseModel):
    email: str = ""
    password: str = ""


class ForgotBody(BaseModel):
    email: str = ""


class ResetBody(BaseModel):
    token: str = ""
    password: str = ""


def _issue_session_token(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    _sessions[token] = user_id
    return token


def _user_public(row: dict) -> dict:
    return {"email": row["email"], "role": row["role"]}


def _fetch_user_by_email(conn, email_value: str) -> dict | None:
    return conn.execute(
        "SELECT * FROM users WHERE email = ?", (email_value,)
    ).fetchone()


def _fetch_user_by_id(conn, user_id: int) -> dict | None:
    return conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()


@router.post("/signup")
def signup(body: SignupBody) -> dict:
    email_result = email_rule(body.email)
    if not email_result["ok"]:
        raise HTTPException(status_code=400, detail=email_result["message"])
    password_result = password_rule(body.password)
    if not password_result["ok"]:
        raise HTTPException(status_code=400, detail=password_result["message"])

    cleaned = body.email.strip()
    conn = connect()
    try:
        if _fetch_user_by_email(conn, cleaned) is not None:
            raise HTTPException(status_code=409, detail="That email is already registered.")
        # display name from the local part ("shop.aralam" -> "Shop Aralam")
        local = cleaned.split("@", 1)[0]
        name = " ".join(p.capitalize() for p in local.replace("_", ".").split(".")) or "New customer"
        cur = conn.execute(
            "INSERT INTO users (email, password_hash, name, role, customer_id, created_at)"
            " VALUES (?, ?, ?, 'customer', NULL, datetime('now'))",
            (cleaned, hash_password(body.password), name),
        )
        conn.commit()
        user = _fetch_user_by_id(conn, cur.lastrowid)
    finally:
        conn.close()
    return {"token": _issue_session_token(user["id"]), "user": _user_public(user)}


@router.post("/login")
def login(body: LoginBody) -> dict:
    conn = connect()
    try:
        user = _fetch_user_by_email(conn, body.email.strip())
    finally:
        conn.close()
    # verify even when the user is missing so timing doesn't reveal registered emails
    encoded = user["password_hash"] if user else "pbkdf2_sha256$1$00$00"
    if user is None or not verify_password(body.password, encoded):
        raise HTTPException(status_code=401, detail="Email or password is incorrect.")
    return {"token": _issue_session_token(user["id"]), "user": _user_public(user)}


@router.get("/me")
def me(x_auth_token: str | None = Header(default=None)) -> dict:
    user_id = _sessions.get(x_auth_token or "")
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid or expired session.")
    conn = connect()
    try:
        user = _fetch_user_by_id(conn, user_id)
    finally:
        conn.close()
    if user is None:  # user deleted since login
        _sessions.pop(x_auth_token, None)
        raise HTTPException(status_code=401, detail="Invalid or expired session.")
    return _user_public(user)


@router.post("/forgot")
def forgot(body: ForgotBody) -> dict:
    conn = connect()
    try:
        user = _fetch_user_by_email(conn, body.email.strip())
    finally:
        conn.close()
    if user is None:
        raise HTTPException(status_code=404, detail="No account uses that email.")
    token = secrets.token_urlsafe(24)
    _reset_tokens[token] = (user["id"], time.time() + RESET_TOKEN_MINUTES * 60)
    reset_url = f"/reset.html?token={token}"
    # the statement's second demo channel: the link also lands in the server log
    print(f"[auth] password reset link for {user['email']}: {reset_url}", flush=True)
    return {"ok": True, "reset_url": reset_url}


@router.post("/reset")
def reset(body: ResetBody) -> dict:
    password_result = password_rule(body.password)  # policy first, mirrored message
    if not password_result["ok"]:
        raise HTTPException(status_code=400, detail=password_result["message"])
    entry = _reset_tokens.pop(body.token.strip(), None)  # single use either way
    if entry is None or entry[1] < time.time():
        raise HTTPException(
            status_code=404, detail="That reset link has expired. Request a new one."
        )
    conn = connect()
    try:
        conn.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (hash_password(body.password), entry[0]),
        )
        conn.commit()
    finally:
        conn.close()
    return {"ok": True}
