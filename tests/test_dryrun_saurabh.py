"""T00 dry-run micro-task (owner: Saurabh — new append-only test file per board rules).

Proves the full worker cycle (claim→code→commit→push→green test) end to end on a
tiny pure utility: frontend/components/dryrun.js clamp(). Two guards:
1. test_clamp_source_present — the export exists verbatim (passes without node).
2. test_clamp_behavior — runs the node selftest for real; skips loudly, never
   fails, on machines without node (same contract as test_validators_contract.py).
"""
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
DRYRUN = ROOT / "frontend" / "components" / "dryrun.js"
SELFTEST = ROOT / "frontend" / "components" / "dryrun.selftest.mjs"


def test_clamp_source_present():
    src = DRYRUN.read_text(encoding="utf-8")
    assert "export function clamp(n, lo, hi)" in src


def test_clamp_behavior():
    node = shutil.which("node")
    if node is None:
        pytest.skip("node not on PATH — JS selftest can't run (source still checked by the other test)")
    proc = subprocess.run(
        [node, str(SELFTEST)], capture_output=True, text=True, cwd=str(ROOT)
    )
    assert proc.returncode == 0, f"dryrun selftest failed:\n{proc.stdout}\n{proc.stderr}"
