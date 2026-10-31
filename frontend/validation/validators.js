// validators.js — the single client-side source for every input rule (owner: Avanthik, T07).
//
// GRADED MUST-HAVE: client AND server validate with the SAME messages. The MSG table
// below is the canonical contract — backend/api/validators.py MUST mirror these rules
// and messages 1:1 (T08, owner Karthik). Change one, change both.
//
// Mirror traps for the Python side (documented so the mirror cannot drift):
//   1. JS `\d` is ASCII-only; Python re `\d` matches Unicode digits (e.g. '１２３').
//      The mirror must use [0-9], not \d.
//   2. Password length is counted in CODE POINTS ([...v].length here, len() there) —
//      not UTF-16 units — so '😀Aa!bcd' fails on both sides alike.
//   3. Leading zeros are ACCEPTED in whole-number rules ('03' = 3); thresholds are
//      value-based, not regex-shaped.
//
// Rules are pure functions: (value[, extra]) -> {ok, message}. A rule always returns
// the same message for the same input, so parity is testable.
// Pages wire up in three lines:
//   import { attachBlurError, required } from '/frontend/validation/validators.js';
//   attachBlurError(emailInput, 'email');
//   attachBlurError(passwordInput, 'password');
//   attachBlurError(nameInput, required('a product name')); // built rule (T50)

// --- canonical messages (mirror these EXACTLY in backend/api/validators.py) -------
const MSG = {
  emailEmpty: 'Enter an email address.',
  emailBad: 'Enter a valid email address.',
  password: 'Password must be more than 8 characters and include an uppercase letter, a lowercase letter and a special character.',
  priceEmpty: 'Enter a price.',
  priceBad: 'Price must be ₹0 or more, with up to 2 decimals.',
  qtyEmpty: 'Enter a quantity.',
  qtyBad: 'Quantity must be a whole number of 0 or more.',
  minQtyEmpty: 'Enter a minimum quantity.',
  minQtyBad: 'Minimum quantity must be a whole number of 1 or more.',
  amtEmpty: 'Enter an amount.',
  amtBad: 'Amount must be ₹0 or more, with up to 2 decimals.',
  amtMax: 'Amount must be no more than the outstanding balance.',
  dateOrder: 'The end date must be on or after the start date.',
  usageLimit: 'Usage limit must be a whole number of 1 or more.',
};

const rules = {
  // Local@domain.tld — one @, no spaces, a dot in the domain. Statement-grade, not RFC-grade.
  email(value) {
    const v = String(value ?? '').trim();
    if (!v) return { ok: false, message: MSG.emailEmpty };
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    return { ok, message: ok ? '' : MSG.emailBad };
  },

  // Statement's exact policy: MORE than 8 chars (so 9+), upper, lower, special.
  // "Special" = anything non-alphanumeric. Length in code points (mirror trap #2).
  // One message for the whole policy — the server sends the same single sentence.
  password(value) {
    const v = String(value ?? '');
    const ok = [...v].length > 8 && /[A-Z]/.test(v) && /[a-z]/.test(v) && /[^A-Za-z0-9]/.test(v);
    return { ok, message: ok ? '' : MSG.password };
  },

  // Prices: ₹0 or more, up to 2 decimals, no thousands separators typed.
  price(value) {
    const v = String(value ?? '').trim();
    if (!v) return { ok: false, message: MSG.priceEmpty };
    const ok = /^\d+(\.\d{1,2})?$/.test(v);
    return { ok, message: ok ? '' : MSG.priceBad };
  },

  // Quantities: whole numbers, 0 allowed (a real 0 is legal, it prints "0").
  // Leading zeros accepted ('03' = 3) — mirror trap #3.
  quantity(value) {
    const v = String(value ?? '').trim();
    if (!v) return { ok: false, message: MSG.qtyEmpty };
    const ok = /^\d+$/.test(v);
    return { ok, message: ok ? '' : MSG.qtyBad };
  },

  // Minimum quantity (plans): schema CHECK (min_quantity >= 1) — 0 is INVALID here,
  // unlike 'quantity' above (T36 pass-2 audit found plans.js wired to the wrong rule;
  // a client-valid 0 was server-rejected with a divergent message). Whole number >= 1,
  // leading zeros accepted, same conventions as the other whole-number rules.
  minQuantity(value) {
    const v = String(value ?? '').trim();
    if (!v) return { ok: false, message: MSG.minQtyEmpty };
    const ok = /^\d+$/.test(v) && parseInt(v, 10) >= 1;
    return { ok, message: ok ? '' : MSG.minQtyBad };
  },

  // Payment amounts (T52): same shape as price (>= 0, up to 2 decimals) — the rule
  // the payments record form (T28) and payments API (T27) share. The optional
  // ceiling (payment <= outstanding) lives in paymentAmount() below; this base
  // rule is shape only.
  amount(value) {
    const v = String(value ?? '').trim();
    if (!v) return { ok: false, message: MSG.amtEmpty };
    const ok = /^\d+(\.\d{1,2})?$/.test(v);
    return { ok, message: ok ? '' : MSG.amtBad };
  },

  // Discount usage limits: optional field, but if present, a whole number >= 1.
  // Leading zeros accepted ('03' = 3) — same convention as quantity.
  usageLimit(value) {
    const v = String(value ?? '').trim();
    if (!v) return { ok: true, message: '' }; // empty = no limit
    const ok = /^\d+$/.test(v) && parseInt(v, 10) >= 1;
    return { ok, message: ok ? '' : MSG.usageLimit };
  },
};

