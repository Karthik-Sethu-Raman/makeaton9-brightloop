// selftest.mjs — executable contract for validators.js pure rules (owner: Avanthik, T07).
// Runs under plain node (no DOM): only the pure rules + the MSG table — exactly the half
// backend/api/validators.py (T08) must mirror. Run: node frontend/validation/selftest.mjs
// (pytest picks it up via tests/test_validators_contract.py). Silent success = exit 0;
// every failed check prints and the process exits 1.
import { validate, rules, MSG, required, paymentAmount, validateForm, setError, clearErrorFor } from './validators.js';

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

// minQuantity (plans) — schema CHECK >= 1: 0 invalid, empty invalid (NOT NULL)
bad('minQuantity', '', 'minQtyEmpty');
bad('minQuantity', '0', 'minQtyBad');       // the plans.js divergence the audit caught
bad('minQuantity', '-1', 'minQtyBad');
bad('minQuantity', '2.5', 'minQtyBad');
good('minQuantity', '1');
good('minQuantity', '03');                  // leading zeros accepted, = 3

// amount (payments, T52) — same shape as price; empty is its own required-ness message
bad('amount', '', 'amtEmpty');
bad('amount', '-1', 'amtBad');
bad('amount', '12.345', 'amtBad');
bad('amount', '1,299', 'amtBad');
bad('amount', '.5', 'amtBad'); // leading digit required, same as price
good('amount', '0');
good('amount', '12.5');
good('amount', '1299.99');
good('amount', '03.50'); // leading zeros accepted, mirror trap #3

// percent (discounts, T24) — 0–100 inclusive, up to 2 decimals, leading zeros OK
bad('percent', '', 'pctEmpty');
bad('percent', '-1', 'pctBad');
bad('percent', '100.5', 'pctBad');
bad('percent', '12.345', 'pctBad');
bad('percent', '1,299', 'pctBad'); // no thousands separators, same as price
good('percent', '0');
good('percent', '10');
good('percent', '12.5');
good('percent', '100'); // the ceiling itself is legal: the whole price off
good('percent', '07.50'); // leading zeros accepted, mirror trap #3

// paymentAmount(outstanding) — T52 factory: shape above + payment <= outstanding.
// Ceiling is captured at BUILD time (build per render); shape errors always win
// over the ceiling so a malformed value never reports amtMax.
const pay500 = paymentAmount(500);
check('pay accepts at ceiling', validate(pay500, '500').ok === true);
check('pay accepts under ceiling', validate(pay500, '499.99').ok === true);
check('pay rejects over ceiling', validate(pay500, '500.01').ok === false);
check('pay ceiling message', validate(pay500, '501').message === MSG.amtMax);
check('pay shape error beats ceiling', validate(pay500, '-3').message === MSG.amtBad);
check('pay empty message', validate(pay500, '').message === MSG.amtEmpty);
// float trap: 8.1 is not exact in binary — raw-float compare would reject ₹8.10
// against ₹8.10 outstanding; the paisa (x100 integer) compare must accept it.
const floatTrap = paymentAmount(8.1);
check('pay paisa-compare exact at 8.10', validate(floatTrap, '8.10').ok === true);
check('pay paisa-compare rejects 8.11', validate(floatTrap, '8.11').ok === false);
// ceiling supplied as a string (input value convenience) behaves identically
check('pay string ceiling works', validate(paymentAmount('500.00'), '500').ok === true);
// missing / junk ceilings degrade to shape-only — never throw mid-form
check('pay null bound degrades', validate(paymentAmount(null), '999999').ok === true);
check('pay junk bound degrades', validate(paymentAmount('abc'), '999999').ok === true);
// fully-paid invoice: outstanding 0 — only ₹0.00 clears the shape+ceiling rules
const paidOff = paymentAmount(0);
check('pay zero ceiling allows 0.00', validate(paidOff, '0.00').ok === true);
check('pay zero ceiling rejects 0.01', validate(paidOff, '0.01').ok === false);

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

