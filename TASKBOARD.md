# TASKBOARD — single source of truth for what gets built

## Header
- TEST_CMD: `scripts\ci.cmd` (installs deps, runs `python -m pytest -q`)
- RUN_CMD: `scripts\run.cmd` → serves on http://127.0.0.1:8000 (installs deps if missing)
- Stack: `Python FastAPI + SQLite (stdlib sqlite3) + vanilla HTML/CSS/JS (no build step)`
- Task sizing: **5–15 min of agent work each** (cycle kill cap is 19 min). Split anything bigger.
- Currency: ₹ en-IN. App name: **Cadence** (DESIGN.md is law).

<!--
ARCHITECTURE (bootstrap ruling, 08:55 Karthik — 10 lines)
1. backend/api/main.py = FastAPI app factory: JSON under /api, serves static/ at / and
   frontend/ at /frontend (StaticFiles). No build step, no templates, no npm.
2. backend/models = SQLite layer: db.py (connection, WAL, row factory), schema.py (all
   tables + indexes), repo classes per domain, seed fixtures clearly marked SEED.
3. backend/livefeed = simulator daemon thread started at app boot: every few seconds it
   lands payments / advances subscription+invoice state in the DB (dynamic-data must-have).
4. Live data flows DB -> /api/live/* -> frontend poll every 3s (no WebSocket dep).
5. Auth: signup/login returns a token; role (admin/staff/customer) checked in backend/api
   dependencies; frontend stores token in localStorage and sends x-auth-token.
6. static/index.html is the SPA shell; hash router + one JS module per page live in
   frontend/pages; reusable renderers (table, form, pill, chart, KPI strip) in
   frontend/components (native ES modules, <script type="module">).
7. frontend/styles/tokens.css is DESIGN.md's :root verbatim (law); layout.css and
   component CSS build on it. NO hex outside tokens.css.
8. frontend/validation/validators.js = single source for client validation, mirrored
   1:1 by backend/api/validators.py (same rules, same messages).
9. Numbers render with .num (tabular figures), ₹ en-IN; dates IST.
10. Vertical slice first (T01-T04), then feature meat top-down. Owners per DECISIONS D8.
-->

## Ownership map (module → member; agents: stay inside your dirs)
| Member (-Member token) | NOTES file | Owns (directories/files) |
|---|---|---|
| Karthik (leader, integrator) | NOTES/Karthik.md | `backend/api/` + `tests/` + repo-root config (`requirements.txt`, `scripts/ci.cmd`, `scripts/run.cmd`, `.gitignore`, root `README.md`) |
| Manu | NOTES/Manu.md | `backend/models/` `backend/livefeed/` `scripts/` (except ci.cmd/run.cmd) |
| Saurabh | NOTES/Saurabh.md | `frontend/pages/` `frontend/components/` |
| Avanthik | NOTES/Avanthik.md | `frontend/styles/` `frontend/validation/` `static/` |

Shared (editable by all, per CLAUDE.md): TASKBOARD.md, PROGRESS.md, NOTES/*.md, DESIGN.md
(read-only except integrator). `tests/` is append-only per owner: add `test_<topic>.py`,
never edit another member's test file. `backend/__init__.py` + package `__init__.py`s are
shared-neutral: append exports only.

## Status legend
OPEN → CLAIMED @<time> by <member> → DONE | PARTIAL <note> | BLOCKED <reason>
(Integrator re-opens claims stale >45 min.)

## Tasks — value-ordered (top = most demo value). Each 5–15 min.
> Format: `- [ ] **T01** (P1, owner: <m>, ~10m) description` — one line per task, never
> reordered mid-window (integrator edits Pn tags in place / appends GROOM: notes only).
> Every UI task: apply DESIGN.md tokens + check 390px before marking DONE.

- [ ] **T00** (P0, owner: each member, ~5m) dry-run micro-task per member: add one tiny
  utility function + its test in YOUR module. Used ONLY by the 11:15 dry-runs.
- [ ] **T-V1** (P1, owner: Manu, ~15m) **`scripts/make-demo-video.mjs`** — the video
  recorder (spec: VIDEO-SCRIPT.md). If it doesn't exist when the window opens, the FIRST
  worker cycles finish it before any other task: no recorder → no video → wasted day.
  Target: committed by 14:00.

### P1 — walking skeleton + graded must-haves
- [ ] **T01** (P1, owner: Karthik, ~15m) Vertical slice: `backend/api/main.py` app factory,
  `GET /api/health`, static/ + frontend/ mounted, index.html served, CORS off (same-origin);
  `tests/test_health.py` green; RUN_CMD boots end-to-end.
- [ ] **T02** (P1, owner: Manu, ~15m) `backend/models`: db.py (sqlite3 conn, WAL, dict rows),
  schema.py — customers, users, products, product_variants, plans, subscriptions,
  subscription_lines, invoices, invoice_lines, payments, discounts, tax_rules,
  quotation_templates; SEED fixture (marked SEED, incl. brand variant +₹560 example).
- [ ] **T03** (P1, owner: Manu, ~15m) `backend/livefeed`: simulator thread (started in app
  lifespan) mutating DB every ~3s (payment lands, sub state advances) +
  `backend/livefeed/router.py` → `GET /api/live/summary` reading DB (never static JSON).
- [ ] **T04** (P1, owner: Saurabh, ~10m) CLAIMED @09:23 by Saurabh — Overview page: KPI strip (one container, 1px rules)
  + live numbers from `/api/live/summary`, poll 3s, freshness stamp, `.num` tabular.
- [ ] **T05** (P1, owner: Avanthik, ~15m) `frontend/styles/tokens.css` (DESIGN.md :root
  verbatim) + layout.css (sidebar shell 224px, grid, cards) + `static/index.html` shell
  with mark+wordmark; no hex outside tokens.css.
- [ ] **T06** (P1, owner: Saurabh, ~10m) Hash router + sidebar nav for all 7 sections,
  active item = grey pill per DESIGN; works from Overview in one click.
- [ ] **T07** (P1, owner: Avanthik, ~15m) `frontend/validation/validators.js`: email format,
  password policy (>8 chars, upper, lower, special), price/qty ≥ 0, date order; blur-time
  inline errors under fields; wired into the signup form.
- [ ] **T08** (P1, owner: Karthik, ~15m) Auth API: POST /api/auth/signup (unique email +
  full password policy SERVER-side, same messages as client), /login, /me with role;
  `tests/test_auth.py` incl. one invalid-password and one duplicate-email case.
- [ ] **T09** (P1, owner: Manu, ~10m) Dress-rehearse make-demo-video.mjs against the live
  app (scenes 1-7), fix waits/pacing; log rehearsal result in PROGRESS.

### P2 — the feature meat (statement scenes)
Products & plans
- [ ] **T10** (P2, owner: Karthik, ~10m) Products CRUD API: name, type, sales price, cost
  price, notes; server validation (price ≥ 0, name required).
- [ ] **T11** (P2, owner: Manu, ~10m) Product variants: model + attribute price delta
  (seed: brand "Odoo" +₹560); included in plan line pricing.
- [ ] **T12** (P2, owner: Saurabh, ~10m) Products page: table (right-aligned ₹, truncate)
  + create form with client validation + empty/loading/error states.
- [ ] **T13** (P2, owner: Manu, ~10m) Plans model: billing frequency daily/weekly/monthly/
  yearly, min quantity, available from/to, close policy (auto-close on end / early close /
  pause / renew) per plan.
- [ ] **T14** (P2, owner: Karthik, ~10m) Plans CRUD API + validation (from ≤ to, price ≥ 0,
  frequency enum); tests.
- [ ] **T15** (P2, owner: Saurabh, ~10m) Plans page: list + create form incl. close-policy
  control and frequency; states.
Subscriptions
- [ ] **T16** (P2, owner: Manu, ~10m) Subscription model: SUB-0001 numbering sequence,
  states Draft→Quotation→Confirmed→Active→Closed, lines (product, qty, unit price, tax,
  amount) with totals compute.
- [ ] **T17** (P2, owner: Karthik, ~15m) Subscription API: create, list w/ filters
  (state, customer, plan), state-transition endpoint guarding legal moves only.
- [ ] **T18** (P2, owner: Saurabh, ~10m) Subscriptions page: table + status pills + detail
  view (lines, taxes, totals); state badge visible per DESIGN.
- [ ] **T19** (P2, owner: Manu, ~10m) Quotation templates: template with plan/product
  lines valid N days; "new subscription from template" copy action.
Invoicing
- [ ] **T20** (P2, owner: Manu, ~15m) Billing run: generate due invoices from active
  subscriptions — idempotent (never twice, never skipped), taxes auto from tax_rules;
  `tests/test_billing_run.py`.
- [ ] **T21** (P2, owner: Karthik, ~10m) Invoice API: list/detail, confirm/cancel/send/
  print actions, state Draft→Confirmed→Paid guards.
- [ ] **T22** (P2, owner: Saurabh, ~10m) Invoices page: table (paid/outstanding/overdue
  filter) + detail with lines/taxes/totals + actions.
- [ ] **T23** (P2, owner: Karthik, ~10m) Tax rules API (admin-only): rate % scoped by
  product/type; applied automatically at billing.
Discounts
- [ ] **T24** (P2, owner: Saurabh, ~10m) Discounts page (admin-only): rules table + create
  form (fixed/%, min purchase/qty, dates, usage limit, scope).
- [ ] **T25** (P2, owner: Karthik, ~15m) Discount rules API: fixed or percentage, minimum
  purchase/quantity, start/end, usage limit, product or whole-subscription scope;
  admin-only guard + tests.
- [ ] **T26** (P2, owner: Manu, ~10m) Discount engine: auto-apply best eligible rule on
  next invoice, stop on expiry or exhaustion; tests.
Payments & customers
- [ ] **T27** (P2, owner: Karthik, ~10m) Payments API: record (method, amount, date, note)
  against invoice; outstanding balance + overdue flag computed.
- [ ] **T28** (P2, owner: Saurabh, ~10m) Payments page: record form (client+server
  validation) + paid/outstanding/overdue views.
- [ ] **T29** (P2, owner: Manu, ~10m) Customers model+API: list/detail with their
  subscriptions and invoices.
- [ ] **T30** (P2, owner: Saurabh, ~10m) Customers page (internal team view).
- [ ] **T31** (P2, owner: Saurabh, ~10m) Customer portal page: after signup/login shows
  ONLY own subscriptions + invoices (statement's portal scene).
- [ ] **T32** (P2, owner: Karthik, ~10m) RBAC dependency: admin/staff/customer routes;
  only admin can create staff; 401/403 tests.
- [ ] **T33** (P2, owner: Avanthik, ~10m) Forgot-password: token + reset page (link shown
  in UI response/log — no external mail).
Reporting
- [ ] **T34** (P2, owner: Manu, ~10m) Reports API: active subscriptions count, revenue
  collected, still owed, overdue invoice list; date filters.
- [ ] **T35** (P2, owner: Saurabh, ~10m) Finance overview upgrade: KPIs + revenue-over-time
  chart (accent hue only, DESIGN chart rules) + overdue table + "View all".

### P3 — polish & hardening
- [ ] **T36** (P3, owner: Avanthik, ~10m) States audit: empty/loading/error blocks on all
  main pages per DESIGN (frame kept, one sentence, no shimmer).
- [ ] **T37** (P3, owner: Avanthik, ~10m) Responsive 390px pass: sidebar folds to top bar
  + sheet or bottom nav, tables → two-line rows, no horizontal scroll.
- [ ] **T38** (P3, owner: Avanthik, ~10m) Chart polish per DESIGN: 3-5 gridlines, 4-7 y
  ticks, no markers/fill >14%, 4-8 x labels never rotated.
- [ ] **T39** (P3, owner: Manu, ~10m) Perf: seed ~3,000 subscriptions, add indexes, verify
  list/report endpoints < 2s (statement's "under two seconds").
- [ ] **T40** (P3, owner: Karthik, ~10m) Root README: setup, RUN_CMD, TEST_CMD, demo
  script, architecture, stack rationale.
- [ ] **T41** (P3, owner: Avanthik, ~10m) Invoice print CSS (browser print) — the "print
  any invoice" action produces a clean page.
- [ ] **T42** (P3, owner: Karthik, ~10m) API test hardening: billing idempotency, discount
  expiry, RBAC 401/403, validation parity client/server.
- [ ] **T43** (P3, owner: Saurabh, ~10m) Overview polish: deltas with named windows
  ("vs prior 30 days"), billing-day annotation on chart, answer figure 30-36px.

## Claim log (append only)
<!-- e.g. `12:35 Manu claimed T03` -->

## Integrator log
<!-- integrator cycles append: what was fixed/groomed, every cross-module touch, LAST-GOOD SHA in FINAL -->
