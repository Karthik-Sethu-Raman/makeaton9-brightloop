# NOTES — Saurabh — Q&A prep

> Agent appends here every cycle. In the evening YOU read this + `git log --author="<your-email>" --stat`
> and make sure you can explain every line committed under your name — the evaluator's
> Q&A round generates questions from YOUR commits matched to your GitHub account.

## 10:04 — T06 Hash router + sidebar nav
- Built: `frontend/pages/router.js`. Fills the shell's `#nav` with the 7 internal
  sections (Overview, Subscriptions, Products & plans, Invoices, Payments, Discounts,
  Customers), and mounts one page module into `#view` per URL hash.
- How it works: a `ROUTES` table maps each hash path (e.g. `#/products`) to a `label`
  and a lazy `load: () => import('./<module>.js')`. On `hashchange` (and at boot) the
  router: (1) highlights the matching nav item with `.is-active` + `aria-current="page"`
  (the grey `--active` pill — the CSS already existed in layout.css, T05); (2) calls the
  PREVIOUS page's `cleanup()` BEFORE loading the next one; (3) dynamically imports the new
  module and calls its `render(view)`, storing the returned `cleanup`.
- Why lazy import() per route: only `overview.js` exists right now. A static `import`
  of a not-yet-written module would fail to parse the whole router. Dynamic `import()` in
  a try/catch lets missing screens fall back to a DESIGN empty-state placeholder, and they
  "light up" automatically when I add products/invoices/etc. later — no router edits.
- Must be able to explain:
  * The `cleanup()` swap. overview.js polls `/api/live/summary` every 3s; if we didn't
    call its cleanup() before navigating away, that `setInterval` would leak and keep
    firing on a dead screen. Each page's `render(mount)` returns its own teardown.
  * `navToken` race guard: fast nav clicks start two async `import()`s; only the latest
    token's result is allowed to render, so a slow earlier load can't clobber the new page.
  * Default route: empty hash → I set `location.hash = '#/overview'`, which fires one
    `hashchange` → single navigate path (no double-render).
- SEAM I depend on: `static/index.html` (Avanthik's file) must load this with
  `<script type="module" src="/frontend/pages/router.js"></script>`. The router self-boots
  on DOMContentLoaded; until that line is added nothing drives the SPA. Flagged on the board.

## 10:24 — T12 Products page + shared table component
- Built: `frontend/pages/products.js` (the "Products & plans" screen) and a new reusable
  `frontend/components/table.js` that every future list screen (Subscriptions/Invoices/
  Payments/Customers) will reuse so they all look identical.
- What it does: GET `/api/products` → a table (Name / Type / Sales price / Cost price /
  Notes). A "New product" button in the title row opens an inline create form (Name, Type
  select, Sales/Cost price, Notes) that POSTs to `/api/products`, then re-reads the list.
- Dynamic data (graded must-have): the table is DB-backed through Karthik's T10 API — NOT
  static JSON. Karthik's products CRUD isn't merged yet, so right now the page shows its
  error state with a Retry button and "lights up" automatically the moment T10 lands
  (same contract-first pattern as my Overview page). Contract: list is an array of
  `{id,name,type,sales_price,cost_price,notes}` (also accepts `{products:[...]}`).
- Validation (graded: client AND server): name required + price rule (₹0+, ≤2 decimals)
  run on blur and on submit via Avanthik's `validators.js` (same `setError`/`validate` the
  rest of the app uses). Server mirrors the SAME rules/messages in T10 — I surface the
  server's `detail`/`message` sentence under the form if the POST is rejected.
- table.js bakes DESIGN's table rules in ONE place: 12px grey sentence-case headers, no
  zebra, 1px row rules, numbers right-aligned + `.num` tabular, identity (Name) column
  ~40% width + single-line truncate, and below 640px each row folds to a two-line stack
  (no horizontal scroll) — the graded 390px responsive rule.
- Must be able to explain:
  * All four states ship (DESIGN law): loading = flat grey skeleton bars at real row size
    (no shimmer/shift), empty = framed sentence, error = sentence + Retry, zero = printed.
    On a failed REFRESH I keep the last-good rows instead of flashing an error.
  * `cleanup()` sets an `alive=false` flag so a slow fetch/POST resolving AFTER the user
    navigates away can't paint into a dead screen (router calls cleanup on nav).
  * Why a shared table component: 5 of my list screens need the identical table; one source
    = consistent UI (graded) and no divergence when I build T18/T22/T28/T30.

