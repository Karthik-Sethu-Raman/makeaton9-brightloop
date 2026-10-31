# TASKBOARD — single source of truth for what gets built

## Header (fill in tomorrow morning — agents read this every cycle)
- TEST_CMD: `scripts/ci.cmd` — a COMMITTED wrapper that installs deps then runs tests, e.g.
  `npm install --prefer-offline --no-audit && npm test` (or `pip install -q -r requirements.txt && python -m pytest -q`).
  It must be committed by 11:30 so every machine re-syncs its environment before judging main.
- RUN_CMD: `<one command to run the app for demo>`
- Stack: `<e.g. FastAPI + SQLite + vanilla JS frontend>`
- Task sizing: **5–15 min of agent work each** (cycle kill cap is 19 min). Split anything bigger.

## Ownership map (module → member; agents: stay inside your dirs)
| Member (-Member token) | NOTES file | Owns (directories/files) |
|---|---|---|
| Karthik (leader) | NOTES/Karthik.md | `<e.g. backend/api/ + repo-root config>` (also integrator) |
| Manu | NOTES/Manu.md | `<e.g. backend/models/ backend/livefeed/>` |
| Saurabh | NOTES/Saurabh.md | `<e.g. frontend/components/ frontend/pages/>` |
| Avanthik | NOTES/Avanthik.md | `<e.g. frontend/styles/ frontend/validation/ static/>` |

Shared (editable by all, per CLAUDE.md): TASKBOARD.md, PROGRESS.md, NOTES/*.md, DESIGN.md (read-only except integrator)

## Status legend
OPEN → CLAIMED @<time> by <member> → DONE | PARTIAL <note> | BLOCKED <reason>
(Integrator re-opens claims stale >45 min.)

## Tasks — keep value-ordered (top = most demo value). ~30 tasks, each 5–15 min.
> Format: `- [ ] **T01** (P1, owner: <m>, ~10m) description` — one line per task, never reordered mid-window (integrator edits Pn tags in place / appends GROOM: notes only).

- [ ] **T00** (P0, owner: each member, ~5m) dry-run micro-task per member: add one tiny utility function + its test in YOUR module. Used ONLY by the 11:15 dry-runs — never let a dry-run consume a real task.
- [ ] **T-V1** (P1, owner: <video-machine member>, ~15m) **`scripts/make-demo-video.mjs`** — the video recorder (spec: VIDEO-SCRIPT.md). If it doesn't exist when the window opens, the FIRST worker cycles finish it before any other task: no recorder → no video → wasted day. Target: committed by 14:00.

- [ ] **T01** (P1, owner: <m>, ~15m) <vertical-slice skeleton: app boots, one page, one API route, DB wired>
- [ ] **T02** (P1, owner: <m>, ~15m) <live data simulator writing to DB / WebSocket feed — the "dynamic data" must-have>
- [ ] **T03** (P1, owner: <m>, ~10m) <core UI page consuming live data>
- [ ] **T04** (P1, owner: <m>, ~10m) <input forms with full client+server validation>
- [ ] **T05** (P1, owner: <m>, ~10m) <navigation/menu wired, DESIGN.md tokens applied>
- [ ] **T06** (P2, owner: <m>, ~15m) <main judged feature #2, split into 2 tasks if bigger>
- [ ] **T07** (P2, owner: <m>, ~10m) <main judged feature #3>
- [ ] **T08** (P2, owner: <m>, ~10m) <empty/error/loading states for main views>
- [ ] **T09** (P2, owner: <m>, ~10m) <responsive 390px pass on main views>
- [ ] **T10** (P3, owner: <m>, ~10m) <README: setup, RUN_CMD, demo script>
- [ ] ... (fill to ~30; P1 = must exist by 16:00, P2 = should, P3 = nice)

## Claim log (append only)
<!-- e.g. `12:35 Manu claimed T03` -->

## Integrator log
<!-- integrator cycles append: what was fixed/groomed, every cross-module touch, LAST-GOOD SHA in FINAL -->
