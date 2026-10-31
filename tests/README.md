# tests — pytest suite (steward: Karthik, append-only per owner)

`scripts/ci.cmd` (TEST_CMD) installs requirements then runs `python -m pytest -q` from the
repo root. Each member ADDS files named `test_<topic>.py` for their module and never edits
another member's test file. Server-side validation, billing idempotency, RBAC and the
live endpoints all need at least one test each before their tasks are DONE.
