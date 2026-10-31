"""Bootstrap contract test: the repo layout this board depends on exists.
Workers replace/extend with real module tests from T01 onward."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def test_module_dirs_exist():
    for d in ["backend/api", "backend/models", "backend/livefeed",
              "frontend/pages", "frontend/components", "frontend/styles",
              "frontend/validation", "static", "scripts", "tests"]:
        assert (ROOT / d).is_dir(), f"missing module dir {d}"


def test_commands_exist():
    assert (ROOT / "scripts" / "ci.cmd").is_file()
    assert (ROOT / "scripts" / "run.cmd").is_file()


def test_design_tokens_are_filled():
    text = (ROOT / "DESIGN.md").read_text(encoding="utf-8")
    assert "__PICK__" not in text, "DESIGN.md tokens still unfilled"
    assert "--accent:#b45309" in text


def test_requirements_parse():
    reqs = (ROOT / "requirements.txt").read_text(encoding="utf-8").splitlines()
    names = {r.split(">=")[0].strip() for r in reqs if r.strip()}
    assert {"fastapi", "uvicorn", "pytest", "httpx"} <= names
