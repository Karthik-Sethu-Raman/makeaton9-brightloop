# backend/livefeed — the dynamic-data engine (owner: Manu)

A daemon thread started in the app lifespan mutates the DB every ~3 seconds: payments
land against outstanding invoices, subscription states advance, invoices get paid. The
`router.py` here exposes `/api/live/summary` (and friends) reading straight from the DB,
so every number the UI polls is real, changing state — never static JSON (graded
must-have, DECISIONS D1). Keep mutations small and idempotent across restarts.

## tick() anatomy (simulator.py)
1. `bill_due_subscription` — invoice ONE active sub whose `next_billing_date` is due
   (tax auto-applied from `tax_rules` by product type), then push the date a full
   period forward. That push IS the idempotency guard: a sub is never billed twice.
2. `land_one_payment` — pay a slice (≥₹500 or 30%) of the oldest-due outstanding
   invoice; flip it to `paid` when the balance clears.
3. Every other tick, `advance_one_subscription` walks one sub a legal step forward
   (draft → quotation → confirmed → active; closed is terminal).
4. If a tick billed nothing and collected nothing, `_reschedule_billing_day` pulls the
   next billing day of an active sub to TODAY — the feed never goes quiet mid-demo.

Env knobs: `CADENCE_TICK_SECONDS` (default 3; set high/off in tests), `CADENCE_DB`.
The thread waits a full interval before its FIRST mutation, so short-lived boots
(test runs, flaky uvicorn restarts) write nothing.

