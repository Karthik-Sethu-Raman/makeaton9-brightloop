"""passwords.py — stdlib PBKDF2 hashing (owner: Manu, T02).

Storage format: pbkdf2_sha256$<iterations>$<salt hex>$<digest hex>. Seed users
(T02) and the auth API (T08) share this one format so a seeded admin can log in
through the real endpoint. No external crypto dependency.
"""
from __future__ import annotations

import hashlib
import hmac
import secrets

ITERATIONS = 200_000


def hash_password(plain: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", plain.encode("utf-8"), bytes.fromhex(salt), ITERATIONS
    ).hex()
    return f"pbkdf2_sha256${ITERATIONS}${salt}${digest}"


def verify_password(plain: str, encoded: str) -> bool:
    try:
        algo, iters, salt, digest = encoded.split("$")
        if algo != "pbkdf2_sha256":
            return False
        candidate = hashlib.pbkdf2_hmac(
            "sha256", plain.encode("utf-8"), bytes.fromhex(salt), int(iters)
        ).hex()
        return hmac.compare_digest(candidate, digest)
    except (ValueError, TypeError):
        return False
