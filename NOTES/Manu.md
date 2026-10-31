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
