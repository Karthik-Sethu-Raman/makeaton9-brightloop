# NOTES — Karthik (leader/integrator) — Q&A prep

> Agent appends here every cycle. In the evening YOU read this + `git log --author="<your-email>" --stat`
> and make sure you can explain every line committed under your name — the evaluator's
> Q&A round generates questions from YOUR commits matched to your GitHub account.

## <time> — T<id> <title>
- Built: <files>
- Why this way: <1-2 lines>
- Must be able to explain: <the tricky bit to study>

## Bootstrap cycle (08:53-09:04, Karthik) — what you must be able to explain
- **What I built:** read STATEMENT.md, then filled the coordination layer the other 3
  agents work from: TASKBOARD.md (45 tasks, 5-15 min each, P1 = walking slice + graded
  must-haves + video recorder T-V1; P2 = statement scenes; P3 = polish), DESIGN.md
  (tokens, app identity), scripts/ci.cmd (TEST_CMD) + scripts/run.cmd (RUN_CMD),
  requirements.txt, module scaffold (backend/api, backend/models, backend/livefeed,
  frontend/pages|components|styles|validation, static/, tests/) with a one-paragraph
  README each, and tests/test_bootstrap.py (layout contract, 4 tests, green).
- **App name "Cadence":** from the statement's own words — plans bill on a cadence
  (daily/weekly/monthly/yearly); the product keeps that heartbeat on time.
- **Accent #b45309 (coin copper):** chosen from the problem's world (invoices, bank
  statements, coins), NOT default blue/violet (banned by DESIGN.md). Fira Sans for its
  tabular figures on data; local font stack so the demo never needs the network.
- **Architecture in one breath:** FastAPI serves JSON at /api and the frontend as static
  files (no build step); SQLite via stdlib sqlite3 behind repo classes; a simulator
  thread mutates the DB every ~3s so every live number is real changing state (the
  graded "dynamic data"); the UI polls /api/live/* every 3s (polling, not WebSocket —
  one less dependency, same effect); validation rules live in ONE client module mirrored
  1:1 by ONE server module so both sides always agree.
- **Key design choice:** vertical slice first (T01-T04: boot, DB, livefeed, one page)
  before any feature meat — an app that boots and shows live data beats ten half-features.

## 10:48 — T01 vertical slice (integrator cycle)
- **Built:** `backend/api/main.py` (create_app + module-level `app`, GET /api/health,
  mounts, lifespan) and `tests/test_health.py` (6 tests).
- **Why this way:** the SPA (T05/T06) and every page were DONE-but-waiting on a server;
  this one file closes the boot seam for the whole team — Saurabh's pages, Avanthik's
  reset.html and Manu's T03 livefeed all light up the moment their module lands, no
  rewiring needed (find_spec guards detect them at boot).
- **Must be able to explain:**
  - Mount ORDER: `/frontend` is mounted before `/` because Starlette matches routes in
    registration order and the `/` mount would otherwise swallow everything.
  - Why find_spec instead of try/ImportError for the T03 seam: a *broken* simulator must
    crash loudly, only an *absent* one may be skipped.
  - Why no CORSMiddleware: SPA is same-origin (served by the same FastAPI app), so
    cross-origin headers are unnecessary — smaller attack surface, one less thing to demo.
  - Lifespan (not import time) does ensure_db + seed_if_empty: importing the module (e.g.
    pytest collecting another test) must never touch the DB; only a running app does.
  - Tests point CADENCE_DB at a tmp dir so they never write the real data/cadence.db.

## 11:35 — T08 auth API (integrator cycle)
- **Built:** `backend/api/validators.py` (server mirror of validators.js — every rule, every
  message byte-for-byte), `backend/api/auth.py` (signup / login / me / forgot / reset), router
  wiring in `backend/api/main.py`, `tests/test_auth.py` (19 tests). TEST_CMD 48/48.
- **Why this way:** login (T46) and reset (T33) screens were DONE-but-waiting on endpoints —
  this module lights up both at once, and the graded "client AND server validation with the
  same messages" must-have is now mechanically enforced: one MSG table serves both sides and
  CI pins the strings (test_validators_contract.py + test_auth.py).
- **Must be able to explain (Q&A):**
  - Sessions live in in-memory dicts (token → user id) DELIBERATELY: no schema change
    (D6 is Manu's call), demo runs one process; cost = tokens die on restart. Acceptable.
  - Signup always creates role 'customer' — least privilege; staff creation is T32's RBAC.
  - Login runs a dummy PBKDF2 verify even on unknown emails so response time doesn't reveal
    which emails exist; one 401 message for wrong-password AND no-such-user.
  - Reset tokens: single-use, 30 minutes; a weak-password attempt is rejected BEFORE the
    token is consumed (a typo shouldn't burn the link); the link is printed to the server
    console — the statement's log/response channel (no external mail in the demo).
  - Mirror traps (why the Python looks deliberate): `[0-9]` never `\d` (Python's `\d` accepts
    Unicode digits like '１２３', JS's doesn't); password length in CODE POINTS so emoji
    passwords count identically on both sides; leading zeros accepted ('03' = 3).
  - `include_router(auth)` sits BEFORE `app.mount("/")` — Starlette matches routes in
    registration order; the /-mount would otherwise swallow /api/auth.
  - ci.cmd now uses `--basetemp %TEMP%\cadence-pytest-%RANDOM%`: pytest's default relinks a
    shared `pytest-current` symlink another run can hold (WinError 5 on Avanthik's machine
    AFTER a green suite — a false RED, the worst kind; suite was fine, the temp dir wasn't).
