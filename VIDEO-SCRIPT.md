# VIDEO — fully autonomous. Humans never record, never narrate.

**Producer:** the 16:10 VIDEO cycle on Manu's laptop (cycle-prompt-video.txt).
**Recorder:** `scripts/make-demo-video.mjs` — built in the morning block (09:30–11:00) with
agent help, committed to the repo, dress-rehearsed once at ~11:30. If the morning runs
out, it is board task **T-V1 (P1)** — worker cycles finish it before any other task.
**Output:** `..\makeaton9-video\demo.webm` (outside the repo, never committed).
**Fallbacks (in order):** retry once → /brag render (pre-warmed) → `VIDEO FAILED` row →
2-minute silent manual take at 16:45.

## How the recorder works (spec for make-demo-video.mjs)
- Playwright chromium, context with `video: 'on'`, viewport 1280×800, ~15fps-friendly pacing.
- **Captions are injected INTO the page** as a fixed overlay div (bottom third, styled from
  DESIGN.md tokens: surface, ink, accent). Whatever the caption says is therefore burned
  into the footage — no editing, no voice, no post-processing.
- Slow, readable pacing: each scene holds 4–8 s. The whole walk is 60–180 s.
- Waits are explicit (`waitForSelector`, `waitForFunction` on a data counter changing) —
  never fixed sleeps on data that may be slow.

## Scene list (the captions write themselves from this table)
| # | Scene (page + action) | Caption overlay (text burned into footage) |
|---|---|---|
| 1 | Landing page, hold | **[App name]** — built for [PS title]. [One-line problem → solution.] |
| 2 | Live-data view, wait for values to visibly change 2–3× | Live data — updating from [mechanism] every [n]s. Not static JSON. |
| 3 | Hero flow #1: fill form correctly → submit → result | [What the flow does] |
| 4 | Same form: type an INVALID input → submit → validation error visible | Input validation — client AND server. |
| 5 | `setViewportSize(390, 844)` → layout reflows | Responsive — same app, phone width. |
| 6 | Navigate the menu through 2–3 sections | Clean navigation. |
| 7 | End card (a static page or overlay) | Stack: [stack]. Everything runs locally. Built by Karthik, Manu, Saurabh, Avanthik — all four committed. |

Every graded must-have appears on camera: dynamic data ✓ validation ✓ responsive ✓ navigation ✓

## Human steps at 16:45 (total ≈5 min, all pre-logged-in)
1. Read the `VIDEO READY @ <path>` row in PROGRESS.md (on Manu's laptop).
2. YouTube Studio (pre-logged-in at 11:30) → upload the file → **Unlisted**.
3. While processing: test the link in an incognito window.
4. Leader: paste link in portal → **green banner**. Submit v1 early (updates allowed to 17:30).

## If the recorder can't be built in the morning (T-V1 path)
The worker building it should keep it MINIMAL: even a 60-second recording of scenes 1, 2,
4, 5 with plain captions satisfies the submission. Do not gold-plate — a real, honest,
captioned walkthrough beats a fancy render that lands at 17:29.