// Date ordering for a from/to pair (YYYY-MM-DD from <input type="date">).
// Comparison is calendar-safe on ISO strings, but parse first so garbage never
// silently passes. Either side empty = ok (requiredness is a different rule).
rules.dateOrder = function dateOrder(fromValue, toValue) {
  const from = String(fromValue ?? '').trim();
  const to = String(toValue ?? '').trim();
  if (!from || !to) return { ok: true, message: '' };
  const fd = new Date(from);
  const td = new Date(to);
  const ok = !Number.isNaN(fd.getTime()) && !Number.isNaN(td.getTime()) && td >= fd;
  return { ok, message: ok ? '' : MSG.dateOrder };
};

const PAIR_RULES = new Set(['dateOrder']);

// --- required text (T50) -------------------------------------------------------------
// The one rule every form hand-rolled with its own copy (products.js checkName today).
// required(label) BUILDS a rule; the label carries its article ('a product name') so
// the sentence reads 'Enter a product name.' — the copy products.js already ships.
// Whitespace-only input counts as empty on both sides (trim before the length check).
// The built rule is a plain unary rule: pass it anywhere a rule NAME goes
// (validate, attachBlurError, validateForm fields).
export function required(label) {
  if (typeof label !== 'string' || !label.trim()) {
    // a missing label is a programming error — it must never silently emit
    // 'Enter .' to users (same philosophy as the pair-rule guard below)
    throw new Error("validators: required(label) needs a label, e.g. 'a product name'");
  }
  return function requiredRule(value) {
    const ok = String(value ?? '').trim().length > 0;
    return { ok, message: ok ? '' : `Enter ${label}.` };
  };
}

// --- payment amount with ceiling (T52) ----------------------------------------------
// The payments flow's graded rule: amount >= 0, <= 2 decimals AND no more than the
// invoice's outstanding balance. Shape errors report the amount messages; only a
// shape-VALID value over the ceiling reports amtMax (one message per outcome).
// `outstanding` is captured AT BUILD TIME — build the rule per form render so a
// changed invoice can never leave a stale ceiling behind. A missing/blank/non-numeric
// ceiling degrades to shape-only (never throws mid-form); the server still enforces
// its own bound and that message surfaces in the form.
export function paymentAmount(outstanding) {
  const s = outstanding === null || outstanding === undefined ? '' : String(outstanding).trim();
  const bound = Number(s);
  const hasBound = s !== '' && Number.isFinite(bound);
  // compare in integer paisa: 8.1 * 100 is 810.000...01 in binary float — raw
  // floats would reject a payment of exactly ₹8.10 against ₹8.10 outstanding
  const cents = (x) => Math.round(x * 100);
  return function paymentAmountRule(value) {
    const shape = rules.amount(value);
    if (!shape.ok || !hasBound) return shape;
    const ok = cents(parseFloat(String(value ?? '').trim())) <= cents(bound);
    return { ok, message: ok ? '' : MSG.amtMax };
  };
}

