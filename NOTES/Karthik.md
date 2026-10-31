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

## 13:05 — T14 plans API + validator mirrors (integrator cycle)

- **Built:** `backend/api/plans.py` (GET newest-first / POST / PATCH / DELETE with a
  409 while a subscription or template still references the plan), the py mirrors for
  Avanthik's T36/T50/T52 handoffs in `backend/api/validators.py` (minQuantity,
  required(label), amount, paymentAmount(outstanding)), one line in plans.js (minQty
  rule 'quantity' → 'minQuantity'), `tests/test_plans.py` (37 cases).
- **Why this way:** T15's plans page was DONE-but-error-state since 11:08 — every
  Karthik-owned API task lights an already-built page, the highest demo value per
  minute left in the window.
- **Key design choice (the one to explain):** the browser sends JSON NUMBERS while
  the shared rules were written for field STRINGS. For minQuantity, numeric 0 must
  land on "Minimum quantity must be a whole number of 1 or more." — not the empty
  message — so the py mirror uses `value is None` (JS `value ?? ''`) instead of the
  older `value or ""` idiom, under which int 0 collapses to "" and diverges from the
  client on exactly the case the rule exists for. PATCH re-checks dateOrder against
  the STORED other side of the window so a one-sided edit can't create from > to.
- **Q&A proof of the graded "client AND server validation":** tests assert the exact
  sentence on both sides — show `tests/test_plans.py` MSG_ constants next to
  plans.js checkName / validators.js MSG.

## Catch-up (notes for T08/T10 were missing from this file — added 13:05)

- **T08 auth API (DONE 11:35):** `backend/api/auth.py` — signup/login/me, PBKDF2
  (stdlib), one login message (no user enumeration), reset tokens single-use 30-min,
  reset URL also printed to the server log (the demo's second channel).
  `validators.py` IS the validators.js mirror — same rules, same sentences.
- **T10 products API (DONE 12:26):** `backend/api/products.py` — CRUD, DELETE 409s
  while subscription/template lines reference the product (FK guard turned into an
  explainable demo moment), name message verbatim from products.js.
