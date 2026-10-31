# backend/livefeed — the dynamic-data engine (owner: Manu)

A daemon thread started in the app lifespan mutates the DB every ~3 seconds: payments
land against outstanding invoices, subscription states advance, invoices get paid. The
`router.py` here exposes `/api/live/summary` (and friends) reading straight from the DB,
so every number the UI polls is real, changing state — never static JSON (graded
must-have, DECISIONS D1). Keep mutations small and idempotent across restarts.
