// validators.js — the single client-side source for every input rule (owner: Avanthik, T07).
//
// GRADED MUST-HAVE: client AND server validate with the SAME messages. The messages
// below are the canonical strings — backend/api/validators.py mirrors this file 1:1
// (same rules, same messages). Change one, change both.
//
// Rules are pure functions: (value[, extra]) -> {ok: boolean, message: string}.
// A rule always returns the same message for the same input, so parity is testable.
// Pages wire up in three lines:
//   import { attachBlurError } from '/frontend/validation/validators.js';
//   attachBlurError(emailInput, 'email');
//   attachBlurError(passwordInput, 'password');

// --- canonical messages (mirror these EXACTLY in backend/api/validators.py) -------
const MSG = {
  emailEmpty: 'Enter an email address.',
  emailBad: 'Enter a valid email address.',
  password: 'Password must be more than 8 characters and include an uppercase letter, a lowercase letter and a special character.',
  priceEmpty: 'Enter a price.',
  priceBad: 'Price must be ₹0 or more, with up to 2 decimals.',
  qtyEmpty: 'Enter a quantity.',
  qtyBad: 'Quantity must be a whole number of 0 or more.',
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
  // "Special" = anything non-alphanumeric. One message for the whole policy —
  // the server sends the same single sentence.
  password(value) {
    const v = String(value ?? '');
    const ok = v.length > 8 && /[A-Z]/.test(v) && /[a-z]/.test(v) && /[^A-Za-z0-9]/.test(v);
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
  quantity(value) {
    const v = String(value ?? '').trim();
    if (!v) return { ok: false, message: MSG.qtyEmpty };
    const ok = /^\d+$/.test(v);
    return { ok, message: ok ? '' : MSG.qtyBad };
  },

  // Discount usage limits: optional field, but if present, a whole number >= 1.
  usageLimit(value) {
    const v = String(value ?? '').trim();
    if (!v) return { ok: true, message: '' }; // empty = no limit
    const ok = /^[1-9]\d*$/.test(v);
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

// --- dispatcher ---------------------------------------------------------------------
// validate('price', '12.50')            -> {ok, message}
// validate('dateOrder', [fromVal, toVal]) -> pair rules take an array
export function validate(ruleName, value) {
  const rule = rules[ruleName];
  if (!rule) throw new Error(`validators: unknown rule "${ruleName}"`);
  return Array.isArray(value) ? rule(value[0], value[1]) : rule(value);
}

// --- blur wiring: inline error UNDER the field (DESIGN forms spec) ------------------
// Shows the message on blur, clears it as soon as the input becomes valid.
// Sets aria-invalid + aria-describedby so screen readers announce the error.
export function attachBlurError(input, ruleName, getPairValue) {
  const errorId = `${input.id || input.name || 'field'}-error`;
  let errorEl = null;

  function showError(message) {
    if (!errorEl) {
      errorEl = document.createElement('div');
      errorEl.id = errorId;
      errorEl.className = 'cad-fielderror';
      errorEl.setAttribute('role', 'alert');
      input.insertAdjacentElement('afterend', errorEl);
      input.setAttribute('aria-describedby', errorId);
    }
    errorEl.textContent = message;
    input.setAttribute('aria-invalid', 'true');
  }

  function clearError() {
    if (errorEl) { errorEl.remove(); errorEl = null; }
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');
  }

  function run() {
    const value = ruleName === 'dateOrder'
      ? [input.value, getPairValue ? getPairValue() : '']
      : input.value;
    const result = validate(ruleName, value);
    if (result.ok) clearError(); else showError(result.message);
    return result.ok;
  }

  input.addEventListener('blur', run);
  // Clear the moment the fix lands (DESIGN: never leave a stale error up).
  input.addEventListener('input', () => { if (errorEl) run(); });

  return { run, clearError }; // forms can re-run on submit
};

// --- form-level: run all rules, focus jumps to the FIRST error (DESIGN) -------------
// fields: [{ input, rule, getPairValue? }]
export function validateForm(fields) {
  let firstBad = null;
  for (const f of fields) {
    const value = f.rule === 'dateOrder'
      ? [f.input.value, f.getPairValue ? f.getPairValue() : '']
      : f.input.value;
    const result = validate(f.rule, value);
    if (result.ok) {
      f.input.removeAttribute('aria-invalid');
      continue;
    }
    // reuse attachBlurError's rendering by dispatching through it when present
    if (f.wired) f.wired.run();
    if (!firstBad) firstBad = f.input;
  }
  if (firstBad) firstBad.focus();
  return { ok: !firstBad, first: firstBad };
};

export { rules, MSG };
export default { rules, MSG, validate, attachBlurError, validateForm };
