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
