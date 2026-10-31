# NOTES — Manu — Q&A prep

> Agent appends here every cycle. In the evening YOU read this + `git log --author="<your-email>" --stat`
> and make sure you can explain every line committed under your name — the evaluator's
> Q&A round generates questions from YOUR commits matched to your GitHub account.

## <time> — T<id> <title>
- Built: <files>
- Why this way: <1-2 lines>
- Must be able to explain: <the tricky bit to study>

## 10:07 — T-V1 demo-video recorder
- Built: scripts/make-demo-video.mjs, scripts/package.json, scripts/package-lock.json
- Why this way: captions are injected INTO the page as a fixed div styled ONLY with
  var(--surface/--text/--accent/--font) DESIGN tokens, so the text is burned into the
  footage in the app's own design system — no voice, no editing, no post-processing
  (VIDEO-SCRIPT.md spec). Scenes are best-effort: a page that doesn't exist yet logs a
  warning and skips its scene instead of failing the take. The recorder boots and kills
  uvicorn itself so the 16:10 VIDEO cycle is one command. npm deps are dev-only inside
  scripts/ — the app runtime still has zero npm/build step.
- Verified this cycle: node --check; chromium launches (156.0.8078.4 headless);
  recordVideo flushes a real .webm on this laptop (46KB probe). NOT yet rehearsed
  against the live app — that is T09, once T01 (server) + T03 (live feed) land.
- Must be able to explain: (1) Playwright recordVideo is context-level; the file only
  flushes on context.close(), then the recorder renames it to
  ..\makeaton9-video\demo.webm (outside the repo, gitignored). (2) Scene 2 waits with
  waitForFunction polling .cad-kpis innerText until it CHANGED twice — never a fixed
  sleep on live data (spec rule). (3) How to run: cd scripts && npm install &&
  npx playwright install chromium, then node make-demo-video.mjs (--only 1,2,5
  rehearses a subset). (4) Fallback if it fails at 16:10: retry once, then the
  VIDEO FAILED row + 2-min silent manual take (VIDEO-SCRIPT.md).

## 10:37 — T02 models layer (SQLite schema + seed)
- Built: backend/models/db.py, schema.py, seed.py, passwords.py, __init__.py exports;
  tests/test_models.py + tests/test_seed.py (12/12 via TEST_CMD).
- Why this way: CHECK constraints encode every business enum (sub state machine,
  invoice states, roles, payment methods) so bad data can't enter even through raw
  SQL — the API layer (Karthik) becomes a second gate, not the only one. Seed dates
  are computed RELATIVE TO BOOT DAY (not hardcoded 2026-10-xx) so the demo always
  shows a live month: two subs due "today", one invoice overdue since yesterday.
  Seed runs once, guarded by app_meta key 'seeded' — restarts and the livefeed
  thread can never duplicate it.
- Fixed this cycle (resumed after the killed 10:13 cycle): the discounts INSERT had
  11 placeholders for 12 columns — seed crashed there, so it had NEVER actually run
  end-to-end; and INV-0003's GST was 2526.78 instead of 2525.58 (18% of
  15590 − 1559 discount = 14031 × 0.18). Lesson: write the test that RUNS the seed
  before believing the seed.
- Must be able to explain: (1) WAL mode = the livefeed thread writes while API
  requests read concurrently; each caller opens its OWN connection, none shared.
  (2) dict row factory → rows return straight from sqlite to FastAPI as JSON.
  (3) Money = REAL rupees, rounded 2dp at write time; dates ISO text, IST.
  (4) Demo logins (fixture, not secrets): admin@brightloop.test/Admin@12345,
  staff@brightloop.test/Staff@12345, shop@aralamstores.test/Shop@12345 — passwords
  hashed stdlib PBKDF2-SHA256 200k iters, format pbkdf2_sha256$iters$salt$hash.
  (5) Numbering: SUB-0001/INV-0001 continue via MAX(numeric suffix)+1.

## 11:12 — T03 livefeed simulator (the dynamic-data engine)
- Built: backend/livefeed/simulator.py (tick engine + start()/stop() daemon thread) +
  backend/livefeed/router.py (GET /api/live/summary) + tests/test_livefeed.py (8 tests).
  Code was landed by the 10:56 cycle that got killed right after pushing; this cycle
  live-verified it and closed the board.
- Why this way: every tick is a REAL SQLite write (WAL, one connection per tick) —
  "dynamic data" is graded, so nothing is faked in memory or served from static JSON;
  the overview page just polls /api/live/summary every 3s and the numbers genuinely
  move because the thread keeps mutating the books. Each tick does at most 3 small
  mutations (bill one, pay one, occasionally advance one state) so the demo shows a
  readable stream of events, not a screen redrawn every second.
- Verified this cycle: TEST_CMD 27/27; booted the app in-process with 1s ticks —
  /api/live/summary 200, and in 3s revenue moved 15518.86 → 18822.96 (simulated
  upi/cheque payments), overdue 1 → 0 (payments chase the OLDEST-due invoice first).
