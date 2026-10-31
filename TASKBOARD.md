# TASKBOARD â€” single source of truth for what gets built

## Header
- TEST_CMD: `scripts\ci.cmd` (installs deps, runs `python -m pytest -q`)
- RUN_CMD: `scripts\run.cmd` â†’ serves on http://127.0.0.1:8000 (installs deps if missing)
- Stack: `Python FastAPI + SQLite (stdlib sqlite3) + vanilla HTML/CSS/JS (no build step)`
- Task sizing: **5â€“15 min of agent work each** (cycle kill cap is 19 min). Split anything bigger.
- Currency: â‚¹ en-IN. App name: **Cadence** (DESIGN.md is law).

<!--
ARCHITECTURE (bootstrap ruling, 08:55 Karthik â€” 10 lines)
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
9. Numbers render with .num (tabular figures), â‚¹ en-IN; dates IST.
10. Vertical slice first (T01-T04), then feature meat top-down. Owners per DECISIONS D8.
-->

## Ownership map (module â†’ member; agents: stay inside your dirs)
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
OPEN â†’ CLAIMED @<time> by <member> â†’ DONE | PARTIAL <note> | BLOCKED <reason>
(Integrator re-opens claims stale >45 min.)

## Tasks â€” value-ordered (top = most demo value). Each 5â€“15 min.
> Format: `- [ ] **T01** (P1, owner: <m>, ~10m) description` â€” one line per task, never
> reordered mid-window (integrator edits Pn tags in place / appends GROOM: notes only).
> Every UI task: apply DESIGN.md tokens + check 390px before marking DONE.

- [ ] **T00** (P0, owner: each member, ~5m) dry-run micro-task per member: add one tiny
  utility function + its test in YOUR module. Used ONLY by the 11:15 dry-runs.
  [Saurabh: DONE @11:15 â€” frontend/components/dryrun.js clamp() + dryrun.selftest.mjs +
  tests/test_dryrun_saurabh.py; node selftest 8/8, TEST_CMD 29/29]
- [x] **T-V1** (P1, owner: Manu, ~15m) DONE @10:07 by Manu â€” **`scripts/make-demo-video.mjs`** video
  recorder (spec: VIDEO-SCRIPT.md): 7 captioned scenes (captions injected INTO the page,
  styled only with DESIGN tokens), explicit waits on data counters (no sleeps on live data),
  auto-boots/kills uvicorn, best-effort scene skips + `--only` filter for rehearsal;
  playwright+chromium installed in scripts/ (dev-only, node_modules ignored);
  chromium launch + recordVideoâ†’webm flush probed OK on Manu's laptop.
  Full app rehearsal = T09 once T01/T03 land.

