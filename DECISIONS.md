# DECISIONS — pre-written rules so agents never need a human

## D1 — Dynamic data
"Real-time/dynamic data" is a graded MUST-HAVE. Source it locally: a simulator
thread/process that mutates state on an interval, exposed via WebSocket or polling
API, persisted to the local DB. Static JSON allowed ONLY as clearly-marked seed
fixtures for first boot. NO dependency on external internet APIs for core features.

## D2 — Tech additions
No new runtime dependency after 14:00 unless a P1 task is impossible without it.
No framework swaps, no rewrites, ever. Build on what exists at 12:00.

## D3 — Conflicts
Rebase conflict inside your own module: resolve it. Append-only conflicts in
TASKBOARD/PROGRESS/NOTES (both sides added lines): keep BOTH sides, never abort for
these. Anything touching another member's code module: abort that task, next one.
Integrator resolves anything.

## D4 — Broken main
If TEST_CMD fails at cycle start (after running ci.cmd's install step — dependency
drift mimics breakage), fixing main outranks all tasks. If you can't fix it in
15 min, mark it loudly in PROGRESS (`main RED: <symptom>`) and take a task that
doesn't depend on the break.

## D5 — Judgment calls agents may make alone
Rename/reorganize ONLY files in own module. Choose simpler over clever. Prefer
deleting scope over delivering broken. UI copy in English. IST everywhere. Feature
scope: when in doubt, build the version that demos in one screen.

## D6 — What agents may NEVER decide alone
Schema/DB migrations that drop data, deleting another member's files, changing
auth/secrets, anything in the repo root config, anything disqualifying per CLAUDE.md.

## D7 — End of window
After 15:45: no features. After 16:10: workers idle (log "window closed" row and end).
Integrator FINAL at 15:50 is the last code-touching cycle; it leaves main green and
pushes everything. VIDEO cycle at 16:10 touches nothing but PROGRESS.

## D8 — Stack (decided in advance by the team; agents do not relitigate)
`Python FastAPI + SQLite + vanilla HTML/CSS/JS frontend (no build step)`.
Why: no npm install/build chain (offline-robust), agents are highly reliable in it,
TEST_CMD is plain pytest, and DESIGN.md tokens drop straight into CSS variables.
Module split: Karthik = backend/api + repo-root config; Manu = backend/models +
backend/livefeed + scripts/ (incl. video recorder T-V1); Saurabh = frontend/pages +
frontend/components; Avanthik = frontend/styles + frontend/validation + static/.

## D9 — Naming (creative latitude granted to the bootstrap agent)
The bootstrap agent NAMES the app and picks the accent color from the problem's
world. Team name for the video end card: `<team name — fill tonight>`.
The humans ratify nothing; the choice stands.

## D10 — External facts and the human/agent boundary
- Repo: `github.com/<leader-github>/makeaton9-<shortname>` (public; the LEADER creates
  it in the morning, adds collaborators `vivp-odoo` + `hackathon-odoo`, and blocks
  force pushes on main)
- PORTAL AND YOUTUBE ARE HUMAN-OWNED. Agents NEVER open the portal or YouTube, never
  submit links, never create repos or invites. The leader submits the repo link and
  the video link, and uploads the video, personally (morning + after 16:45).
- GitHub CLI (`gh`) is authenticated on the leader's machine; agents may use it
  READ-ONLY to verify branch protection/collaborators and FLAG gaps in PROGRESS.

## D11 — Autonomy
Humans are unreachable 08:45–16:45 BY DESIGN (endsem prep + exam). Never wait, never
ask, never stall on a question — every block has a DECISIONS rule or a fallback. If
genuinely unprecedented: decide the reversible option, log the ruling in PROGRESS.md
as `[ruling] <what+why>`, continue. The agents' contract: progress every cycle,
honest PROGRESS rows, everything pushed.