// --- form-level DOM behavior (T53) ---------------------------------------------------
// validateForm/setError/clearErrorFor are executed against a minimal DOM shim so
// the graded must-haves — focus jumps to the FIRST error, inline message under the
// field, aria wiring, clear-on-fix — are pinned in CI without a browser install.
// The shim reflects `.id =` into the registry like a real element (setError uses
// the property form); full live-API coverage lives in authflow.audit.mjs.
{
  const byId = new Map();
  const focusLog = [];
  const makeEl = () => {
    const el = {
      attrs: {}, children: [], _text: '',
      set id(v) { el.attrs.id = String(v); byId.set(String(v), el); },
      get id() { return el.attrs.id || ''; },
      set className(v) { el.attrs.class = String(v); },
      get className() { return el.attrs.class || ''; },
      set textContent(v) { el._text = String(v); },
      get textContent() { return el._text; },
      setAttribute(k, v) { el.attrs[k] = String(v); },
      getAttribute(k) { return k in el.attrs ? el.attrs[k] : null; },
      removeAttribute(k) { delete el.attrs[k]; },
      appendChild(c) { el.children.push(c); return c; },
      insertAdjacentElement(_pos, el2) { el.children.push(el2); el._inline = el2; return el2; },
      remove() { if (el.attrs.id) byId.delete(el.attrs.id); el._removed = true; },
      focus() { focusLog.push(el.attrs.id || el.name || '?'); },
    };
    return el;
  };
  const input = (id, value) => {
    const el = makeEl();
    el.attrs.id = id; byId.set(id, el);
    el.name = id; el.value = value ?? '';
    return el;
  };
  globalThis.document = { createElement: makeEl, getElementById: (id) => byId.get(id) || null };
  try {
    // login form field order (login.js): [email, password] — both empty
    const emailI = input('login-email', ''), passI = input('login-password', '');
    const v = validateForm([{ input: emailI, rule: 'email' }, { input: passI, rule: 'password' }]);
    check('form: rejects empty login', v.ok === false && v.first === emailI);
    check('form: focuses FIRST error field', focusLog.at(-1) === 'login-email');
    check('form: inline message = MSG.emailEmpty', emailI._inline?.textContent === MSG.emailEmpty);
    check('form: aria-invalid set', emailI.getAttribute('aria-invalid') === 'true');
    const desc = (emailI.getAttribute('aria-describedby') || '').split(/\s+/);
    check('form: aria-describedby points at the error node', desc.includes(emailI._inline.id));

    // signup: email valid, password weak -> password is the first (and only) error
    const sEmail = input('s-email', 'demo@cadence.in'), sPass = input('s-password', 'weak');
    const s = validateForm([{ input: sEmail, rule: 'email' }, { input: sPass, rule: 'password' }]);
    check('form: first error skips VALID fields', s.first === sPass && focusLog.at(-1) === 's-password');
    check('form: valid field carries no error node', sEmail._inline === undefined);
    check('form: weak-password message = MSG.password', sPass._inline?.textContent === MSG.password);

    // clear-on-fix: revalidate after correcting -> node removed, aria state restored
    sPass.value = 'Abcdefg!9';
    const s2 = validateForm([{ input: sEmail, rule: 'email' }, { input: sPass, rule: 'password' }]);
    check('form: ok after fix', s2.ok === true);
    check('form: error node removed on fix', sPass._inline?._removed === true);
    check('form: aria-invalid cleared on fix', sPass.getAttribute('aria-invalid') === null);

    // setError APPENDS to an existing aria-describedby (a field hint survives)
    const hinted = input('hinted', '');
    hinted.setAttribute('aria-describedby', 'hint-id');
    setError(hinted, 'x');
    check('setError keeps existing describedby', (hinted.getAttribute('aria-describedby') || '').startsWith('hint-id '));
    clearErrorFor(hinted);
    check('clearErrorFor restores original describedby', hinted.getAttribute('aria-describedby') === 'hint-id');
    check('clearErrorFor is a no-op on clean fields', (() => { clearErrorFor(input('clean', '')); return true; })());
  } finally {
    delete globalThis.document; // later sections / hosts must not see the shim
  }
}

if (failed) { console.error(`${failed} check(s) failed`); process.exit(1); }
console.log(`validators selftest: all checks passed (${Object.keys(rules).length} rules + required()/paymentAmount() factories + form-level DOM checks, MSG table pinned)`);
