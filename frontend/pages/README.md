# frontend/pages — one ES module per screen (owner: Saurabh)

Each screen (overview, subscriptions, products, plans, invoices, payments, discounts,
customers, portal) is a native JS module exporting a render function; a tiny hash router
in `router.js` swaps them into the app shell. Pages fetch from `/api/*`, use components
from `../components/`, styles only via tokens (`../styles/tokens.css`), and every number
renders with the `.num` tabular-figures class. Each screen answers its DESIGN.md question.
