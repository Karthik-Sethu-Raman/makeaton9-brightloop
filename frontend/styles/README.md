# frontend/styles — the design system as CSS (owner: Avanthik)

`tokens.css` is DESIGN.md's :root block VERBATIM — the single source of color, spacing
and type. `layout.css` builds the shell (224px sidebar on page ground, one 16px gutter,
cards with shared bottom edges) and `components.css` the pieces. NO hex/rgb literals in
any other file, ever; reference `var(--...)` only. Responsive rules live here too: the
390px fold (top bar + sheet or bottom nav, two-line table rows).
