# frontend/styles — the design system as CSS (owner: Avanthik)

`tokens.css` is DESIGN.md's :root block VERBATIM — the single source of color, spacing
and type. `layout.css` builds the shell (224px sidebar on page ground, one 16px gutter,
cards with shared bottom edges) and `components.css` the pieces. NO hex/rgb literals in
any other file, ever; reference `var(--...)` only. Responsive rules live here too: the
390px fold (top bar + sheet or bottom nav, two-line table rows).

Auth pages (T44, shared by login + static/reset.html): use `.auth-shell` (centred,
no-sidebar page column — DESIGN allows no sidebar at ≤5 destinations) wrapping an
`.auth-card`, `.auth-h1`/`.auth-lede`, `.auth-form` with `.btn-primary` (ONE per screen)
and `.field-error`/error-summary typography matching the validators.js message contract.
`cad-auth*` spellings are kept as aliases — do not use them in new code. Phone block
drops page padding to `--gap` and raises buttons to the 44px touch target.

Inline POST feedback (T47, for forms on list screens): after a create/update call,
swap the submit label + disable during flight (the `busy()` pattern in
static/reset.html), then render `<div class="cad-flash cad-flash--ok" role="status">`
(or `--err` with `role="alert"`) beside/under the form — "Saved", "Invoice confirmed".
Never a full-screen banner. State blocks (empty/error with Retry) use `.cad-stateblock`
/ `--err`; missing values use `.cad-dash` (T36).