## 10:48 — T46 Login/signup screen + the auth seam
- Built three things: `frontend/pages/login.js` (the `#/login` screen),
  `frontend/components/auth.js` (the browser's session store), and edits to my own
  `router.js` (T06) to make login/portal routable and to put a user line in the sidebar.
- The screen: ONE auth card, two modes in one form. Default is **Sign in** (email +
  password); the "Create an account" link switches to **Create account** via
  `#/login?mode=signup`, which adds a **Confirm password** field. On sign-in there's a
  "Forgot password?" link to `/reset.html` (Avanthik's standalone reset page, T33).
- Validation (graded: client AND server): email + password run through Avanthik's
  `validators.js` on blur and again on submit (`validateForm` renders inline errors and
  focuses the first bad field). The password policy ("more than 8 chars, upper, lower,
  special") is the SAME rule+message the server mirrors (T08). Confirm-password match is a
  client-only UX check (not a server rule) so its message lives in my file, not the MSG table.
- What happens on submit: POST to `/api/auth/login` or `/api/auth/signup`. On success I
  read `{token, user:{email, role}}`, store it in localStorage via auth.js, and redirect by
  ROLE — admin/staff land on `#/overview`, a customer on `#/portal` (T31). On failure the
  server's sentence shows INSIDE the card (401 wrong creds / 409 duplicate email / 400
  policy) — never a full-screen banner; "Retry" appears ONLY for a network/5xx failure
  (a bad password is fixed in place, not by reloading).
- `components/auth.js` is the single source for session state: `getToken/getUser/
  setSession/clearSession/isAuthed`, `authHeaders()` (adds the `x-auth-token` header the
  architecture note mandates), `landingHashFor(role)`, and `readAuthBody()` which
  normalises the server response so it doesn't matter whether the token is `token` or
  `access_token` or the role sits top-level vs under `user`. T31 (portal) will reuse it.
- Router changes (my module): login + portal are an `AUX` map, deliberately NOT in the
  7-item sidebar `ROUTES` (they aren't internal destinations). On the login route the
  router adds `body.cad-authmode` which hides the sidebar so the card sits alone (DESIGN:
  "no sidebar if ≤5 destinations", same treatment as reset.html). The sidebar gains a
  **user line**: when signed in it shows the email + a **Log out** button (clears session →
  `#/login`); when signed out it shows a **Sign in** link. It refreshes on every navigation
  because the auth state flips the instant login.js redirects.
- Must be able to explain:
  * The RULING (also in PROGRESS): I did NOT force every page behind login this cycle.
    T08 (the auth API) isn't built, so requiring a real token would have broken the live
    Overview/Products demo. The screen and the whole seam exist and work; a later cycle
    flips on hard gating once T08 is green. Reversible > broken.
  * Contract-first, like my other pages: login.js submits against the documented T08
    contract and shows its error/Retry state until the API lands — it "lights up"
    automatically, no edit needed.
  * `cleanup()` sets `alive=false` so a slow login response resolving after the user
    navigates away can't redirect or paint a dead screen.

## T15 — Plans page (frontend/pages/plans.js)  [11:08]
What I built: the Plans screen under the "Products & plans" section. A table lists plans
from the live DB (GET /api/plans, Karthik's T14) — columns: Name, Billing (daily/weekly/
monthly/yearly), Price (₹ right-aligned tabular), Min qty, Available (from → to window),
At term end (close policy). A "New plan" form creates one via POST /api/plans.

Key choices I must be able to explain:
  * Dynamic data (graded): the table reads the DB endpoint, never static JSON. Until T14
    lands it shows the error state + Retry — same contract-first pattern as my Products/
    Overview pages; it "lights up" automatically when the API arrives, no edit.
  * Validation client AND server (graded): name required; price → validators.js `price`
    rule; min qty → `quantity` rule (whole number; the SERVER enforces ≥1 per the schema
    CHECK, documented in the in-file contract); availability dates → `dateOrder` (end ≥
    start, error on the end field). Blur-time inline errors, submit re-validates all and
    focuses the FIRST failing field. Same validators.js module Avanthik owns, so the
    Python mirror shares the exact messages.
  * close_policy + billing_frequency are <select>s whose option values ARE the schema
    enums (renew/auto_close/early_close/pause and daily/weekly/monthly/yearly) — no free
    text, so the server never has to reject a typo.
  * Navigation: Plans is NOT a new sidebar row. DESIGN calls the section "Products & plans"
    (one destination). I made #/plans an AUX route in router.js (like login/portal) and
    added ACTIVE_FOR = {plans:'products'} so the sidebar's Products pill stays grey-lit
    while on Plans. The two pages cross-link in their headers (Products ⇄ Plans). This
    keeps the sidebar at 7 clean destinations.
  * Four states all ship (loading skeleton reusing the real table layout, empty sentence,
    error + Retry keeping last-good list, data); responsive via the shared table's 640px
    two-line fold; cleanup() sets alive=false so a late POST/GET can't paint after nav.

## 11:15 — T00 dry-run micro-task
- Built: `frontend/components/dryrun.js` → one pure util `clamp(n, lo, hi)` (keeps a
  number inside [lo,hi]; any non-number / NaN / Infinity returns `lo`). Plus
  `dryrun.selftest.mjs` (8 cases, runs under plain `node`) and `tests/test_dryrun_saurabh.py`.
- Why it exists: this was the scheduled 11:15 pipeline rehearsal — the point was to run
  the FULL worker cycle once on something tiny: claim the task on the board + push, write
  code, commit incrementally, green TEST_CMD, then close board/PROGRESS/NOTES. Not a demo
  feature — `dryrun.js` is clearly marked as dry-run only.
- Test design I reused (from Avanthik's T07): pytest can't run JS directly, so the wrapper
  has TWO tests — (1) a source-present grep that passes even with no node installed, and
  (2) a subprocess that runs the node selftest and `pytest.skip`s LOUDLY (never fails) when
  node isn't on PATH. So CI stays green on any machine.
- Must be able to explain: `clamp` guards non-finite input with
  `typeof n !== 'number' || !Number.isFinite(n)` → returns `lo` (NaN/Infinity/strings all
  collapse to the floor), so it never leaks a bad value into a chart scale or width later.
  Result: node selftest 8/8, full TEST_CMD 29/29.

## T18 — Subscriptions page (11:46)
- Built `frontend/pages/subscriptions.js`, the "Where does every subscription stand today?"
  screen. The router (my T06) already lazy-imports `./subscriptions.js`, so dropping the
  module in lit up the sidebar row automatically — no router edit needed.
- WHAT IT DOES: live table reading GET /api/subscriptions (Karthik's T17, DB-backed — dynamic
  data, never static JSON). Columns: number (identity), customer, plan, **status pill**, next
  billing date, total (₹ right-aligned tabular). A state filter dropdown above the table filters
  the ALREADY-FETCHED live rows client-side (instant, no extra round trip). Click or press
  Enter on a row → **detail view**: a 2-col meta grid (customer/plan/start/next billing/expiry/
  payment terms), a lines table (description/qty/unit price/tax %/amount), and a totals block
  (Subtotal / Tax / Total).
- NEW SHARED COMPONENT `frontend/components/pill.js` — `statusPill(label, tone)`. DESIGN rule:
  status pills are pale tint + dark text of the SAME hue (never saturated fill + white), ONE
  mark per row. Four tones map to the DESIGN token pairs: positive=green (active), warning=amber
  (confirmed = pending activation), negative=red (unused here, for cancelled invoices), neutral=
  grey chip (draft/quotation/closed = quiet). Invoices (T22) and Payments (T28) will reuse it.
- table.js got an optional 3rd arg `{ onRowClick }` — makes rows keyboard-operable buttons
  (Enter/Space, focus ring, hover). Backward-compatible: products/plans pass nothing and are
  unaffected.
- KEY DESIGN CHOICE to explain: the detail view paints the list-row stub INSTANTLY (we already
  have number/customer/plan/state/total), THEN fetches GET /api/subscriptions/{id} to enrich
  with lines + totals. So there's no blank-wait flash on drill-down, and if the detail fetch
  fails we keep the stub visible with a quiet inline Retry rather than wiping the screen. Totals
  prefer server-sent subtotal/tax_total/total but fall back to computing from the lines, so the
  numbers are honest even before T17 sends aggregates.
- Must be able to explain in Q&A: (1) dynamic data — table + detail both read live DB endpoints,
  the filter operates on live rows; (2) status pill = meaning not decoration (hue encodes
  lifecycle), DESIGN's pale-tint/one-per-row rule; (3) all 4 states ship (loading skeleton,
  empty sentence, error+Retry with last-good kept, zero/dash handled); (4) responsive — table
  folds to two-line rows <640px, meta grid + totals go single-column at 390px.
- STATUS: renders live once T17 (/api/subscriptions) lands; error+Retry until then (same
  products/overview/plans precedent). Verified: module served 200, /api/subscriptions 404
  pre-T17, TEST_CMD 35/35.

## 14:15 — module README accuracy (polish cycle, no task)
- Context for Q&A: by this point all my own tasks (T04/T06/T12/T15/T18/T46/T00) were DONE,
  and the pages I DIDN'T get to (invoices/discounts/payments/customers/portal) had been
  reassigned to Avanthik/Karthik in the 12:50 ABSORB while my cycles were failing. Those
  belong to them now — I did not take them back (only the integrator reassigns).
- What I did: with no task of mine left, I did the sanctioned "nothing-left" chore — a
  doc-only fix to `frontend/components/README.md`. It had drifted: it listed `form.js` and
  `chart.js` (never built — validation lives in Avanthik's validators.js; charts are a
  styles/overview task) and omitted the components that actually ship. Now it accurately
  documents table.js, kpi.js, pill.js, fmt.js, poll.js, auth.js, dryrun.js with their
  exports and the one-source rules (₹/IST via fmt.js, DESIGN table/pill rules, poll = the
  dynamic-data must-have).
- Why I touched nothing else: the open page-side audit findings (grey-dash wiring, poll
  AbortController timeout, overview IST offset) all live in MY code files but are the scope
  of T49, which Avanthik had CLAIMED. Editing those same files in parallel is exactly how
  the re-land squashes ate work earlier today, so I stayed clear. Explain: good coordination
  hygiene beat grabbing extra credit.
