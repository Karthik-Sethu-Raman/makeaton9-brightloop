# frontend/components — reusable renderers & helpers (owner: Saurabh)

Native ES modules, no frameworks and no build step; pages import them by relative path.
Styling is via tokens only (`../styles/tokens.css`) — never a hex literal here. Every
number renders through `fmt.js` so ₹ grouping, decimals, percentages and IST times are
identical on every screen. These are the modules that actually ship (keep this list in
sync when you add one):

- **`table.js`** — `renderTable(columns, rows, opts)` + `renderTableSkeleton(columns, n)`.
  DESIGN table rules in one place: sentence-case grey headers, no zebra, 1px row rules,
  numbers right-aligned with `.num` tabular figures, identity column truncated. Folds to
  two-line stacked rows below 640px (no horizontal scroll — the 390px responsive rule).
  `opts.onRowClick` makes rows keyboard-operable (Enter/Space, focus ring) for drill-down.
- **`kpi.js`** — `renderKpiStrip(items)`: ONE container split by 1px rules (no icon
  circles, no sparklines), tabular values, used by the Overview KPI strip.
- **`pill.js`** — `statusPill(label, tone)`: pale-tint + same-hue dark text status chip,
  one per row (tones: positive / warning / negative / neutral). Lifecycle = colour.
- **`fmt.js`** — formatting single source: `inr` (₹ en-IN, 2dp), `count` (int en-IN),
  `pct` (1dp + "%"), `istTime` (HH:MM in Asia/Kolkata), and `DASH` (em dash). Missing /
  NaN / non-finite → grey dash; a real `0` still prints (`₹0.00`, `0`).
- **`poll.js`** — `createPoller(url, intervalMs, {onData, onError})`: fetches a JSON
  endpoint now and on an interval, never stacks overlapping requests, keeps last-good
  values on error. The dynamic-data must-have (DECISIONS D1): the UI reads changing DB
  state, never static JSON.
- **`auth.js`** — browser session store: `getToken/getUser/isAuthed/setSession/
  clearSession`, `authHeaders()` (adds `x-auth-token`), `landingHashFor(role)`, and
  `readAuthBody()` which normalises the auth response shape.
- **`dryrun.js`** — `clamp(n, lo, hi)`, the 11:15 pipeline dry-run util (clearly dry-run
  only, with `dryrun.selftest.mjs`); not a product feature.

Charts (revenue-over-time on the finance overview) are DESIGN chart-rule work tracked
under the styles/overview tasks, not a component here.
