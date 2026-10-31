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
