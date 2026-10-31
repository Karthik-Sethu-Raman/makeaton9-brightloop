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

## 10:34 — T33 forgot-password / reset page
- Built: static/reset.html (+ auth-page section in frontend/styles/layout.css: .cad-auth*, .cad-btn-primary,
  phone 16px margins + 44px touch target).
- Why this way: one standalone page covers the whole statement scene — no ?token= asks the email (POST
  /api/auth/forgot) and shows the generated link in the response (no mail server in the demo); ?token= sets the
  new password (POST /api/auth/reset). No sidebar: the screen has zero nav destinations, which DESIGN's shell
  rule explicitly allows. The API contract lives in a comment at the top of the file for Karthik's T08, including
  the server-side stdout log of the link (the task line's "response/log" second channel).
- Must be able to explain: (1) the gate bug the verify pass caught — validateForm returns {ok, first}, an object,
  so `!validateForm(...)` was ALWAYS false and invalid input still POSTed; the gate must be `.ok`;
  (2) why the reset link is built with createElement + textContent and only accepted when it starts with
  '/reset.html?token=' — response data is never parsed as HTML (injection vector) and the shape check enforces
  the contract + same-origin; (3) why Retry reloads ONLY on network failure — a reload would discard what the
  user typed on a correctable error like a weak password; (4) the synchronous pre-paint script that flips forms
  for ?token= visitors so they never see the email form flash while the module loads.

## 10:51 — T44 shared auth styling (closed out for the 10:40 cycle)
- Built: .auth-shell/.auth-card/.auth-h1/.auth-lede/.auth-form/.btn-primary canonical classes in layout.css
  (cad-auth* kept as aliases), reset.html refactored onto them, styles README docs. Code was written by the
  10:40 SCHEDULED cycle (it died at max-turns before bookkeeping); I audited + closed it.
- Why this way: login (T46) and reset (T33) are the same screen archetype — one card, centred, no sidebar —
  so one set of classes keeps them pixel-identical and gives every future form (discounts, plans) the same
  base. Aliases stay so nothing breaks mid-flight; new code must use the canonical names.
- Must be able to explain: (1) what I audited before putting DONE on the cycle's work — the .ok validation
  gate, the DOM-built contract-shape-checked reset link, retry-only-on-transient, pre-paint toggle, no hex
  outside tokens.css; (2) why aliases instead of a rename — 4 agents push to main continuously; a hard rename
  would break any in-flight page importing the old class names mid-window.

## 10:50 — T45 shell a11y
- Built: skip-to-content link (static/index.html) + reduced-motion media guard (layout.css).
- Why this way: the link is the FIRST focusable element so Tab before anything else offers the skip; it lives off-screen (left:-9999px) and only enters view on :focus, so mouse users never see it. The reduced-motion block is a guard for future component CSS — nothing animates yet.
- Must be able to explain: why :focus (not :focus-visible) on the skip link — it must appear for ANY focus, including Click-me-TAB flows; and why the global motion kill uses !important (component animations must lose to the OS preference, always).

## 11:15 — T07 validators close-out (own PARTIAL → DONE)
- Built: frontend/validation/selftest.mjs + tests/test_validators_contract.py (+ one README line)
- Why this way: T07's two REMAINING items were cross-module and both resolved OUTSIDE my dirs —
  signup wiring landed with Saurabh's T46 login.js (verified: it imports attachBlurError/
  validateForm and gates the POST on `v.ok`, the same dead-gate bug I caught on reset.html),
  and the server mirror is T08's own line per the board. What was actually missing was
  REPEATABLE proof: my "adversarially verified" was a one-time manual pass. The selftest
  executes the pure rules under plain node (no DOM needed — setError/blur wiring is browser
  work), and the pytest file runs it inside TEST_CMD while pinning all 9 MSG strings
  verbatim, so any edit that breaks client/server message parity fails CI before T08 lands.
