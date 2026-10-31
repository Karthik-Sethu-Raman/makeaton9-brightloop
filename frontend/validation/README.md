# frontend/validation — shared validators (owner: Avanthik)

`validators.js` is the single client-side source for every input rule: email format,
password policy (more than eight characters, uppercase, lowercase, special — the
statement's exact rule), prices/quantities >= 0, date ordering, usage limits. It shows
inline errors under fields on blur and returns the same messages the server sends, because
`backend/api/validators.py` mirrors it 1:1 (client AND server validation is graded).

Mirror contract for `backend/api/validators.py` (T08): copy the MSG table from
validators.js byte-for-byte, and match these conventions exactly —
- use `[0-9]` in Python regexes, never `\d` (Python's `\d` accepts Unicode digits, JS's does not);
- password length counts CODE POINTS (JS uses `[...v].length` to match Python's `len()`);
- whole-number rules ACCEPT leading zeros ('03' = 3); thresholds are value-based;
- a rule always returns the same message for the same input. Change one side, change both.

`selftest.mjs` executes the pure rules (incl. every mirror trap) under plain node —
`node frontend/validation/selftest.mjs` — and `tests/test_validators_contract.py` runs it
inside TEST_CMD while pinning the MSG strings verbatim, so message drift fails CI first.
