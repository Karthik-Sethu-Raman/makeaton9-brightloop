"""validators.py — server mirror of frontend/validation/validators.js (owner: Karthik, T08).

GRADED MUST-HAVE: client AND server validate with the SAME messages. The MSG table
below is copied byte-for-byte from validators.js — change one side, change both
(tests/test_validators_contract.py pins the strings, tests/test_auth.py pins the
mirror behaviour). Conventions (the documented mirror traps):
  1. regexes use [0-9], never \\d — Python's \\d accepts Unicode digits, JS's does not;
  2. password length is CODE POINTS (Python len() on str already is);
  3. whole-number rules ACCEPT leading zeros ('03' = 3); thresholds are value-based.

Rules are pure: (value[, extra]) -> {"ok": bool, "message": str} — the exact shape
the client's validate() returns, so parity is assertable. Routers return the message
as FastAPI's `detail` on 400, which the client renders inline under the field.
"""
from __future__ import annotations

import re
from datetime import date

MSG = {
    "emailEmpty": "Enter an email address.",
    "emailBad": "Enter a valid email address.",
    "password": "Password must be more than 8 characters and include an uppercase letter, a lowercase letter and a special character.",
    "priceEmpty": "Enter a price.",
    "priceBad": "Price must be ₹0 or more, with up to 2 decimals.",
    "qtyEmpty": "Enter a quantity.",
    "qtyBad": "Quantity must be a whole number of 0 or more.",
    "dateOrder": "The end date must be on or after the start date.",
    "usageLimit": "Usage limit must be a whole number of 1 or more.",
}

_EMAIL_RE = re.compile(r"[^\s@]+@[^\s@]+\.[^\s@]+")
_PRICE_RE = re.compile(r"[0-9]+(\.[0-9]{1,2})?")
_WHOLE_RE = re.compile(r"[0-9]+")


def _res(ok: bool, message: str) -> dict:
    return {"ok": ok, "message": "" if ok else message}


def email(value) -> dict:
    v = str(value or "").strip()
    if not v:
        return _res(False, MSG["emailEmpty"])
    return _res(bool(_EMAIL_RE.fullmatch(v)), MSG["emailBad"])


def password(value) -> dict:
    # Statement's exact policy: MORE than 8 chars (9+), upper, lower, special
    # ("special" = anything non-alphanumeric). One message for the whole policy.
    v = str(value or "")
    ok = (
        len(v) > 8
        and re.search(r"[A-Z]", v) is not None
        and re.search(r"[a-z]", v) is not None
        and re.search(r"[^A-Za-z0-9]", v) is not None
    )
    return _res(ok, MSG["password"])


def price(value) -> dict:
    v = str(value or "").strip()
    if not v:
        return _res(False, MSG["priceEmpty"])
    return _res(bool(_PRICE_RE.fullmatch(v)), MSG["priceBad"])


def quantity(value) -> dict:
    v = str(value or "").strip()
    if not v:
        return _res(False, MSG["qtyEmpty"])
    return _res(bool(_WHOLE_RE.fullmatch(v)), MSG["qtyBad"])


def usage_limit(value) -> dict:
    v = str(value or "").strip()
    if not v:
        return _res(True, "")  # empty = no limit
    ok = bool(_WHOLE_RE.fullmatch(v)) and int(v) >= 1  # leading zeros fine
    return _res(ok, MSG["usageLimit"])


def date_order(from_value, to_value) -> dict:
    # ISO YYYY-MM-DD pair from <input type="date">. Either side empty = ok
    # (requiredness is a different rule). Garbage on either side fails.
    f = str(from_value or "").strip()
    t = str(to_value or "").strip()
    if not f or not t:
        return _res(True, "")
    try:
        return _res(date.fromisoformat(f) <= date.fromisoformat(t), MSG["dateOrder"])
    except ValueError:
        return _res(False, MSG["dateOrder"])


RULES = {
    "email": email,
    "password": password,
    "price": price,
    "quantity": quantity,
    "usageLimit": usage_limit,
}


def validate(rule_name: str, value, extra=None) -> dict:
    """Mirror of the client dispatcher. dateOrder takes (from, to) as value/extra."""
    if rule_name == "dateOrder":
        return date_order(value, extra)
    rule = RULES.get(rule_name)
    if rule is None:
        raise ValueError(f'validators: unknown rule "{rule_name}"')
    return rule(value)