- Must be able to explain: (1) Idempotent billing: the moment an invoice exists for a
  due subscription, next_billing_date is pushed a full period forward — a re-run can
  never double-bill; that date IS the guard, no extra lock needed. (2) The thread
  waits its FIRST full interval before mutating, so short-lived boots (pytest,
  health checks) write nothing — CADENCE_TICK_SECONDS env tunes the interval (3s
  demo, 60s in tests). (3) Why the feed never goes quiet: when nothing is due and
  nothing is owed, _reschedule_billing_day pulls the next billing day of the
  longest-waiting active subscription to today — fresh work is scheduled, never
  silence. (4) Payment slices are max(30% of total, ₹500) so collection looks
  gradual; an invoice flips state to 'paid' when remaining ≤ 1 paisa. (5) start()
  is guarded by a lock + is_alive check (never two threads), stop() signals the
  event and joins with a 2s timeout — wired by T01's app lifespan, so uvicorn
  Ctrl+C also stops the feed cleanly.

## T09 — video dress rehearsal (DONE @12:01, cycle of 11:50)


What I built/verified this cycle: ran scripts/make-demo-video.mjs end-to-end against
the real booted app (it spawns uvicorn itself, records Playwright chromium 1280x800,
kills the server after). All 7 scenes passed with zero warnings on the first full
take; output landed at ..\makeaton9-video\demo.webm (1.7 MB, ~70 s — inside the
60-180 s spec). Nothing skipped: live-data wait caught the KPI strip changing twice,
the hero flow signed a real account up through the real API and observed the
redirect, the invalid-input take showed the inline field error, navigation used real
sidebar clicks, and the end card rendered and flushed to disk.

Also this cycle (worth knowing in Q&A): I found Karthik's whole T08 auth feature
(auth.py, validators.py, 19 tests, the router include in main.py) had been SILENTLY
DELETED from main by the 11:34 'wip re-land' commit that was built from a stale
tree — the suite even stayed green because the deleted tests went with it (48 -> 35).
I restored everything verbatim from commit 7897c19 and verified 54/54; meanwhile
Avanthik's 11:54 cycle pushed the identical restore, so git dropped my duplicate on
rebase — main ended up whole either way.

Key design choices to be able to explain:
- Captions are INJECTED INTO THE PAGE as a fixed overlay div styled only with
  DESIGN.md CSS variables — the text is burned into the footage, so the submission
  needs no editing, voice, or post-processing.
- Waits are explicit, never sleeps-on-data: scene 2 uses waitForFunction counting
  visible changes of the .cad-kpis strip; scene 3 waits for location.hash to leave
  #/login rather than guessing a delay. Fixed sleeps are only used to hold a frame
  readable on camera.
- Each scene owns its navigation and re-shows its caption AFTER page.goto, because a
  full load destroys an injected div — a caption shown before the goto never films.
- Signup form fills BOTH password fields (password + confirm): the submit gate
  rejects mismatched confirm, and Playwright strict mode would fail on ambiguous
  .fill() anyway.
- Fallbacks everywhere: server down -> recorder boots it; a scene's page missing ->
  warn + skip that scene, never kill the take; --only=3,4 filter for quick re-takes.

[Section restored @12:15 by Manu — the 11:55:59 wip re-land (7149277, stale tree)
deleted these 37 lines from NOTES even though the commit itself stayed in history;
verbatim from a9b14db.]

## 12:55 — T11 product variants model + the +₹560 pricing law

- Built: backend/models/variants.py + tests/test_variants.py (10 tests; suite 83/83).
  The 12:32 cycle claimed T11 and its wip auto-commit (ff2003e) landed the full
  implementation + tests before the cycle died; this cycle verified 83/83 and closed
  the board — no new code needed.
- Why this way: ONE function owns variant pricing. `unit_price(conn, product_id,
  variant_id)` = product.sales_price + variant.price_delta, and `price_line()` turns
  (product, variant, qty, tax%) into a ready-to-insert subscription/invoice line dict.
  The SEED fixture (999 + 560 = 1559, the statement's Odoo example) and any future
  caller (T20 billing run, the livefeed, a variants API) all go through the same two
  functions — plus a drift-guard test re-prices EVERY seeded subscription line through
  price_line() and asserts byte-equal description/unit_price/amount, so the hand-written
  fixture and the code can never disagree.
- Safety choice to explain: a variant_id that doesn't exist, or belongs to a DIFFERENT
  product, raises a ValueError — never a silent fallback to the plain price. Billing
  must never charge a mismatched product/variant pair; loud failure beats quiet wrong
  money. Same philosophy for create(): the schema's UNIQUE(product, attribute, value)
  becomes a friendly "already has a brand 'Odoo' variant." sentence, not an IntegrityError.
- Must be able to explain: (1) why the description convention "Cadence Books (brand:
  Odoo)" is built in price_line() — seeded rows and freshly priced rows are
  indistinguishable in the invoices UI. (2) list_for_product orders cheapest delta
  first so UI dropdowns are stable. (3) The 4 seeded variants: Books brand Odoo +560,
  Books brand Tally +0, Inventory brand Odoo +560, Inventory tier Multi-warehouse +400.