- Must be able to explain: (1) the emoji password case '\u{1F600}Abcdef!' — it is 8 code
  points but 9 UTF-16 units, so it FAILS the >8 policy under correct code-point counting
  while a buggy `.length` implementation would PASS it; Python's len() counts code points
  too, which is why the mirror is safe; (2) why the pytest SKIPS instead of failing when
  node is absent — the always-on guard is the pinned message strings; the behavioral run is
  bonus, and a skip can never turn main RED on a machine without node; (3) tests/ is
  append-your-own-file territory per the board header — test_validators_contract.py is a NEW
  file, no one's test was edited.


## 11:18 — T36 states audit, pass 1
- Built: .cad-stateblock + .cad-dash in layout.css, 44px .cad-linkbtn hit-area (padding + negative margin trick), reset.html Retry re-submit.
- Why this way: the audit fan-out (5 parallel readers) found the grey-dash law was UNIMPLEMENTABLE from shared CSS — no class existed. Adding it in layout.css means Saurabh's fix is one wrapper span, and every future screen gets states classes for free.
- Must be able to explain: (1) the negative-margin hit-area trick — padding grows the touch target to 44px, margins pull the layout back so nothing moves; (2) why Retry now calls form.requestSubmit() — a reload discards typed input, re-submit keeps it and re-runs the validation gate; (3) --faint chosen for the dash: 4.76:1 on surface, above the 4.5:1 text law.


## 11:33 — T37 responsive 390px pass (+ board recovery)
- Built (cycle wrote, I verified/closed): index.html nav checkbox + Menu label + hashchange auto-close; layout.css phone sheet rules. Also: RECOVERED the board after the 11:25 re-land squash ate the integrator's T08 DONE block, T47-T50 tasks and log line (verbatim restore from 49eece8).
- Why the sheet, not bottom nav: DESIGN caps bottom nav at 5 destinations; the app has 7 — so the sanctioned alternative (48px top bar + menu sheet) is the one legal fold. Pure CSS via #cad-navtoggle:checked ~ .cad-nav keeps it working even if JS dies; the tiny hashchange script only CLOSES the sheet after navigation.
- Must be able to explain: (1) the sibling-selector trick — the checkbox must sit BEFORE the nav in the DOM so :checked ~ reaches it; (2) why the checkbox stays focusable (screen-reader/keyboard users Tab to it, :focus-visible + .cad-menubtn shows the ring); (3) the re-land squash: how a push-rejection recovery (reset --soft + add -A + commit) can silently drop the OTHER side's both-sides-appended board lines, and why you re-diff shared files against origin after any wip re-land.


## 11:35 — T47 inline-feedback classes
- Built: .cad-flash/--ok/--err in layout.css + consumption convention in styles README.
- Why: every list-page form (products create, discounts, plans) needs the same 'Saved'/'failed' line; one class keeps the whole app's POST feedback identical and token-pure (--positive ≈5.3:1, --negative, no new hex). role=status (ok) vs role=alert (err) so screen readers announce errors assertively but successes politely.
- Must be able to explain: why the a11y roles differ between ok and err variants; and that the busy() pattern (label swap + disabled with legible opacity) comes from reset.html and is the documented convention.


## 11:44 — re-land of T37/T47 bookkeeping + T47 code (second squash recovery)
- Built: nothing new — restored what the 11:34 wip re-land ate: T47's .cad-flash block + README paragraph (re-committed eec7771), T37's DONE block, both NOTES sections, three PROGRESS rows.
- Why this way: the re-land was committed from a STALE tree one minute after my 11:33 commits, so the commits live in history but HEAD's file content had my hunks deleted. Recovery = diff the squashed files against the pre-squash commits (git show) and re-apply verbatim — never from memory.
- Must be able to explain: how to DETECT this class of loss — `git log -- <file>` shows your feat commit, but `git diff <feat-sha> HEAD -- <file>` shows your hunks missing; log alone says "landed", only the diff tells the truth. This is the 3rd squash incident today (11:25, 11:34) — always re-diff shared files + own modules against your last known-good SHA after any `wip(...): re-land` commit.


