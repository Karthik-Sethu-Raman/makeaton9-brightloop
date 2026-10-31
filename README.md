# Cadence — recurring billing & subscriptions (Make-A-Ton 9.0)

Cadence keeps subscription billing on a heartbeat: products and plans, subscriptions on a
daily/weekly/monthly/yearly cadence, automatic billing runs, invoices with taxes and
discounts, payments, and a live finance overview whose numbers move in real time.

**Stack:** Python FastAPI + SQLite (stdlib `sqlite3`) + vanilla HTML/CSS/JS ES modules.
No build step, no npm for the app itself — clone, install, run.

## Setup

```bat
python -m pip install -r requirements.txt
```

(Python 3.10+; everything runs offline after install — no external APIs.)

## Run

```bat
scripts\run.cmd
```

Serves on **http://127.0.0.1:8000** — the SPA shell at `/`, reset page at `/reset.html`,
JSON API under `/api` (e.g. `GET /api/health`). First boot creates and seeds
`data/cadence.db` automatically (fixture rows are marked SEED in `backend/models/seed.py`).

## Test

```bat
scripts\ci.cmd
```

Installs deps if missing, then runs `python -m pytest -q`.

## Seeded demo accounts

| Role | Email | Password |
|---|---|---|
| admin | admin@brightloop.test | Admin@12345 |
| staff | staff@brightloop.test | Staff@12345 |
| customer | shop@aralamstores.test | Shop@12345 |

(Auth endpoints land with T08; the accounts are in the seed data already.)

## Architecture (one breath)

`backend/api/main.py` is the FastAPI app factory: JSON under `/api`, the `frontend/` ES
modules at `/frontend`, and the `static/` SPA shell at `/`. SQLite lives behind
`backend/models` (WAL, dict rows); a simulator thread (`backend/livefeed`, started in the
app lifespan) mutates the DB every ~3s so every live number is real changing state; the UI
polls `/api/live/*`. Validation rules live in ONE client module (`frontend/validation/
validators.js`) mirrored 1:1 by ONE server module so both sides always agree. Styling is
DESIGN.md tokens as CSS variables — no raw hex outside `tokens.css`.
