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
