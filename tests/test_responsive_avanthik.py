"""T37 — responsive 390px pass (owner: Avanthik).

Pins DESIGN.md's phone laws mechanically so drift fails TEST_CMD:
- the nav folds to a 48px top bar + MENU SHEET (the only sanctioned fold for a
  7-destination nav; bottom nav is capped at 5), never a horizontal scroll row;
- nav touch targets are >= 44px;
- the page never scrolls horizontally;
- phone page margins land inside DESIGN's 16-20px window via a specificity win
  (pages inject their own .cad-page rules after layout.css loads);
- index.html ships the toggle wiring, in the sibling order the CSS needs, and
  the hashchange auto-close.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LAYOUT = ROOT / "frontend" / "styles" / "layout.css"
INDEX = ROOT / "static" / "index.html"


def _phone_block():
    """Body of the (max-width: 720px) fold block, brace-matched."""
    css = LAYOUT.read_text(encoding="utf-8")
    opener = re.search(r"@media\s*\(max-width:\s*720px\)\s*\{", css)
    assert opener, "phone fold media block (max-width: 720px) missing"
    depth = 0
    for i in range(opener.end() - 1, len(css)):
        if css[i] == "{":
            depth += 1
        elif css[i] == "}":
            depth -= 1
            if depth == 0:
                return css[opener.end():i]
    raise AssertionError("unbalanced braces in the phone media block")


def test_phone_nav_is_menu_sheet_not_scroll_row():
    phone = _phone_block()
    assert "#cad-navtoggle:checked ~ .cad-nav" in phone, \
        "sheet must open from the pure-CSS toggle in index.html"
    assert "overflow-x: auto" not in phone, \
        "nav must fold to a sheet, not a horizontal scroll row"
    assert ".cad-menubtn" in phone, "Menu hit area must exist in the fold"
    # the sheet is closed by default and display:flex when checked
    assert re.search(r"\.cad-nav\s*\{[^}]*display:\s*none", phone)
    assert "flex-basis: 100%" in phone, "sheet wraps to its own full-width row"


def test_phone_touch_targets_meet_44px():
    phone = _phone_block()
    assert "min-height: 44px" in phone, "nav items must be >= 44px targets"
    assert "height: 48px" in phone, "Menu button fills the 48px bar"


def test_never_horizontal_page_scroll():
    phone = _phone_block()
    assert re.search(r"body\s*\{[^}]*overflow-x:\s*hidden", phone), \
        "phone block needs the never-scroll guard on body"


def test_phone_page_margins_win_on_specificity():
    phone = _phone_block()
    assert ".cad-main .cad-page" in phone, \
        "override must out-rank pages' injected .cad-page (0-1-0) rules"
    assert "padding: var(--gap)" in phone, \
        "phone margins must use --gap (16px, inside DESIGN's 16-20px)"


def test_index_wires_toggle_and_autoclose():
    html = INDEX.read_text(encoding="utf-8")
    assert 'id="cad-navtoggle"' in html
    assert 'for="cad-navtoggle"' in html, "Menu label must target the checkbox"
    assert 'class="cad-menubtn"' in html
    # the ~ sibling selector only reaches FORWARD: input must precede #nav
    assert html.index('id="cad-navtoggle"') < html.index('id="nav"')
    assert "hashchange" in html, "sheet must auto-close after a nav tap navigates"


def test_layout_css_stays_token_only():
    css = LAYOUT.read_text(encoding="utf-8")
    hexes = re.findall(r"#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|"
                       r"[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![\w-])", css)
    assert not hexes, f"hex literal(s) leaked outside tokens.css: {hexes}"
