// selftest.mjs — executable contract for validators.js pure rules (owner: Avanthik, T07).
// Runs under plain node (no DOM): only the pure rules + the MSG table — exactly the half
// backend/api/validators.py (T08) must mirror. Run: node frontend/validation/selftest.mjs
// (pytest picks it up via tests/test_validators_contract.py). Silent success = exit 0;
// every failed check prints and the process exits 1.
import { validate, rules, MSG, required } from './validators.js';

let failed = 0;
function check(name, cond) {
  if (!cond) { failed += 1; console.error(`FAIL ${name}`); }
}
function bad(rule, value, msgKey) {
  const r = validate(rule, value);
  check(`${rule}(${JSON.stringify(value)}) rejected`, r.ok === false);
  check(`${rule}(${JSON.stringify(value)}) message=${msgKey}`, r.message === MSG[msgKey]);
}
function good(rule, value) {
  const r = validate(rule, value);
  check(`${rule}(${JSON.stringify(value)}) accepted`, r.ok === true && r.message === '');
}

// email — local@domain.tld, trimmed first
bad('email', '', 'emailEmpty');
bad('email', 'no-at-sign', 'emailBad');
bad('email', 'a@b', 'emailBad'); // domain needs a dot
bad('email', 'a b@c.d', 'emailBad'); // spaces illegal
good('email', 'demo@cadence.in');
good('email', '  padded@cadence.in  ');

// password — MORE than 8 code points, upper, lower, special; ONE message for every failure
bad('password', 'Abcdefg!', 'password'); // exactly 8 → too short
bad('password', 'abcdefgh!', 'password'); // no uppercase
bad('password', 'ABCDEFG!', 'password'); // no lowercase
bad('password', 'Abcdefghi', 'password'); // no special
good('password', 'Abcdefgh!');
// mirror trap #2: 8 code points but 9 UTF-16 units — the code-point count must win,
// so a UTF-16 .length implementation FAILS this case (Python len() agrees with us).
bad('password', '\u{1F600}Abcdef!', 'password');

// price — ₹0 or more, up to 2 decimals, no thousands separators
bad('price', '', 'priceEmpty');
bad('price', '-1', 'priceBad');
bad('price', '12.345', 'priceBad');
bad('price', '1,299', 'priceBad');
good('price', '0');
good('price', '12.5');
good('price', '1299.99');

// quantity — whole number, 0 legal, leading zeros accepted (mirror trap #3: '03' = 3)
bad('quantity', '', 'qtyEmpty');
bad('quantity', '-1', 'qtyBad');
bad('quantity', '2.5', 'qtyBad');
good('quantity', '0');
good('quantity', '03');

// usageLimit — optional, but if present a whole number >= 1
good('usageLimit', '');
bad('usageLimit', '0', 'usageLimit');
bad('usageLimit', '2.5', 'usageLimit');
good('usageLimit', '1');
good('usageLimit', '03');

// dateOrder — pair rule; either side empty = ok (requiredness is a different rule)
good('dateOrder', ['2026-01-01', '2026-01-02']);
good('dateOrder', ['', '2026-01-02']);
bad('dateOrder', ['2026-01-02', '2026-01-01'], 'dateOrder');
bad('dateOrder', ['garbage', '2026-01-01'], 'dateOrder'); // garbage never silently passes

// dispatcher guards — a forgotten pair can never silently validate as ok
function throws(fn) { try { fn(); return false; } catch { return true; } }
check('unknown rule throws', throws(() => validate('nope', 'x')));
check('dateOrder without array throws', throws(() => validate('dateOrder', '2026-01-01')));

// required(label) — shared required-ness rule (T50). Label carries its article;
// 'a product name' -> 'Enter a product name.' (the copy products.js:181 already
// ships, pinned verbatim so the factory swap changes nothing on screen).
// Mirror trap: whitespace-only input is EMPTY — trim here, .strip() in Python.
const nameRequired = required('a product name');
check('required accepts text', validate(nameRequired, 'Odoo brand').ok === true);
check('required accepts trimmed text', validate(nameRequired, ' Odoo ').ok === true);
check('required rejects empty', validate(nameRequired, '').ok === false);
check('required empty message', validate(nameRequired, '').message === 'Enter a product name.');
check('required rejects whitespace-only', validate(nameRequired, '   ').ok === false);
check('required whitespace message', validate(nameRequired, '   ').message === 'Enter a product name.');
check('required without label throws', throws(() => required('')));
check('required with non-string label throws', throws(() => required(42)));

if (failed) { console.error(`${failed} check(s) failed`); process.exit(1); }
console.log(`validators selftest: all checks passed (${Object.keys(rules).length} rules + required() factory, MSG table pinned)`);
