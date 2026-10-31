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
