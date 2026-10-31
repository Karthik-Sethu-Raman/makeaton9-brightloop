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
