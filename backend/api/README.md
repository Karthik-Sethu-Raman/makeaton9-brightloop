# backend/api — FastAPI application (owner: Karthik)

The app factory lives in `main.py` (`backend.api.main:app`): it serves the JSON API under
`/api`, mounts `static/` at `/` and `frontend/` at `/frontend`, and starts the livefeed
simulator in its lifespan. One router file per domain (auth, products, plans,
subscriptions, invoices, payments, discounts, reports) plus `validators.py` mirroring
`frontend/validation/validators.js` rule-for-rule — client and server validate identically
(graded must-have). Auth dependencies here enforce admin/staff/customer roles.
