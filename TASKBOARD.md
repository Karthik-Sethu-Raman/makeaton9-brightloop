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
  [Saurabh: DONE @11:15 — frontend/components/dryrun.js clamp() + dryrun.selftest.mjs +
  tests/test_dryrun_saurabh.py; node selftest 8/8, TEST_CMD 29/29]
- [x] **T-V1** (P1, owner: Manu, ~15m) DONE @10:07 by Manu — **`scripts/make-demo-video.mjs`** video
  recorder (spec: VIDEO-SCRIPT.md): 7 captioned scenes (captions injected INTO the page,
  styled only with DESIGN tokens), explicit waits on data counters (no sleeps on live data),
  auto-boots/kills uvicorn, best-effort scene skips + `--only` filter for rehearsal;
  playwright+chromium installed in scripts/ (dev-only, node_modules ignored);
  chromium launch + recordVideo→webm flush probed OK on Manu's laptop.
  Full app rehearsal = T09 once T01/T03 land.

### P1 — walking skeleton + graded must-haves
- [x] **T01** (P1, owner: Karthik, ~15m) DONE @10:48 by Karthik (integrator cycle) — Vertical slice:
  `backend/api/main.py` create_app() + `backend.api.main:app`; GET /api/health (DB ping);
  frontend/ mounted at /frontend BEFORE static/ at / (html=True → index.html at /,
  reset.html at /reset.html); CORS off (no middleware, asserted in test). Lifespan:
  ensure_db + seed_if_empty (Manu's T02 exports) + guarded T03 seam — imports
  start()/stop() from backend/livefeed/simulator.py and includes backend/livefeed/router.py
  when they exist (find_spec-guarded so "not landed" ≠ "broken"). tests/test_health.py
  (6 tests: health, shell@/, reset.html, 6 frontend module URLs, CORS-off, seed-on-boot
  via tmp CADENCE_DB). TEST_CMD 18/18; real uvicorn boot verified (health 200, all SPA
  assets 200, /api/live/summary 404 until T03 — expected).
- [x] **T02** (P1, owner: Manu, ~15m) DONE @10:37 by Manu — `backend/models`: db.py (sqlite3 conn, WAL, dict rows),
  schema.py — customers, users, products, product_variants, plans, subscriptions,
  subscription_lines, invoices, invoice_lines, payments, discounts, tax_rules,
  quotation_templates; SEED fixture (marked SEED, incl. brand variant +₹560 example).
  db.py (CADENCE_DB override) + schema.py (14 tables, CHECK enums, 8 indexes,
  idempotent) + passwords.py (PBKDF2 stdlib) + seed.py (dated-rel-to-boot demo set:
  paid/overdue/outstanding/draft invoices, all sub states, RBAC users, expired
  discount) + __init__ exports ensure_db/seed_if_empty for T01/T03. Cycle-2 fix:
  discounts INSERT had 11 placeholders for 12 cols (never ran), INV-0003 GST
  corrected to 2525.58. tests/test_models.py + test_seed.py; TEST_CMD 12/12.
- [x] **T03** (P1, owner: Manu, ~15m) DONE @11:12 by Manu — `backend/livefeed`: simulator thread (started in app
  lifespan) mutating DB every ~3s (payment lands, sub state advances) +
  `backend/livefeed/router.py` → `GET /api/live/summary` reading DB (never static JSON).
  GROOM(integrator 10:40): T01's lifespan now imports `start()`/`stop()` from
  `backend/livefeed/simulator.py` — put the thread there (export those two names) and the
  boot wiring is already done; main.py skips silently until the module exists.
  DONE detail: simulator.py tick = bill ONE due active sub (idempotent: next_billing_date
  pushed a full period the moment the invoice exists) + land ONE payment slice (30% /
  min ₹500, oldest-due outstanding first, flips invoice paid at ≤1 paisa) + every 2nd
  tick advance a sub one legal state; when nothing due & nothing owed, a billing day is
  pulled to today — feed never goes quiet. Thread waits FIRST full interval (short-lived
  boots mutate nothing; CADENCE_TICK_SECONDS tunes it). summary() = T04's polled
  contract (+ recent activity list). tests/test_livefeed.py 8 tests; TEST_CMD 27/27;
  in-process boot smoke: KPIs moved in 3s (revenue 15518.86→18822.96, overdue 1→0).
  Code landed by killed 10:56 cycle (e12b29f/d5c9a3f); this cycle verified + closed.
- [x] **T04** (P1, owner: Saurabh, ~10m) DONE @09:28 by Saurabh — Overview page: KPI strip (one container, 1px rules)
  + live numbers from `/api/live/summary`, poll 3s, freshness stamp, `.num` tabular.
  Code complete in frontend/pages/overview.js + components (fmt/kpi/poll). Renders live
  once T03 (`/api/live/summary`) + T05 (index.html shell + tokens.css) land; error state
  until then. Contract read: `{updated_at, kpis:{active_subscriptions, revenue_collected,
  outstanding, overdue_invoices}}` (fields also accepted top-level). Page-module API:
  `export render(mount) -> cleanup()`.
- [x] **T05** (P1, owner: Avanthik, ~15m) DONE @09:37 by Avanthik — `frontend/styles/tokens.css`
  (DESIGN.md :root copied verbatim, byte-for-byte incl. comments) + layout.css (224px sidebar
  shell on page ground, grey active pill via --active, .cad-cardrow/.cad-card shared-bottom-edge
  cards, 390px fold to 48px top bar; var(--...) only, zero color literals) + `static/index.html`
  shell with SVG copper-ring mark + Cadence wordmark + scope, empty #nav slot for T06 router,
  #view mount. Grid sums commented per DESIGN. TEST_CMD green (4 passed).
- [x] **T06** (P1, owner: Saurabh, ~10m) DONE @10:04 by Saurabh — Hash router + sidebar nav for all 7 sections,
  active item = grey pill per DESIGN; works from Overview in one click.
  `frontend/pages/router.js`: fills #nav (7 sections), lazy `import()` per route, mounts
  `render(mount)->cleanup()` into #view, runs prev cleanup() on swap (stops overview poller),
  default `#/overview`, `aria-current`+`.is-active` grey pill. Unbuilt screens (products/
  invoices/payments/discounts/customers/subscriptions) show DESIGN empty-state placeholder;
  they light up automatically as those page modules land. ✅ BOOT SEAM closed @10:26 by
  Avanthik: index.html loads router.js before </body>; boot import graph (11 URLs — styles,
  router, overview/products pages, components, validators) verified 200 over HTTP.
- [x] **T07** (P1, owner: Avanthik, ~15m) DONE @11:15 by Avanthik — validators.js + form CSS (all rules: email,
  password >8/upper/lower/special, price/qty ≥0, dateOrder, usageLimit; blur inline errors under fields,
  form-level render+focus-first-error, a11y aria wiring). PARTIAL closed: (a) signup wiring landed via T46
  (login.js:18/160-161/191-197 — attachBlurError + validateForm, gate on `.ok`); (b) server mirror is T08's own
  line (Karthik); contract + traps in frontend/validation/README.md. NEW: frontend/validation/selftest.mjs (all
  pure-rule behaviors incl. mirror traps, runs under plain node) + tests/test_validators_contract.py (runs the
  selftest inside TEST_CMD — node-missing = loud skip; pins all 9 MSG strings verbatim so drift fails CI before
  T08 lands). TEST_CMD 27/27.
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
- [x] **T12** (P2, owner: Saurabh, ~10m) DONE @10:24 by Saurabh — Products page: table (right-aligned ₹, truncate)
  + create form with client validation + empty/loading/error states.
  Built frontend/pages/products.js + shared frontend/components/table.js (DESIGN table
  rules + 640px two-line fold). Reads GET /api/products (DB, dynamic), POST to create;
  name/price client-validated via validators.js (server mirrors T10). All 4 states ship;
  renders live once T10 (/api/products) lands, error+Retry until then. node --check OK,
  TEST_CMD 8/8.
- [ ] **T13** (P2, owner: Manu, ~10m) Plans model: billing frequency daily/weekly/monthly/
  yearly, min quantity, available from/to, close policy (auto-close on end / early close /
  pause / renew) per plan.
- [ ] **T14** (P2, owner: Karthik, ~10m) Plans CRUD API + validation (from ≤ to, price ≥ 0,
  frequency enum); tests.
- [x] **T15** (P2, owner: Saurabh, ~10m) DONE @11:08 by Saurabh — Plans page: list + create form incl. close-policy
  control and frequency; states.
  Built `frontend/pages/plans.js`: shared table (name/billing/price ₹ right/min qty/
  availability window/at-term-end) reading GET /api/plans (DB-dynamic, Karthik T14),
  POST to create. Create form: name (required), billing frequency + close-policy selects
  (schema enums), price (price rule), min qty (quantity rule — server enforces ≥1),
  available from/to (date, dateOrder end≥start). All four states; blur + submit-gate +
  focus-first-error via validators.js. Plans is an AUX route (#/plans) under the one
  "Products & plans" section — NO 8th sidebar row; router.js ACTIVE_FOR keeps the
  Products pill lit; cross-linked both ways in the page headers. Renders live once T14
  (/api/plans) lands, error+Retry until then (products/overview precedent). node --check
  OK; served 200, /api/plans 404 (pre-T14) verified; TEST_CMD 24/24.
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
- [x] **T33** (P2, owner: Avanthik, ~10m) DONE @10:34 by Avanthik — `static/reset.html`: standalone reset page (no
  sidebar per DESIGN ≤5-destination rule), dual-mode by ?token= (request link → set password), validators.js wired
  (email + password rules, blur + submit gate + focus-first-error), all 4 DESIGN states, status-matched errors,
  Retry only on transient failures, pre-paint mode toggle, reset link DOM-built with contract-shape check.
  API contract for forgot/reset endpoints documented in-file for T08 (Karthik) incl. the task line's server-side
  log channel. Renders live once T08 lands (T04 precedent: page DONE against contract, dependency pending).
  Phone: 16px margins + 44px target in layout.css media block. TEST_CMD 8/8.
  in UI response/log — no external mail).
Reporting
- [ ] **T34** (P2, owner: Manu, ~10m) Reports API: active subscriptions count, revenue
  collected, still owed, overdue invoice list; date filters.
- [ ] **T35** (P2, owner: Saurabh, ~10m) Finance overview upgrade: KPIs + revenue-over-time
  chart (accent hue only, DESIGN chart rules) + overdue table + "View all".
- [x] **T46** (P1, owner: Saurabh, ~10m) DONE @10:48 by Saurabh — Login+signup screen (auth UI seam T31/T33 assume):
  Built `frontend/pages/login.js` (#/login route, Sign in ⇄ Create account via
  ?mode=signup; email+password+confirm, validators.js blur+submit gate, focus-first-error,
  401/409/400 in-card error + Retry only on network/5xx) + `frontend/components/auth.js`
  (localStorage session: getToken/setSession/clearSession/authHeaders x-auth-token/
  landingHashFor/readAuthBody — tolerant of token|access_token & nested role/email).
  Router (my T06): aux routes login+portal (not in sidebar), auth-mode hides sidebar for
  the standalone card, sidebar user line = email + Log out (or Sign in when signed out),
  role redirect admin/staff→#/overview customer→#/portal, "Forgot password?"→/reset.html.
  AUTH CONTRACT for T08 documented in-file (components/auth.js). Renders live once T08
  lands (overview/products/reset precedent). node --check OK, TEST_CMD 12/12.
  RULING: did NOT hard-gate the app behind login this cycle (would break the live
  overview/products demo since T08 isn't built) — sidebar shows Sign in; gating can flip
  on once T08 is green. Logged in PROGRESS.
  #/login route + form (email, password, confirm on signup) wired to validators.js
  (attachBlurError/validateForm — T07 API), POST /api/auth/signup + /login (T08), token →
  localStorage, role redirect (admin/staff → #/overview, customer → #/portal), sidebar
  logout + current-user line; 401 error state. Links to /reset.html per T33 contract.
  GROOM(integrator 10:40): new task — auth UI had no owner; graded must-have
  (validation client AND server on the main input flow) needs this screen to exist.

### P3 — polish & hardening
- [ ] **T36** (P3, owner: Avanthik, ~10m) PARTIAL @11:18 by Avanthik (pass 1 of 2: overview/products/login/plans;
  pass 2 after remaining pages land) — States audit: empty/loading/error blocks on all. SHARED FIXES DONE
  (Avanthik modules): .cad-stateblock(+--err) + .cad-dash (grey dash, --faint 4.76:1) in layout.css; 44px
  Retry hit-area on phones (.cad-linkbtn padding+negative-margin); reset.html Retry now re-submits in place
  (form.requestSubmit) instead of reloading. PAGE-SIDE FINDINGS FOR SAURABH (17-finding audit, top 6):
  (1) SHOULD: dash not grey anywhere — fmt.js DASH renders in --text; wire <span class="cad-dash"> in
  table.js fillCell + kpi.js value when DASH (class now exists in layout.css); (2) SHOULD: products.js failed
  refresh w/ last-good rows is fully silent, no last-good time stored — capture lastGoodAt, show in-block
  sentence + Retry per DESIGN; (3) SHOULD: table.js:54 null renders '' not dash; (4) poll.js fetch has no
  timeout/abort — hung first request traps loading forever, Retry no-ops (AbortController ~2× interval);
  (5) NIT: overview.js parses zoneless IST 'YYYY-MM-DD HH:MM:SS' as browser-local — append '+05:30' (Manu:
  ISO-8601 w/ offset from simulator._now would fix at source); (6) NIT: kpi skeleton bars ~half real size.
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
- [x] **T44** (P2, owner: Avanthik, ~10m) DONE @10:51 by Avanthik — Auth + reset styling pass: shared .auth-shell /
  .auth-card classes in layout.css (login T46, static/reset.html and future forms share one
  DESIGN-compliant card on page ground, 390px single column, 44px targets), error-summary +
  inline-error typography per validators.js contract; classes documented in styles README.
  Code by the 10:40 scheduled cycle (a038593/14351a8/c068430 incl. reset.html refactor onto
  canonical classes, cad-* aliases kept); interactively verified + closed out at 10:51 —
  invariants intact (.ok gate, DOM-built shape-checked link, retry-only-transient), no hex,
  TEST_CMD 18/18. GROOM(integrator 10:40): board supply — Avanthik was under 5 OPEN.
- [x] **T45** (P3, owner: Avanthik, ~10m) DONE @10:50 by Avanthik — Shell a11y: skip-to-content link in
  static/index.html, :focus-visible ring via tokens + prefers-reduced-motion block in
  layout.css, nav landmark aria-label.
  GROOM(integrator 10:40): board supply — Avanthik was under 5 OPEN.

## Claim log (append only)
<!-- e.g. `12:35 Manu claimed T03` -->
`09:53 Manu claimed T-V1`
`09:57 Saurabh claimed T06`
`10:13 Manu claimed T02`
`10:24 Avanthik claimed T06-boot-seam (index.html router script line — flagged Avanthik/static in T06 DONE note)`
`10:42 Karthik claimed T01`
`10:42 Avanthik claimed T44`
`10:52 Manu claimed T03`
`11:05 Avanthik claimed T07 (resume own PARTIAL — verify wiring landed, close out)`
`11:12 Manu resumed T03 (own CLAIMED task — killed 10:56 cycle landed code but never closed the board)`
`11:15 Saurabh claimed T00 (per-member dry-run share)`

## Integrator log
<!-- integrator cycles append: what was fixed/groomed, every cross-module touch, LAST-GOOD SHA in FINAL -->

`10:17 Saurabh claimed T12`
`10:40 [integrator] cycle: pulled (T02, T33 landed); TEST_CMD 12/12 GREEN; no stale claims
(>45m), all members active <60m (no HEALTH rows); origin has only main (no stray branches).
Board supply: +T44/T45 (Avanthik, was 4 OPEN), +T46 (Saurabh — auth UI gap: login/signup
screen had no owner but T31/T33 + graded validation must-have assume it), GROOM note on T03
(simulator seam = backend/livefeed/simulator.py start()/stop(), auto-wired by T01 lifespan).
No code fixes needed — main was green on arrival. Next: claiming T01 (Karthik executor).`