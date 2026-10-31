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



## 11:50 — T48 shell head polish
- Built: /favicon.svg link + meta description in both static pages; favicon art by the 11:40 cycle.
- Why: a favicon can't load tokens.css, so it is the ONE sanctioned hex location outside it — the file carries a comment naming the token each literal mirrors (--accent), per the task line. Meta description is DESIGN's tagline verbatim (index) so search/preview text matches the product story.
- Must be able to explain: why the favicon's hex is legal (isolated asset, cannot consume CSS vars, documented mirror) while the same hex in layout.css would fail the guard test (T47 lesson).


## 12:10 — T50 shared required() rule
- Built (cycle wrote, I closed): required(label) returns a BUILT RULE; validate() runs rule functions as-is; message template 'Enter <label>.' pinned in the contract test.
- Why a factory instead of a parameterized rule: the dispatcher keeps its (ruleName, value) shape — built rules compose like any other, and the label carries its article at the call site where the copywriter (page owner) controls the sentence.
- Must be able to explain: how the factory dodges extending validate()'s signature; why the template is pinned in a pytest test (message drift between js/py fails CI before demo); and the products.js migration being one line.


## 12:17 — T36 pass 2 (subscriptions + plans)
- Built: rules.minQuantity + 2 MSG sentences + selftest cases; audit summary for page owners.
- Why: the audit's best catch — plans.js validated min-quantity with the >=0 rule while the DB schema CHECKs >=1. The client said yes, the server said no, with a DIFFERENT sentence — exactly what the graded client/server parity requirement forbids. New rule: empty fails 'Enter a minimum quantity.' (NOT NULL column), 0/2.5/-1 fail 'Minimum quantity must be a whole number of 1 or more.', leading zeros ok.
- Must be able to explain: why quantity (>=0) and minQuantity (>=1) are separate rules instead of one parameterized rule — each rule is one fixed message pair, and the mirror contract pins message-per-rule; and how the audit found it (page's own header comment cited the schema CHECK).


## 12:31 — T52 amount rule + payment ceiling
- Built (cycle wrote, I closed): rules.amount (>=0, <=2dp) + paymentAmount(outstanding) factory; ceiling compares in integer PAISA.
- Why paisa: 8.1 * 100 = 810.000...01 in binary float — a raw 'payment <= outstanding' would randomly reject exact payments. Multiplying by 100 and rounding to integers makes the compare exact; the trap is commented at the compare site.
- Must be able to explain: the float trap with the 8.1 example; why the ceiling is a FACTORY (each invoice has its own outstanding — the bound is per-call context, not a global rule); MSG amtMax fires only when shape is already valid so the user sees one error at a time.


## 12:32 — T51 phone nav-sheet a11y
- Built: aria wiring + keyboard handling in static/index.html inline script (no build step, vanilla JS).
- Why: a checkbox-driven CSS sheet is invisible to keyboards — no Esc, no focus semantics, tab runs away behind the overlay. The label carries role=button + aria-expanded (checkboxes can't express expanded to AT reliably); the script syncs state both ways.
- Must be able to explain: why aria-expanded lives on the LABEL not the hidden checkbox; the Tab-trap set (menubtn + nav items + the focusable checkbox itself) and its wrap logic; why only Esc-close returns focus to the toggle (after a nav tap, focus belongs on the destination).


## 13:20 — T22 invoices page (first task in the absorbed pages module)
- Built: frontend/pages/invoices.js ONLY — it consumes the existing shared components (table/pill/
  fmt/auth) and layout.css's state classes (.cad-stateblock/.cad-flash/.cad-dash/.cad-linkbtn);
  no CSS file touched, so no token-guard exposure. The /api/invoices contract (list, detail,
  POST /{id}/confirm|cancel|send, 409 {"detail": sentence}) is documented in the file header for
  Karthik's T21 — the T12/T15/T18 page-before-API precedent.
- Why this way: the screen's question is "What was billed, and what is still unpaid?" so
  OUTSTANDING is the answer figure — it gets the rightmost table column, a "Balance due" totals
  line, a Due/Was-due note, and drives the filter; overdue is computed in IST
  (en-CA locale gives ISO dates, which compare correctly as strings) and overrides the pill with
  the negative tone because red-past-due says more than amber-confirmed on a late bill.
- Must be able to explain: (1) the 0.005 epsilon in the overdue/outstanding checks — float dust
  from total-minus-paid must not flip a fully-paid invoice to "Overdue"; (2) why cancel is an
  ARMED two-step button in its own bordered section with consequence words — DESIGN's destructive
  law demands separate section + consequence + a confirmation that NAMES the object; the 6-second
  disarm timer stops an armed nuke sitting on screen; (3) why focus jumps to the flash line after
  an action — the state change repaints away the button that held focus, which would drop
  keyboard users to <body>; (4) why action POSTs carry authHeaders (x-auth-token when signed in,
  no-op when not — RBAC-ready for T32 with zero rework); (5) why the server's 409 sentence is
  shown VERBATIM in the error flash — client/server message parity is the graded must-have, and
  the browser is where the judges see it; (6) pre-T21 the page's error+Retry state is the
  DESIGNED degraded behaviour (verified live: module 200, /api/invoices 404), not a bug.


## 12:50 — T53 live auth-flow audit
- Built (cycle wrote the 33-check script, I ran+closed): frontend/validation/authflow.audit.mjs — boots real uvicorn on a temp DB, exercises signup/login/me/forgot/reset end-to-end incl. DOM-level checks (focus log, aria wiring, error-node lifecycle) in a real browser context.
- Why a script instead of a one-off pass: the audit is RERUNNABLE — any future auth change re-proves the graded must-have in one command, and the 33 checks document exactly what 'client AND server validation, same messages' means operationally.
- Must be able to explain: the J1/J2/L1 triple — weak password gets the exact mirrored sentence, the failed try does NOT burn the token (single-use only after SUCCESS), and a used token 404s with the expired sentence; and why DOM checks (focus log) belong in an audit, not just HTTP status asserts.


## 14:15 — T49 anti-pattern fixes, shared-first
- Built: print stylesheet (T41) + fillCell .cad-dash wrap (table.js) + five invoices.js fixes (loading flag, lastGoodAt+Retry, mergeFresh, 422 array, auth/IST/re-arm nits).
- Why shared-first: every 20-min cycle that builds a page re-commits the same three anti-patterns (false-empty, silent refresh, black dash) because each page hand-rolls its states. Fixing fillCell once retires the dash pattern for every table past and future; the loading-flag and lastGoodAt patterns are now the documented page recipe (T22-verify + discounts already follow).
- Must be able to explain: why mergeFresh DELETES keys (Object.assign keeps stale older values for keys the fresh response omits — a cancelled invoice kept showing its pre-cancel outstanding); the +05:30 date pinning (date-only strings parse as browser-local, one day off east of IST); and the two re-land eats + byte-exact restores (stale-tree re-lands remain the day's systemic hazard).


## 14:43 — T28 payments page
- Built: frontend/pages/payments.js — record form + list, all T49 laws baked in from the start; T27 API contract documented in-file.
- Why the two blockers matter for Q&A: (1) importing a name a module doesn't export is a LINK-TIME error in ES modules — the route died silently into the router's 'being built' placeholder while pytest stayed green; the defense is a node import smoke (import('./payments.js') links OK), now part of my close-out habit. (2) paymentAmount(outstanding) captures its bound AT BUILD TIME — passing a getter function meant String(fn)→NaN→no bound→shape-only; the per-invoice ceiling needs a wrapper RULE that re-runs the factory with the live picker value on every validation. My code comment claimed the wrong behavior — the verify pass caught the comment lying.
- Also: third stale-tree re-land deletion today (Manu's d5a0840 ate the file an hour after T08's); restored from my commit + fixed forward.
- Must be able to explain: the link-smoke defense; the wrapper-rule pattern for context-dependent validation; the IST date default (en-CA locale trick) vs toISOString's UTC day.


## 15:01 — T30 customers page (my last page build)
- Built: frontend/pages/customers.js — list-only internal view, name-sorted client-side, T29 contract documented (bare array OR {customers:[...]}, counts integer, outstanding rupees-or-null-for-dash).
- Why list-only before the freeze: T29's detail shape isn't pinned; a half-guessed drill-down near 15:45 risks more than it earns. The graded surface (consistent list, four states, validation-free read-only) lands clean.
- Must be able to explain: the row-sanitize fix (a null element in the response array would throw inside the sort; inside the catch path that throw escapes as an unhandled rejection and strands the skeleton — filter at assignment); and the four re-land deletions today (T08 auth, my T47 CSS, payments.js, customers.js — all restored from commits; the defense is post-push existence checks on files you just landed).