### P1 â€” walking skeleton + graded must-haves
- [x] **T01** (P1, owner: Karthik, ~15m) DONE @10:48 by Karthik (integrator cycle) â€” Vertical slice:
  `backend/api/main.py` create_app() + `backend.api.main:app`; GET /api/health (DB ping);
  frontend/ mounted at /frontend BEFORE static/ at / (html=True â†’ index.html at /,
  reset.html at /reset.html); CORS off (no middleware, asserted in test). Lifespan:
  ensure_db + seed_if_empty (Manu's T02 exports) + guarded T03 seam â€” imports
  start()/stop() from backend/livefeed/simulator.py and includes backend/livefeed/router.py
  when they exist (find_spec-guarded so "not landed" â‰  "broken"). tests/test_health.py
  (6 tests: health, shell@/, reset.html, 6 frontend module URLs, CORS-off, seed-on-boot
  via tmp CADENCE_DB). TEST_CMD 18/18; real uvicorn boot verified (health 200, all SPA
  assets 200, /api/live/summary 404 until T03 â€” expected).
- [x] **T02** (P1, owner: Manu, ~15m) DONE @10:37 by Manu â€” `backend/models`: db.py (sqlite3 conn, WAL, dict rows),
  schema.py â€” customers, users, products, product_variants, plans, subscriptions,
  subscription_lines, invoices, invoice_lines, payments, discounts, tax_rules,
  quotation_templates; SEED fixture (marked SEED, incl. brand variant +â‚¹560 example).
  db.py (CADENCE_DB override) + schema.py (14 tables, CHECK enums, 8 indexes,
  idempotent) + passwords.py (PBKDF2 stdlib) + seed.py (dated-rel-to-boot demo set:
  paid/overdue/outstanding/draft invoices, all sub states, RBAC users, expired
  discount) + __init__ exports ensure_db/seed_if_empty for T01/T03. Cycle-2 fix:
  discounts INSERT had 11 placeholders for 12 cols (never ran), INV-0003 GST
  corrected to 2525.58. tests/test_models.py + test_seed.py; TEST_CMD 12/12.
- [x] **T03** (P1, owner: Manu, ~15m) DONE @11:12 by Manu â€” `backend/livefeed`: simulator thread (started in app
  lifespan) mutating DB every ~3s (payment lands, sub state advances) +
  `backend/livefeed/router.py` â†’ `GET /api/live/summary` reading DB (never static JSON).
  GROOM(integrator 10:40): T01's lifespan now imports `start()`/`stop()` from
  `backend/livefeed/simulator.py` â€” put the thread there (export those two names) and the
  boot wiring is already done; main.py skips silently until the module exists.
  DONE detail: simulator.py tick = bill ONE due active sub (idempotent: next_billing_date
  pushed a full period the moment the invoice exists) + land ONE payment slice (30% /
  min â‚¹500, oldest-due outstanding first, flips invoice paid at â‰¤1 paisa) + every 2nd
  tick advance a sub one legal state; when nothing due & nothing owed, a billing day is
  pulled to today â€” feed never goes quiet. Thread waits FIRST full interval (short-lived
  boots mutate nothing; CADENCE_TICK_SECONDS tunes it). summary() = T04's polled
  contract (+ recent activity list). tests/test_livefeed.py 8 tests; TEST_CMD 27/27;
  in-process boot smoke: KPIs moved in 3s (revenue 15518.86â†’18822.96, overdue 1â†’0).
  Code landed by killed 10:56 cycle (e12b29f/d5c9a3f); this cycle verified + closed.
- [x] **T04** (P1, owner: Saurabh, ~10m) DONE @09:28 by Saurabh â€” Overview page: KPI strip (one container, 1px rules)
  + live numbers from `/api/live/summary`, poll 3s, freshness stamp, `.num` tabular.
  Code complete in frontend/pages/overview.js + components (fmt/kpi/poll). Renders live
  once T03 (`/api/live/summary`) + T05 (index.html shell + tokens.css) land; error state
  until then. Contract read: `{updated_at, kpis:{active_subscriptions, revenue_collected,
  outstanding, overdue_invoices}}` (fields also accepted top-level). Page-module API:
  `export render(mount) -> cleanup()`.
- [x] **T05** (P1, owner: Avanthik, ~15m) DONE @09:37 by Avanthik â€” `frontend/styles/tokens.css`
  (DESIGN.md :root copied verbatim, byte-for-byte incl. comments) + layout.css (224px sidebar
  shell on page ground, grey active pill via --active, .cad-cardrow/.cad-card shared-bottom-edge
  cards, 390px fold to 48px top bar; var(--...) only, zero color literals) + `static/index.html`
  shell with SVG copper-ring mark + Cadence wordmark + scope, empty #nav slot for T06 router,
  #view mount. Grid sums commented per DESIGN. TEST_CMD green (4 passed).
- [x] **T06** (P1, owner: Saurabh, ~10m) DONE @10:04 by Saurabh â€” Hash router + sidebar nav for all 7 sections,
  active item = grey pill per DESIGN; works from Overview in one click.
  `frontend/pages/router.js`: fills #nav (7 sections), lazy `import()` per route, mounts
  `render(mount)->cleanup()` into #view, runs prev cleanup() on swap (stops overview poller),
  default `#/overview`, `aria-current`+`.is-active` grey pill. Unbuilt screens (products/
  invoices/payments/discounts/customers/subscriptions) show DESIGN empty-state placeholder;
  they light up automatically as those page modules land. âœ… BOOT SEAM closed @10:26 by
  Avanthik: index.html loads router.js before </body>; boot import graph (11 URLs â€” styles,
  router, overview/products pages, components, validators) verified 200 over HTTP.
- [x] **T07** (P1, owner: Avanthik, ~15m) DONE @11:15 by Avanthik â€” validators.js + form CSS (all rules: email,
  password >8/upper/lower/special, price/qty â‰¥0, dateOrder, usageLimit; blur inline errors under fields,
  form-level render+focus-first-error, a11y aria wiring). PARTIAL closed: (a) signup wiring landed via T46
  (login.js:18/160-161/191-197 â€” attachBlurError + validateForm, gate on `.ok`); (b) server mirror is T08's own
  line (Karthik); contract + traps in frontend/validation/README.md. NEW: frontend/validation/selftest.mjs (all
  pure-rule behaviors incl. mirror traps, runs under plain node) + tests/test_validators_contract.py (runs the
  selftest inside TEST_CMD â€” node-missing = loud skip; pins all 9 MSG strings verbatim so drift fails CI before
  T08 lands). TEST_CMD 27/27.
  password policy (>8 chars, upper, lower, special), price/qty â‰¥ 0, date order; blur-time
  inline errors under fields; wired into the signup form.
- [x] **T08** (P1, owner: Karthik, ~15m) DONE @11:35 by Karthik (integrator cycle) â€” Auth API: POST /api/auth/signup (unique email +
  full password policy SERVER-side, same messages as client), /login, /me with role;
  `tests/test_auth.py` incl. one invalid-password and one duplicate-email case.
  DONE detail: `backend/api/validators.py` = validators.js mirror (ALL rules, MSG verbatim,
  [0-9] not \d, code-point length, leading zeros OK) + `backend/api/auth.py`: signup 400 mirrored
  MSG / 409 duplicate, login 401 one message (no user enumeration, dummy-hash on miss), /me via
  x-auth-token, forgot â†’ reset_url ALSO printed to server log (demo's 2nd channel), single-use
  30-min reset tokens (weak try does NOT burn the token). main.py includes router BEFORE the "/"
  mount (route order). tests/test_auth.py: 19 tests incl. mirror Unicode/code-point traps.
  TEST_CMD 48/48. T46 login.js + T33 reset.html are now live against real endpoints.
  [restored 11:32 by Avanthik â€” this DONE block was lost when the 11:25 worker re-land
  squashed TASKBOARD; verbatim from 49eece8]
- [x] **T09** (P1, owner: Manu, ~10m) DONE @12:01 by Manu — Dress-rehearse make-demo-video.mjs against the live
  app (scenes 1-7), fix waits/pacing; log rehearsal result in PROGRESS.
  DONE detail: full 7-scene rehearsal @11:53 CLEAN — zero warnings, nothing skipped:
  scene 2 counter-wait caught 2 KPI changes, scene 3 real signup → post-signup redirect
  observed (also live end-to-end proof the restored T08 works in a real browser), scene 4
  inline .cad-fielderror on camera, scene 6 real #nav clicks (no hash fallback), end card
  flushed. VIDEO READY: ..\makeaton9-video\demo.webm 1.7MB (~70s, spec 60-180s). Pacing
  knobs needed NO further fixes — the killed 11:32 cycle's edits (signupRoute→#/login?mode=signup,
  caption-after-navigation, fillAllPasswords for password+confirm) proved correct as landed.
  FOR THE 16:10 PRODUCER: recorder is scene-ready; scenes 6 (subscriptions/invoices) and
  products/plans pages will film richer once T10/T14/T17/T21/T27 APIs land — mechanics
  unaffected. (Cycle also caught T08 eaten by the 11:34 stale-tree re-land; restored in
  parallel with Avanthik's 11:54 RECOVERY — rebase deduped mine, main verified 54/54.)
  [T09 DONE block + PROGRESS row restored @12:28 by integrator — verbatim from a9b14db;
  the 2b7f163/7149277 wip re-lands squashed them after Manu's push]
  [restored @12:15 by Manu — this DONE block + NOTES/PROGRESS rows were eaten by the
  11:55:59 wip re-land squash (7149277, stale tree); verbatim from a9b14db. Test count
  on current HEAD 55/55 = expected (54 + T50's pin test) — no code/tests lost.]


### P2 â€” the feature meat (statement scenes)
Products & plans
- [x] **T10** (P2, owner: Karthik, ~10m) DONE @12:26 by Karthik (integrator cycle) —
  Products CRUD API: name, type, sales price, cost price, notes; server validation
  (price ≥ 0, name required).
  DONE detail: `backend/api/products.py` — GET /api/products (DB rows, newest first:
  a just-created product is instantly the top table row), POST 201, PATCH /{id},
  DELETE /{id}. Validation mirrors the client (graded must-have): name message =
  products.js checkName VERBATIM ('Enter a product name.'), prices flow through
  validators.price (the validators.js mirror — same sentence both sides, drift fails
  CI); prices optional at the API (default 0 — the page's parseFloat(NaN)→null case)
  but validated whenever present; DELETE 409s with a sentence when subscription_lines/
  quotation_template_lines reference the product (FKs are ON — refusing turns the
  would-be IntegrityError into an explainable demo moment). No auth gate yet — T32's
  RBAC adds it. tests/test_products.py 18 cases; TEST_CMD 73/73 (54 + T50's pin + 18);
  real uvicorn smoke: 4 seeded rows served live, empty-name → 400 mirrored sentence.
  **T12's products page is now LIVE** (no page change needed — API matches its
  documented contract field-for-field).
- [x] **T11** (P2, owner: Manu, ~10m) DONE @12:55 by Manu — Product variants: model + attribute price delta
  (seed: brand "Odoo" +₹560); included in plan line pricing.
  DONE detail: `backend/models/variants.py` — repo (list_for_product cheapest-delta
  first; create w/ friendly ValueErrors: blank attr/value, unknown product, non-numeric
  delta, duplicate pair via UNIQUE -> "already has a brand 'Odoo' variant.") + THE
  pricing law: `unit_price(p,v) = sales_price + price_delta` (mismatched/unknown pair
  raises, never silent fallback) and `price_line()` -> ready-to-insert sub/invoice line
  dict (description convention "Cadence Books (brand: Odoo)" identical to SEED). Drift
  guard: test_price_line_matches_every_seeded_subscription_line re-prices ALL seeded
  lines through the code — fixture and function are one law (999+560=1559 pinned).
  Seed variants were already in (T02); code+tests landed via the killed 12:32 cycle's
  wip (ff2003e), verified 83/83 this cycle and closed. T20 billing + any variant
  API/page consume price_line() so the +₹560 can never drift between screens.
- [x] **T12** (P2, owner: Saurabh, ~10m) DONE @10:24 by Saurabh â€” Products page: table (right-aligned â‚¹, truncate)
  + create form with client validation + empty/loading/error states.
  Built frontend/pages/products.js + shared frontend/components/table.js (DESIGN table
  rules + 640px two-line fold). Reads GET /api/products (DB, dynamic), POST to create;
  name/price client-validated via validators.js (server mirrors T10). All 4 states ship;
  renders live once T10 (/api/products) lands, error+Retry until then. node --check OK,
  TEST_CMD 8/8.
- [x] **T13** (P2, owner: Manu, ~10m) DONE @13:25 by Manu — Plans model: billing frequency daily/weekly/monthly/
  yearly, min quantity, available from/to, close policy (auto-close on end / early close /
  pause / renew) per plan.
  DONE detail: `backend/models/plans.py` = the plan-behaviour law, one owner for four rules:
  (1) `add_period(day, freq)` CALENDAR-TRUE (monthly = same day next month clamped to
  month end Jan 31→Feb 28; yearly leap-safe Feb 29→Feb 28; unknown freq raises, never
  guesses); (2) `is_available(conn,id,day)` window w/ ready-to-show sentences (NULL bound
  = open); (3) `check_quantity(plan,qty)` = the PLAN's floor ("Minimum quantity for
  Support Weekly is 3.") — complements the form-level minQuantity (>=1) rule, both must
  pass; `can_start()` = one gate joining window+floor for T17; (4) close policy:
  `term_end_action(plan,sub)` → renew/close/pause (auto_close closes at expiry, pause
  halts billing on expiry day, early_close/renew auto-renew) + `may_close_early()` for
  T17's transition guard. LIVEFEED REWIRED: simulator's FREQ_DAYS 30/365-day
  approximation RETIRED — next_billing_date pushes go through add_period (drift-guard
  test: bill SUB-0001 monthly → next date == add_period(today,'monthly')); T20's billing
  run consumes the same law. tests/test_plans_model.py 15 tests (calendar clamps, leap
  year, window sentences, floors, all 4 policies, seed enum parity, simulator drift
  guard); TEST_CMD 135/135.
- [x] **T14** (P2, owner: Karthik, ~10m) DONE @13:05 by Karthik (integrator cycle) —
  Plans CRUD API + validation (from â‰¤ to, price â‰¥ 0, frequency enum); tests.
  DONE detail: `backend/api/plans.py` — GET (newest first: a just-created plan is
  instantly the top table row), POST 201, PATCH /{id}, DELETE /{id} (409 while any
  subscription or quotation template references the plan). Validation mirrors the
  client verbatim: 'Enter a plan name.' (plans.js checkName), shared price +
  minQuantity + dateOrder rules, frequency + close-policy enums ('Choose a billing
  frequency.' / 'Choose a close policy.'); price/min_quantity optional at the API
  (page parseFloat/parseInt NaNâ†'null case; schema defaults 0/1) but checked whenever
  present; PATCH re-checks dateOrder against the STORED other side (one-sided patch
  can't create from > to). ALSO landed the py mirrors Avanthik's T36/T50/T52 notes
  handed to Karthik: min_quantity, required(label), amount, payment_amount(outstanding)
  — with the numeric-0 branch FIXED vs the handoff sketch (`v or ""` sends int 0 to
  the EMPTY message; JS String(0 ?? '')='0' takes the minQtyBad branch — test-pinned).
  [integrator] plans.js minQty guard rewired 'quantity' -> 'minQuantity'
  (Saurabh's absorbed module; the T36 pass-2 parity break: client allowed 0, schema
  CHECKs >=1, sentences diverged). tests/test_plans.py 37 cases; TEST_CMD 120/120;
  real uvicorn smoke: 5 seeded plans served live, both graded parity sentences exact.
  **T15's plans page is now LIVE** (API matches its documented contract
  field-for-field) — both P2 catalog pages now render live (products: T12 page + T10
  API; plans: T15 page + T14 API).
- [x] **T15** (P2, owner: Saurabh, ~10m) DONE @11:08 by Saurabh â€” Plans page: list + create form incl. close-policy
  control and frequency; states.
  Built `frontend/pages/plans.js`: shared table (name/billing/price â‚¹ right/min qty/
  availability window/at-term-end) reading GET /api/plans (DB-dynamic, Karthik T14),
  POST to create. Create form: name (required), billing frequency + close-policy selects
  (schema enums), price (price rule), min qty (quantity rule â€” server enforces â‰¥1),
  available from/to (date, dateOrder endâ‰¥start). All four states; blur + submit-gate +
  focus-first-error via validators.js. Plans is an AUX route (#/plans) under the one
  "Products & plans" section â€” NO 8th sidebar row; router.js ACTIVE_FOR keeps the
  Products pill lit; cross-linked both ways in the page headers. Renders live once T14
  (/api/plans) lands, error+Retry until then (products/overview precedent). node --check
  OK; served 200, /api/plans 404 (pre-T14) verified; TEST_CMD 24/24.
Subscriptions
- [ ] **T16** (P2, owner: Manu, ~10m) CLAIMED @13:33 by Manu — Subscription model: SUB-0001 numbering sequence,
  states Draftâ†’Quotationâ†’Confirmedâ†’Activeâ†’Closed, lines (product, qty, unit price, tax,
  amount) with totals compute.
- [ ] **T17** (P2, owner: Karthik, ~15m) Subscription API: create, list w/ filters
  (state, customer, plan), state-transition endpoint guarding legal moves only.
- [x] **T18** (P2, owner: Saurabh, ~10m) DONE @11:46 by Saurabh â€” Subscriptions page: table + status pills + detail
  view (lines, taxes, totals); state badge visible per DESIGN.
  Built `frontend/pages/subscriptions.js` (router already lazy-imports it): shared table
  (number/customer/plan/status pill/next billing/total â‚¹ right) from GET /api/subscriptions
  (DB-dynamic, Karthik T17), client-side state filter (all + 5 schema states), click/Enter a
  row â†’ detail view (meta grid + lines table [desc/qty/unit â‚¹/tax %/amount â‚¹] + subtotal/tax/
  grand totals, server figures preferred else computed from lines). All 4 states; last-good
  list kept on failed refresh; detail paints the list-stub instantly then enriches. NEW shared
  `frontend/components/pill.js` statusPill(label,tone) â€” DESIGN pale-tint+dark-same-hue, 4 tones
  (positive/warning/negative/neutral), one mark/row; invoices/payments reuse it. table.js got an
  optional `onRowClick` (keyboard+hover, backward-compat â€” products/plans unaffected). Renders
  live once T17 lands, error+Retry until then (served 200, /api/subscriptions 404 pre-T17
  verified). node --check OK; TEST_CMD 35/35.
- [ ] **T19** (P2, owner: Manu, ~10m) Quotation templates: template with plan/product
  lines valid N days; "new subscription from template" copy action.
Invoicing
- [ ] **T20** (P2, owner: Manu, ~15m) Billing run: generate due invoices from active
  subscriptions â€” idempotent (never twice, never skipped), taxes auto from tax_rules;
  `tests/test_billing_run.py`.
- [ ] **T21** (P2, owner: Karthik, ~10m) Invoice API: list/detail, confirm/cancel/send/
  print actions, state Draftâ†’Confirmedâ†’Paid guards.
- [x] **T22** (P2, owner: Avanthik [absorbed from Saurabh @12:50], ~10m) DONE @13:20 by Avanthik —
  Invoices page: table (paid/outstanding/overdue filter) + detail with lines/taxes/totals + actions.
  DONE detail: `frontend/pages/invoices.js` (router already lazy-imports it; first landed page in
  the absorbed module, per the integrator's 12:50 ABSORB enactment logged in PROGRESS). List:
  shared table (number/customer/due date/status pill/total + outstanding, both ₹ right) reading
  GET /api/invoices (DB-dynamic, Karthik T21); the task's paid/outstanding/overdue filter with
  LIVE counts in the option labels; overdue = confirmed + due_date < today IST + balance > 0
  (server `overdue` verdict wins, else DERIVED client-side) and renders as the row's ONE pill in
  negative tone. Detail: meta grid (customer/subscription/issue/due) + lines table (tax via
  fmt.pct — 0.0% law) + totals subtotal/discount/tax/total/paid/balance-due (server figures
  preferred, else computed from lines/payments) + Due/Was-due note + optional payments list
  (paints the moment T27 sends it). Actions: Confirm (draft), Send + Print (confirmed), Print
  (paid); Cancel = ARMED two-step in a separate consequence-worded section (DESIGN destructive
  law) whose confirmation names the invoice, 6s disarm. Actions POST /api/invoices/{id}/{verb}
  with authHeaders (RBAC-ready for T32), busy label-swap, result in .cad-flash ok(status)/
  err(alert) with the server sentence shown VERBATIM (409 detail), focus moves to the flash when
  the repaint removes the acted-on button; list cache updated in place so Back reflects the new
  state without a refetch. All 4 states + last-good list kept on failed refresh; missing values
  via .cad-dash spans (T36 class, first page consumer). /api/invoices contract (list/detail/
  action shapes incl. the 409 body) documented in-file for T21. Renders live once T21 lands,
  error+Retry until then — real uvicorn boot on a throwaway DB verified: module 200, shell 200,
  /api/invoices 404 pre-T21. node --check OK; TEST_CMD 135/135 (120 + Manu's T13 model tests —
  count UP, no drop).
- [ ] **T23** (P2, owner: Karthik, ~10m) Tax rules API (admin-only): rate % scoped by
  product/type; applied automatically at billing.
Discounts
- [ ] **T24** (P2, owner: Avanthik [absorbed from Saurabh @12:50], ~10m) CLAIMED @13:20 by Avanthik —
  Discounts page (admin-only): rules table + create form (fixed/%, min purchase/qty, dates, usage limit, scope).
- [ ] **T25** (P2, owner: Karthik, ~15m) Discount rules API: fixed or percentage, minimum
  purchase/quantity, start/end, usage limit, product or whole-subscription scope;
  admin-only guard + tests.
- [ ] **T26** (P2, owner: Manu, ~10m) Discount engine: auto-apply best eligible rule on
  next invoice, stop on expiry or exhaustion; tests.
Payments & customers
- [ ] **T27** (P2, owner: Karthik, ~10m) Payments API: record (method, amount, date, note)
  against invoice; outstanding balance + overdue flag computed.
- [ ] **T28** (P2, owner: Avanthik [absorbed from Saurabh @12:50], ~10m) Payments page: record form (client+server
  validation) + paid/outstanding/overdue views.
- [ ] **T29** (P2, owner: Manu, ~10m) Customers model+API: list/detail with their
  subscriptions and invoices.
- [ ] **T30** (P2, owner: Avanthik [absorbed from Saurabh @12:50], ~10m) Customers page (internal team view).
- [ ] **T31** (P2, owner: Karthik [absorbed from Saurabh @12:50 — integrator takes], ~10m) Customer portal page: after signup/login shows
  ONLY own subscriptions + invoices (statement's portal scene).
- [ ] **T32** (P2, owner: Karthik, ~10m) RBAC dependency: admin/staff/customer routes;
  only admin can create staff; 401/403 tests.
- [x] **T33** (P2, owner: Avanthik, ~10m) DONE @10:34 by Avanthik â€” `static/reset.html`: standalone reset page (no
  sidebar per DESIGN â‰¤5-destination rule), dual-mode by ?token= (request link â†’ set password), validators.js wired
  (email + password rules, blur + submit gate + focus-first-error), all 4 DESIGN states, status-matched errors,
  Retry only on transient failures, pre-paint mode toggle, reset link DOM-built with contract-shape check.
  API contract for forgot/reset endpoints documented in-file for T08 (Karthik) incl. the task line's server-side
  log channel. Renders live once T08 lands (T04 precedent: page DONE against contract, dependency pending).
  Phone: 16px margins + 44px target in layout.css media block. TEST_CMD 8/8.
  in UI response/log â€” no external mail).
Reporting
- [ ] **T34** (P2, owner: Manu, ~10m) Reports API: active subscriptions count, revenue
  collected, still owed, overdue invoice list; date filters.
- [ ] **T35** (P2, owner: Karthik [absorbed from Saurabh @12:50 — integrator takes], ~10m) Finance overview upgrade: KPIs + revenue-over-time
  chart (accent hue only, DESIGN chart rules) + overdue table + "View all".
- [x] **T46** (P1, owner: Saurabh, ~10m) DONE @10:48 by Saurabh â€” Login+signup screen (auth UI seam T31/T33 assume):
  Built `frontend/pages/login.js` (#/login route, Sign in â‡„ Create account via
  ?mode=signup; email+password+confirm, validators.js blur+submit gate, focus-first-error,
  401/409/400 in-card error + Retry only on network/5xx) + `frontend/components/auth.js`
  (localStorage session: getToken/setSession/clearSession/authHeaders x-auth-token/
  landingHashFor/readAuthBody â€” tolerant of token|access_token & nested role/email).
  Router (my T06): aux routes login+portal (not in sidebar), auth-mode hides sidebar for
  the standalone card, sidebar user line = email + Log out (or Sign in when signed out),
  role redirect admin/staffâ†’#/overview customerâ†’#/portal, "Forgot password?"â†’/reset.html.
  AUTH CONTRACT for T08 documented in-file (components/auth.js). Renders live once T08
  lands (overview/products/reset precedent). node --check OK, TEST_CMD 12/12.
  RULING: did NOT hard-gate the app behind login this cycle (would break the live
  overview/products demo since T08 isn't built) â€” sidebar shows Sign in; gating can flip
  on once T08 is green. Logged in PROGRESS.
  #/login route + form (email, password, confirm on signup) wired to validators.js
  (attachBlurError/validateForm â€” T07 API), POST /api/auth/signup + /login (T08), token â†’
  localStorage, role redirect (admin/staff â†’ #/overview, customer â†’ #/portal), sidebar
  logout + current-user line; 401 error state. Links to /reset.html per T33 contract.
  GROOM(integrator 10:40): new task â€” auth UI had no owner; graded must-have
  (validation client AND server on the main input flow) needs this screen to exist.

### P3 â€” polish & hardening
- [ ] **T36** (P3, owner: Avanthik, ~10m) PARTIAL @11:18
  PASS 2 @12:17 by Avanthik (subscriptions T18 + plans T15 audited; invoices/payments/
  discounts/customers/portal = pass 3 when they land). MINE-SIDE FIX DONE: rules.minQuantity
  in validators.js — audit caught plans.js:231 wired to 'quantity' (allows 0) while schema
  CHECKs min_quantity>=1, so a client-valid 0 got server-rejected with a DIVERGENT message
  (graded parity break). New MSG: 'Enter a minimum quantity.' / 'Minimum quantity must be a
  whole number of 1 or more.'; selftest pinned. KARTHIK py mirror: add to validators.py MSG
  + `def min_quantity(v): s=str(v or "").strip(); ok=s.isdigit() and int(s)>=1; return {"ok": ok and bool(s), "message": "" if ok and s else ("Enter a minimum quantity." if not s else "Minimum quantity must be a whole number of 1 or more.")}`. SAURABH one-liner: plans.js:231 attachBlurError(minQtyI,'quantity') -> 'minQuantity'. PAGE-SIDE (13 findings, top): (1) sub detail shows false-Empty+false-Zero while loading (stub lines [] -> 'No lines yet' + 0.00 totals; use skeleton + dash until loaded); (2) silent failed refresh pattern AGAIN (subscriptions.js:204 + plans) — no lastGoodAt/Retry, T49 still OPEN covers it; (3) grey-dash STILL unwired: table.js:60 null->'' and DASH inherits --text, .cad-dash exists since 11:18 unused — T49; (4) tax percent '18%' needs fmt.pct (0.0% law); (5) hand-rolled .cad-stateblock/.cad-linkbtn copies in 4 page files, byte-equal to shared — drop at will. by Avanthik (pass 1 of 2: overview/products/login/plans;
  pass 2 after remaining pages land) â€” States audit: empty/loading/error blocks on all. SHARED FIXES DONE
  (Avanthik modules): .cad-stateblock(+--err) + .cad-dash (grey dash, --faint 4.76:1) in layout.css; 44px
  Retry hit-area on phones (.cad-linkbtn padding+negative-margin); reset.html Retry now re-submits in place
  (form.requestSubmit) instead of reloading. PAGE-SIDE FINDINGS FOR SAURABH (17-finding audit, top 6):
  (1) SHOULD: dash not grey anywhere â€” fmt.js DASH renders in --text; wire <span class="cad-dash"> in
  table.js fillCell + kpi.js value when DASH (class now exists in layout.css); (2) SHOULD: products.js failed
  refresh w/ last-good rows is fully silent, no last-good time stored â€” capture lastGoodAt, show in-block
  sentence + Retry per DESIGN; (3) SHOULD: table.js:54 null renders '' not dash; (4) poll.js fetch has no
  timeout/abort â€” hung first request traps loading forever, Retry no-ops (AbortController ~2Ã— interval);
  (5) NIT: overview.js parses zoneless IST 'YYYY-MM-DD HH:MM:SS' as browser-local â€” append '+05:30' (Manu:
  ISO-8601 w/ offset from simulator._now would fix at source); (6) NIT: kpi skeleton bars ~half real size.
  main pages per DESIGN (frame kept, one sentence, no shimmer).
- [x] **T37** (P3, owner: Avanthik, ~10m) DONE @11:33 by Avanthik â€” Responsive 390px pass: sidebar folds to top bar
  + sheet or bottom nav, tables â†’ two-line rows, no horizontal scroll.
  Detail: phone fold = 48px top bar + checkbox-driven menu SHEET (7 nav destinations > 5, so
  bottom nav is out per DESIGN) â€” code by the 11:20 scheduled cycle (index.html checkbox/label/
  hashchange-closer + layout.css .cad-navtoggle/.cad-menubtn/:checked~ rules, bar arithmetic
  documented in-file), verified + closed interactively. Tables two-line fold = shared table.js
  (<640px, T12). Auth pages 16px margins + 44px targets (T44/T45). No horizontal scroll at 390px
  (arithmetic comments in layout.css; T36 audit verified state styles at phone widths).
  TEST_CMD 35/35.
  [DONE block restored @11:44 â€” the 11:34 wip re-land reverted it to CLAIMED; code itself
  was never lost (index.html/layout.css untouched by that squash)]
- [ ] **T38** (P3, owner: Avanthik, ~10m) Chart polish per DESIGN: 3-5 gridlines, 4-7 y
  ticks, no markers/fill >14%, 4-8 x labels never rotated.
- [ ] **T39** (P3, owner: Manu, ~10m) Perf: seed ~3,000 subscriptions, add indexes, verify
  list/report endpoints < 2s (statement's "under two seconds").
- [ ] **T40** (P3, owner: Karthik, ~10m) Root README: setup, RUN_CMD, TEST_CMD, demo
  script, architecture, stack rationale.
- [ ] **T41** (P3, owner: Avanthik, ~10m) Invoice print CSS (browser print) â€” the "print
  any invoice" action produces a clean page.
- [ ] **T42** (P3, owner: Karthik, ~10m) API test hardening: billing idempotency, discount
  expiry, RBAC 401/403, validation parity client/server.
- [ ] **T43** (P3, owner: Avanthik [absorbed from Saurabh @12:50], ~10m) Overview polish: deltas with named windows
  ("vs prior 30 days"), billing-day annotation on chart, answer figure 30-36px.
- [x] **T44** (P2, owner: Avanthik, ~10m) DONE @10:51 by Avanthik â€” Auth + reset styling pass: shared .auth-shell /
  .auth-card classes in layout.css (login T46, static/reset.html and future forms share one
  DESIGN-compliant card on page ground, 390px single column, 44px targets), error-summary +
  inline-error typography per validators.js contract; classes documented in styles README.
  Code by the 10:40 scheduled cycle (a038593/14351a8/c068430 incl. reset.html refactor onto
  canonical classes, cad-* aliases kept); interactively verified + closed out at 10:51 â€”
  invariants intact (.ok gate, DOM-built shape-checked link, retry-only-transient), no hex,
  TEST_CMD 18/18. GROOM(integrator 10:40): board supply â€” Avanthik was under 5 OPEN.
- [x] **T45** (P3, owner: Avanthik, ~10m) DONE @10:50 by Avanthik â€” Shell a11y: skip-to-content link in
  static/index.html, :focus-visible ring via tokens + prefers-reduced-motion block in
  layout.css, nav landmark aria-label.
  GROOM(integrator 10:40): board supply â€” Avanthik was under 5 OPEN.
- [x] **T47** (P2, owner: Avanthik, ~10m) DONE @11:44 by Avanthik â€” Shared inline-feedback classes (.cad-flash ok/err +
  form submit-busy state) in layout.css + styles README â€” the convention pages still lack for
  POST success feedback ("Saved", "Invoice confirmed") next to forms; Saurabh's pages consume.
  GROOM(integrator 11:35): board supply â€” Avanthik was at 3 OPEN.
  DONE detail: landed 11:33 (d42b015 + bb1cd22 hex-comment fix â€” cycle token-guard caught it,
  comments count), then REVERTED by the 11:34 wip re-land (stale-tree squash ate layout.css +
  README hunks + this board's claim line); re-landed verbatim @11:44 (eec7771), token-guard
  2/2 green. Pattern: busy() label-swap during flight â†’ .cad-flash--ok role=status /
  --err role=alert beside the form.
- [x] **T48** (P3, owner: Avanthik, ~10m) DONE @11:50 by Avanthik â€” Shell head polish in static/index.html + reset.html:
  favicon from the existing SVG mark (any literal color must carry a comment naming the token
  it mirrors â€” hex otherwise lives only in tokens.css) + meta description.
- [ ] **T49** (P2, owner: Avanthik [absorbed from Saurabh @12:50], ~10m) Page-side fixes from T36's audit (6 findings listed on
  the T36 note): .cad-dash for DASH/null in table.js fillCell + kpi.js value, lastGoodAt
  sentence + Retry on failed refresh, poll.js fetch timeout via AbortController (~2Ã— interval).
  GROOM(integrator 11:35): makes the audit actionable as its own claimable unit.
- [x] **T50** (P3, owner: Avanthik, ~10m) DONE @12:10 by Avanthik â€” validators.js + backend/api/validators.py: shared
  'required' text rule (e.g. 'Enter a product name.' â€” pick the message, pin BOTH sides +
  selftest.mjs) so required-ness stops being hand-rolled per page (products.js checkName today;
  discounts/customers forms coming). Coordinate w/ T10's server messages.
  DONE detail (code: 12:00 cycle â€” required(label) rule FACTORY + selftest + contract-test
  pin, template `Enter ${label}.` matching products.js's live sentence; closed interactively
  @12:10, TEST_CMD 55/55). HANDOFF â€” Karthik, exact py mirror for backend/api/validators.py:
  `def required(label): return lambda v: {"ok": bool(str(v or "").strip()), "message": "" if str(v or "").strip() else f"Enter {label}."}`
  (template already pinned by tests/test_validators_contract.py â€” drift fails CI). Saurabh:
  products.js checkName can become `attachBlurError(nameI, required('a product name'))` â€”
  one line, same message, server parity free.
  [T47-T50 restored 11:32 by Avanthik â€” lost in the 11:25 worker re-land squash; verbatim
  from 49eece8]
- [x] **T51** (P2, owner: Avanthik, ~10m) DONE @12:32 by Avanthik — Phone nav-sheet a11y (T37 follow-up): Esc closes
  the sheet, focus trapped while open, menu toggle gets aria-expanded/aria-controls, focus
  returns to the toggle on close (static/index.html + layout.css â€” pure-checkbox sheets are
  invisible to Esc/keyboard today).
  GROOM(integrator 12:03): board supply â€” Avanthik was at 3 OPEN.
- [x] **T52** (P2, owner: Avanthik, ~10m) DONE @12:31 by Avanthik — Shared amount rule in validators.js +
  backend/api/validators.py (mirror, selftest.mjs-pinned): amount â‰¥ 0, up to 2 decimals,
  optional upper-bound context (payment â‰¤ outstanding) â€” the rule T27 (payments API) and
  T28 (payments page) need. Pick the MSG once, pin BOTH sides + contract test (T07/T50
  pattern); coordinate w/ T50's required rule so the table stays one-message-per-rule.
  GROOM(integrator 12:03): board supply + unblocks payments validation parity.
- [x] **T53** (P2, owner: Avanthik, ~10m) DONE @12:50 by Avanthik — End-to-end auth-flow audit against the LIVE T08
  API (reset.html + login.js + validators): every mirrored message renders identically
  client/server on real 400/401/409s, weak reset try does NOT burn the token, focus-first-
  error works on all three forms, session survives reload. Fix findings in YOUR modules
  (validation/static/styles), hand page-side findings to Saurabh as a note (T36 pattern).
  GROOM(integrator 12:28): board supply — T50 went DONE; keeps Avanthik at 5 OPEN.

## Claim log (append only)
<!-- e.g. `12:35 Manu claimed T03` -->
`09:53 Manu claimed T-V1`
`09:57 Saurabh claimed T06`
`10:13 Manu claimed T02`
`10:24 Avanthik claimed T06-boot-seam (index.html router script line â€” flagged Avanthik/static in T06 DONE note)`
`10:42 Karthik claimed T01`
`10:42 Avanthik claimed T44`
`10:52 Manu claimed T03`
`11:05 Avanthik claimed T07 (resume own PARTIAL â€” verify wiring landed, close out)`
`11:12 Manu resumed T03 (own CLAIMED task â€” killed 10:56 cycle landed code but never closed the board)`
`11:15 Saurabh claimed T00 (per-member dry-run share)`
`11:20 Avanthik claimed T37`
`12:03 Avanthik claimed T50`
`12:03 Karthik claimed T10 (integrator cycle â€” executor for Karthik-owned tasks)`

`12:21 Avanthik claimed T52`

`12:41 Avanthik claimed T53`

`13:05 Avanthik claimed T22 (absorbed module per integrator 12:50 ABSORB enactment)``12:51 Karthik claimed T14 (integrator cycle â€” executor for Karthik-owned tasks)`
`13:10 Manu claimed T13`
`13:20 Avanthik claimed T24`
`13:33 Manu claimed T16`

## Integrator log
<!-- integrator cycles append: what was fixed/groomed, every cross-module touch, LAST-GOOD SHA in FINAL -->

`10:17 Saurabh claimed T12`
`10:40 [integrator] cycle: pulled (T02, T33 landed); TEST_CMD 12/12 GREEN; no stale claims
(>45m), all members active <60m (no HEALTH rows); origin has only main (no stray branches).
Board supply: +T44/T45 (Avanthik, was 4 OPEN), +T46 (Saurabh â€” auth UI gap: login/signup
screen had no owner but T31/T33 + graded validation must-have assume it), GROOM note on T03
(simulator seam = backend/livefeed/simulator.py start()/stop(), auto-wired by T01 lifespan).
No code fixes needed â€” main was green on arrival. Next: claiming T01 (Karthik executor).``11:20 Karthik claimed T08 (integrator cycle â€” executor for Karthik-owned tasks)`

`11:20-11:35 [integrator] cycle: pulled (T00/T36/T37); TEST_CMD 27/27 GREEN on arrival, 48/48 after T08. Fixed ci.cmd (own file): unique pytest --basetemp per run â€” Avanthik's 11:15 note (session-finish WinError 5 on %TEMP% pytest symlink = false RED). git branch -r: only origin/main. No stale claims; all members active <60m (no HEALTH rows). Board supply: +T47/T48/T50 (Avanthik, was 3 OPEN), +T49 (Saurabh â€” T36 audit findings as claimable unit). README auth section un-staled (T08 landed; reset link lands in server log). EXECUTOR: T08 DONE â€” auth API + validators.js mirror + 19 tests, see T08 note. [restored 11:32 by Avanthik â€” lost in the 11:25 worker re-land squash]`

`12:00 [integrator] cycle: pulled; TEST_CMD 54/54 GREEN on arrival â€” count matches the 11:54
recovery note (no tests lost to the re-land squashes); git branch -r: only origin/main;
harness in sync. No stale claims (T09 @11:32 by Manu = 28m, fresh); no HEALTH rows (all
members have PROGRESS rows <60m; Manu's last PRODUCTIVE row 11:12 â€” watching, absorb only
at 60+ quiet per constitution). Board supply: +T51/T52 (Avanthik, was 3 OPEN). EXECUTOR:
claimed T10 â€” products CRUD API (T12's page is DONE and error-states until it lands).`
`12:32 Manu claimed T11`

`12:45-13:05 [integrator] cycle: pulled; TEST_CMD 83/83 GREEN on arrival (count UP from
73 = T53's audit checks, nothing lost). Wip re-land audit (2247e9a Saurabh / ff2003e
Manu / 3d23d3b Avanthik): all PURE ADDITIONS, no eaten files (git show --stat + range
diff 7b92d8e..HEAD). Harness: runtime files (agent-cycle.ps1 + cycle-prompt-*) in sync
vs the G: launcher dir; the bootstrap staging files that also live there (stale
TASKBOARD/DECISIONS copies) were NOT shipped — reverted, only runtime files sync per
constitution. ENACTED the 12:15 ABSORB on the board (owner tags edited in place, no
reorder): T35/T31 -> Karthik, T22/T24/T28/T30/T43/T49 -> Avanthik. Saurabh still
all-fail (12:55) — ABSORB stands; no RESTORED yet. No stale claims (T11 @12:32 and
T53 @12:41 were both closed DONE by their owners mid-cycle). git branch -r: origin/main
only. Board supply: Karthik 10 / Manu 8 / Avanthik 8 OPEN (>=5 each). README: stale
'auth endpoints land with T08' line fixed + What's-live section added. EXECUTOR: T14
DONE — plans API; plans + products pages both live; NEXT highest-value Karthik task =
T17 subscription API (T18's page has been waiting since 11:46).`
