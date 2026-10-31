# NOTES — Avanthik — Q&A prep

> Agent appends here every cycle. In the evening YOU read this + `git log --author="<your-email>" --stat`
> and make sure you can explain every line committed under your name — the evaluator's
> Q&A round generates questions from YOUR commits matched to your GitHub account.

## <time> — T<id> <title>
- Built: <files>
- Why this way: <1-2 lines>
- Must be able to explain: <the tricky bit to study>

## 09:37 — T05 design tokens + app shell
- Built: frontend/styles/tokens.css, frontend/styles/layout.css, static/index.html
- Why this way: tokens.css is DESIGN.md's :root block copied VERBATIM (law — workers never
  change tokens), so every color in the app resolves through var(--...) and the UI can't drift
  from the design system. layout.css holds the shell (224px sidebar on page ground, grey active
  pill = the --active token, NOT a new hex, because no color literals are allowed outside
  tokens.css) and index.html carries only structure: the copper-ring SVG mark (classes styled in
  layout.css, again no inline colors), the wordmark, an EMPTY #nav for Saurabh's T06 router, and
  the #view mount page modules render into.
- Must be able to explain: (1) why the active nav pill uses var(--active) instead of the #eeeeee
  DESIGN quotes — the no-hex-outside-tokens rule wins, and --active IS the token for this;
  (2) grid arithmetic: page = 224px + 1fr, cards = auto-fit minmax(220px,1fr) + 16px gap, sums
  written in comments because DESIGN demands closing arithmetic; (3) the 720px media query folds
  the sidebar into a 48px top bar so 390px never scrolls horizontally (T37 does the full pass);
  (4) mark geometry: dot sits at the two-o'clock tick — cx 16.9/cy 6 on a r=8 ring around
  (10,10), i.e. 10+8·sin60°, 10−8·cos60°.

## 09:52 — T07 client validators (PARTIAL)
- Built: frontend/validation/validators.js, forms section of frontend/styles/layout.css,
  mirror contract in frontend/validation/README.md
- Why this way: one MSG table is the canonical contract — the server (T08, Karthik) copies it
  byte-for-byte so client and server literally cannot disagree. Blur shows the error under the
  field; validateForm re-renders on submit and focuses the FIRST error (DESIGN forms law).
  Status honestly PARTIAL: signup-form wiring waits for the page (Saurabh) and the server mirror
  waits for T08 — neither is my module.
- Must be able to explain: (1) the mirror traps — JS `\d` is ASCII-only but Python's matches
  Unicode digits (so the Python side must use `[0-9]`), and password length counts CODE POINTS
  (`[...v].length` in JS = `len()` in Python; UTF-16 `.length` would disagree on emoji);
  (2) why one message per rule, not per failure-reason — identical client/server strings are the
  graded requirement, and one sentence per rule makes parity testable; (3) the a11y wiring —
  aria-invalid + aria-describedby APPENDED (never clobbering a field hint) and restored on clear;
  (4) dateOrder takes [from, to] strictly and throws on a bare value so a forgotten pair can
  never silently validate as ok.

## 10:26 — T06 boot seam (SPA switch-on)
- Built: one line in static/index.html — `<script type="module" src="/frontend/pages/router.js">`
  before </body> (plus a 2-line comment).
- Why this way: Saurabh's router (T06) was complete but nothing loaded it — the shell rendered a
  dead, empty sidebar. `type="module"` scripts are deferred by spec, so the script runs AFTER the
  #nav/#view elements above it exist; no defer/DOMContentLoaded wiring needed in the shell. The
  path is absolute `/frontend/...` because the FastAPI plan (architecture note 1) mounts the
  frontend/ dir at /frontend on the same origin — no CORS, no build step.
- Must be able to explain: (1) how it was verified WITHOUT a backend (T01 hasn't landed):
  served the repo root with `python -m http.server` to mirror the planned mounts, then fetched
  every URL the boot requests — 11/11 returned 200 (2 stylesheets, router.js, overview.js +
  products.js, the fmt/kpi/poll/table components, validators.js), and both page modules export
  the `render(mount)` the router calls; (2) why missing routes (invoices etc.) DON'T break boot —
  router.js lazy-imports per route and catches the failure into a DESIGN empty-state; (3) until
  T01+T03 land, Overview correctly shows its ERROR state (fetch /api/live/summary 404s) — that is
  the designed degraded behaviour, not a bug.
