# frontend/validation — shared validators (owner: Avanthik)

`validators.js` is the single client-side source for every input rule: email format,
password policy (more than eight characters, uppercase, lowercase, special — the
statement's exact rule), prices/quantities >= 0, date ordering, usage limits. It shows
inline errors under fields on blur and returns the same messages the server sends, because
`backend/api/validators.py` mirrors it 1:1 (client AND server validation is graded).