// --- dispatcher ---------------------------------------------------------------------
// validate('price', '12.50')                 -> {ok, message}
// validate(required('a product name'), 'x')  -> rule FUNCTIONS run as-is (unary)
// validate('dateOrder', [fromVal, toVal])    -> pair rules REQUIRE the array
export function validate(ruleName, value) {
  if (typeof ruleName === 'function') return ruleName(value);
  const rule = rules[ruleName];
  if (!rule) throw new Error(`validators: unknown rule "${ruleName}"`);
  if (PAIR_RULES.has(ruleName) && !Array.isArray(value)) {
    throw new Error(`validators: rule "${ruleName}" takes [from, to]`);
  }
  return Array.isArray(value) ? rule(value[0], value[1]) : rule(value);
}

// --- shared inline rendering: error div UNDER the field (DESIGN forms spec) ---------
// Used by attachBlurError AND validateForm so the two can never diverge.
let uid = 0;

export function setError(input, message) {
  let errorEl = document.getElementById(input.getAttribute('aria-err') || '');
  if (!errorEl) {
    const errorId = `${input.id || input.name || 'field'}-error-${++uid}`;
    errorEl = document.createElement('div');
    errorEl.id = errorId;
    errorEl.className = 'cad-fielderror';
    errorEl.setAttribute('role', 'alert');
    input.insertAdjacentElement('afterend', errorEl);
    input.setAttribute('aria-err', errorId);
    // append to (not overwrite) any pre-existing describedby, e.g. a field hint
    const orig = input.getAttribute('aria-describedby');
    input.setAttribute('aria-describedby', (orig ? `${orig} ` : '') + errorId);
  }
  errorEl.textContent = message;
  input.setAttribute('aria-invalid', 'true');
}

export function clearErrorFor(input) {
  const errorId = input.getAttribute('aria-err');
  if (errorId) {
    const errorEl = document.getElementById(errorId);
    if (errorEl) errorEl.remove();
    input.removeAttribute('aria-err');
  }
  input.removeAttribute('aria-invalid');
  // restore the describedby list minus our id
  const described = (input.getAttribute('aria-describedby') || '').split(/\s+/)
    .filter((id) => id && id !== errorId);
  if (described.length) input.setAttribute('aria-describedby', described.join(' '));
  else input.removeAttribute('aria-describedby');
}

// --- blur wiring: inline error UNDER the field (DESIGN forms spec) ------------------
// Shows the message on blur, clears it as soon as the input becomes valid.
// For the dateOrder pair: wire the END-date input (error belongs there) and pass
// getPairValue returning the START-date value.
export function attachBlurError(input, ruleName, getPairValue) {
  if (ruleName === 'dateOrder' && typeof getPairValue !== 'function') {
    throw new Error('validators: dateOrder needs getPairValue returning the start date');
  }

  function run() {
    const value = ruleName === 'dateOrder' ? [getPairValue(), input.value] : input.value;
    const result = validate(ruleName, value);
    if (result.ok) clearErrorFor(input); else setError(input, result.message);
    return result.ok;
  }

  input.addEventListener('blur', run);
  // Clear the moment the fix lands (DESIGN: never leave a stale error up).
  input.addEventListener('input', () => { if (input.getAttribute('aria-err')) run(); });

  return { run, clearError: () => clearErrorFor(input) }; // forms may re-run on submit
}

// --- form-level: run all rules, render every error, focus jumps to the FIRST error --
// Self-sufficient: renders/clears messages itself; no wiring handles required.
// fields: [{ input, rule, getPairValue? }]  (for dateOrder: input = END field,
// getPairValue returns the START value)
export function validateForm(fields) {
  let firstBad = null;
  for (const f of fields) {
    const value = f.rule === 'dateOrder' ? [f.getPairValue(), f.input.value] : f.input.value;
    const result = validate(f.rule, value);
    if (result.ok) { clearErrorFor(f.input); continue; }
    setError(f.input, result.message);
    if (!firstBad) firstBad = f.input;
  }
  if (firstBad) firstBad.focus();
  return { ok: !firstBad, first: firstBad };
};

export { rules, MSG };
export default { rules, MSG, required, paymentAmount, validate, setError, clearErrorFor, attachBlurError, validateForm };
