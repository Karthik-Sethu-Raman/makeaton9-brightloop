# Cadence: recurring billing and subscription management

Cadence keeps subscription billing on a heartbeat: products and plans, subscriptions on a
daily/weekly/monthly/yearly cadence, automatic billing runs, invoices with taxes and
discounts, payments, and a live finance overview whose numbers move in real time.

**Stack:** Python FastAPI + SQLite (stdlib `sqlite3`) + vanilla HTML/CSS/JS ES modules.
No build step, no npm for the app itself. Clone, install, run.

## Setup

```bat
python -m pip install -r requirements.txt
```

(Python 3.10+; everything runs offline after install. No external APIs.)

## Run

```bat
scripts\run.cmd
```

Serves on **http://127.0.0.1:8000**: the SPA shell at `/`, the password-reset page at
`/reset.html`, and the JSON API under `/api` (e.g. `GET /api/health`). First boot creates
and seeds `data/cadence.db` automatically (fixture rows are marked SEED in
`backend/models/seed.py`).

## Demo in 60 seconds

Exact commands from a clean clone to the running app (Windows). First boot creates
**and seeds** the SQLite DB automatically, so there is no separate seed step:

```bat
git clone https://github.com/Karthik-Sethu-Raman/makeaton9-brightloop
cd makeaton9-brightloop
python -m pip install -r requirements.txt
scripts\run.cmd
```

Open **http://127.0.0.1:8000**. The Overview KPIs and revenue chart move by themselves:
a simulator thread bills due subscriptions and lands payments every few seconds.
Sign in from the sidebar as `admin@brightloop.test` / `Admin@12345`, then walk:

Overview (live KPIs, revenue chart, overdue list) -> Products & plans (create one;
validation messages are byte-identical client- and server-side) -> Invoices (confirm a
draft; illegal moves get spoken-sentence 409s shown verbatim) -> Payments (record a
payment against an outstanding invoice) -> back to Overview: the numbers you caused
are already there.

## Test

```bat
scripts\ci.cmd
```

Installs deps if missing, then runs `python -m pytest -q` (194 tests).

## Seeded demo accounts

| Role | Email | Password |
|---|---|---|
| admin | admin@brightloop.test | Admin@12345 |
| staff | staff@brightloop.test | Staff@12345 |
| customer | shop@aralamstores.test | Shop@12345 |

(Auth: `POST /api/auth/signup` / `/login` / `/me`, plus forgot/reset via `/reset.html`.
Reset links are also printed to the server log so a demo never needs email.)

## What's live

- **Live finance overview**: KPIs poll `/api/live/summary` every 3s; a simulator
  thread bills due subscriptions and lands payments, so numbers move on their own.
  A daily-revenue chart and overdue-invoice list (from `/api/reports/finance`)
  refresh every 20s and keep the last good view on error.
- **Auth**: signup / login / password reset, roles (admin, staff, customer), and
  client AND server validation with identical messages (pinned by tests).
- **Products & plans**: full CRUD pages backed by `/api/products` and `/api/plans`;
  product variants (e.g. brand +Rs.560) feed subscription line pricing.
- **Invoices**: list and detail plus confirm / cancel / send with legal-move guards
  (`/api/invoices`). The page shows lines, taxes, totals, payments and the server's
  overdue verdict, with 409 sentences shown verbatim.
- **Payments**: record payments against invoices (`/api/payments`); outstanding
  balance and the overdue verdict are computed server-side, and the amount is
  validated client- and server-side with identical messages (a Rs.0 payment is
  rejected with the same sentence on both sides).
- **Subscriptions / discounts / customers**: the pages ship UI-complete (filters,
  detail views, create forms with full validation). Their list APIs were cut at the
  endgame triage, so each shows its designed error + Retry state. The customer
  portal (#/portal) was cut at the feature freeze; demo with the admin/staff
  accounts above.

## Architecture (one breath)

`backend/api/main.py` is the FastAPI app factory: JSON under `/api`, the `frontend/` ES
modules at `/frontend`, and the `static/` SPA shell at `/`. SQLite lives behind
`backend/models` (WAL, dict rows). A simulator thread (`backend/livefeed`, started in the
app lifespan) mutates the DB every ~3s so every live number is real changing state; the UI
polls `/api/live/*`. Validation rules live in ONE client module (`frontend/validation/
validators.js`) mirrored 1:1 by ONE server module so both sides always agree. Styling is
the DESIGN.md token set as CSS variables, with no raw hex outside `tokens.css`.

## Design

`DESIGN.md` is the design system: identity, color and type tokens, component rules,
and the chart/table/form conventions every screen follows.

## Team

Built by Karthik Sethuraman, Manukrishna J P, Saurabh Krishnan, and Avanthik C.
