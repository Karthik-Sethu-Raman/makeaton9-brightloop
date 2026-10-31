"""T07 client-validator contract (owner: Avanthik — append-only test file per board rules).

Two guards for the graded must-have "client AND server validate with the SAME messages":
1. test_validator_messages_pinned — the canonical MSG strings exist verbatim in
   frontend/validation/validators.js, so editing one without updating the server mirror
   (backend/api/validators.py, T08) fails HERE first.
2. test_pure_rules_behavior — executes the pure rules for real via node
   (frontend/validation/selftest.mjs: email/password/price/quantity/usageLimit/dateOrder
   incl. the mirror traps). Skips loudly, never fails, on machines without node.
"""
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
VJS = ROOT / "frontend" / "validation" / "validators.js"
SELFTEST = ROOT / "frontend" / "validation" / "selftest.mjs"

# Mirrors validators.js MSG byte-for-byte — including the ₹ in the price sentence.
MSG = {
    "emailEmpty": "Enter an email address.",
    "emailBad": "Enter a valid email address.",
    "password": "Password must be more than 8 characters and include an uppercase letter, a lowercase letter and a special character.",
    "priceEmpty": "Enter a price.",
    "priceBad": "Price must be ₹0 or more, with up to 2 decimals.",
    "qtyEmpty": "Enter a quantity.",
    "qtyBad": "Quantity must be a whole number of 0 or more.",
    "minQtyEmpty": "Enter a minimum quantity.",  # T36 pass 2 — pinned here in the T52 cycle
    "minQtyBad": "Minimum quantity must be a whole number of 1 or more.",
    "amtEmpty": "Enter an amount.",  # T52 — payments rule (T27 API + T28 page)
    "amtBad": "Amount must be ₹0 or more, with up to 2 decimals.",
    "amtMax": "Amount must be no more than the outstanding balance.",
    "dateOrder": "The end date must be on or after the start date.",
    "usageLimit": "Usage limit must be a whole number of 1 or more.",
    "pctEmpty": "Enter a percentage.",  # T24 — discounts (T25 API + discounts page)
    "pctBad": "Percentage must be no more than 100, with up to 2 decimals.",
}


def test_validator_messages_pinned():
    src = VJS.read_text(encoding="utf-8")
    for key, sentence in MSG.items():
        assert f"{key}: '{sentence}'" in src, f"client message {key} drifted — update BOTH sides"


def test_required_rule_template_pinned():
    """T50: required(label) builds 'Enter <label>.' — the template is pinned here so
    the server mirror (backend/api/validators.py, Karthik) cannot drift from it, and
    the shipped example sentence 'a product name' -> 'Enter a product name.' (the copy
    products.js hand-rolled) is pinned in the behavioral selftest."""
    assert "Enter ${label}." in VJS.read_text(encoding="utf-8"), "required() template drifted — update BOTH sides"
    assert "Enter a product name." in SELFTEST.read_text(encoding="utf-8"), "example sentence missing from selftest"


def test_pure_rules_behavior():
    node = shutil.which("node")
    if node is None:
        pytest.skip("node not on PATH — JS selftest can't run (messages still pinned by the other test)")
    proc = subprocess.run(
        [node, str(SELFTEST)], capture_output=True, text=True, cwd=str(ROOT)
    )
    assert proc.returncode == 0, f"selftest failed:\n{proc.stdout}\n{proc.stderr}"
