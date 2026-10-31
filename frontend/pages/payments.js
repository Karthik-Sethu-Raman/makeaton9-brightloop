// payments.js — Payments screen (owner: Avanthik, T28, absorbed module)
// DESIGN question: "Which money came in, against which invoice?"
//
// The page has two halves: the RECORD form (the frequent job — one click from the
// nav) and the payments list. The form's invoice picker reads the LIVE invoices
// API (T21, landed) and lists only invoices that still demand money, with the
// outstanding figure in the option label — so the amount ceiling is visible
// before the field is touched. Recording POSTs to the payments API:
//
// CONTRACT for T27 (Manu) — mirrors validators.js messages:
//   GET /api/payments
//     -> 200 {"payments": [{id, paid_on, method, amount, note,
//                            invoice_id, invoice_number, customer_name}]}
//          (a bare array is also accepted); newest first.
//   POST /api/payments  {invoice_id, method, amount, paid_on, note?}
//     -> 201 {"ok": true, "payment": {...}, "outstanding": <number after>}
//     -> 400 {"detail": <amount shape/ceiling MSG from validators.js — paymentAmount
//                        sentences, paisa-exact ceiling>}   // client validates first
//     -> 404 {"detail": "No invoice needs a payment with that id."}
//     -> 409 {"detail": "That invoice is already fully paid."}
// Until T27 lands this page shows its error state with Retry for the LIST, and a
// form that fills but cannot submit — the T04 degraded precedent, not a bug.
//
// Patterns (T49 law, baked in from the start): loading flag (skeleton list, no
// false empties), lastGoodAt + never-silent failed refresh with Retry,
// authHeaders on EVERY fetch, .cad-flash feedback with roles, grey dashes via
// table.js fillCell, mergeFresh-style no stale derived state.

import { inr, istTime } from '../components/fmt.js';
import { renderTable, renderTableSkeleton } from '../components/table.js';
import { authHeaders } from '../components/auth.js';
import { attachBlurError, validateForm, required, paymentAmount } from '../validation/validators.js';

// Local num (sibling-page convention — fmt.js exports no num): parse to a finite
// number or null; null renders as the shared grey dash downstream.
function num(v) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

const METHODS = { upi: 'UPI', card: 'Card', bank_transfer: 'Bank transfer', cash: 'Cash', cheque: 'Cheque' };
const LIST_URL = '/api/payments';
const INVOICES_URL = '/api/invoices';

const STYLE_ID = 'cad-payments-style';

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = [
    '.cad-payform{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:var(--gap);',
    'align-items:end;background:var(--surface);border:1px solid var(--border);',
    'border-radius:var(--radius-card);padding:var(--card-pad)}', // 4 cols + 3x16 gutters; phone folds below
    '.cad-payform .cad-field{margin-bottom:0}',
    '@media (max-width:900px){.cad-payform{grid-template-columns:1fr 1fr}}',
    '@media (max-width:640px){.cad-payform{grid-template-columns:1fr}}',
    '.cad-paywrap{display:flex;flex-direction:column;gap:var(--gap)}',
    '.cad-flash-slot:empty{display:none}', // no stray gap before the first flash
  ].join('');
  document.head.appendChild(s);
}

export function render(mount) {
  ensureStyle();
  mount.innerHTML = '';
  let alive = true;
  let lastRows = null;
  let lastGoodAt = null;
  let openInvoices = []; // [{id, number, customer_name, outstanding}] — picker source

  const page = document.createElement('section');
  page.className = 'cad-page';

  const head = document.createElement('div');
  head.className = 'cad-pagehead';
  const h1 = document.createElement('h1');
  h1.className = 'cad-h1';
  h1.textContent = 'Payments';
  head.appendChild(h1);

  const body = document.createElement('div');
  body.className = 'cad-paywrap';
  body.setAttribute('aria-live', 'polite');
  page.append(head, body);
  mount.appendChild(page);

  // ---------------- record form ----------------
  const form = document.createElement('form');
  form.className = 'cad-payform';
  form.noValidate = true;

  const fld = (labelText, inputEl) => {
    const f = document.createElement('div');
    f.className = 'cad-field';
    const l = document.createElement('label');
    l.className = 'cad-label';
    l.textContent = labelText;
    inputEl.id = inputEl.name || `pay-${labelText.toLowerCase().replace(/\s+/g, '-')}`;
    l.htmlFor = inputEl.id;
    f.append(l, inputEl);
    return f;
  };

  const invSel = document.createElement('select');
  invSel.className = 'cad-input';
  invSel.name = 'invoice_id';
  const amountI = document.createElement('input');
  amountI.className = 'cad-input num'; amountI.type = 'text'; amountI.name = 'amount';
  amountI.inputMode = 'decimal'; amountI.placeholder = '0.00';
  const methodSel = document.createElement('select');
  methodSel.className = 'cad-input'; methodSel.name = 'method';
  for (const [v, label] of Object.entries(METHODS)) {
    const o = document.createElement('option');
    o.value = v; o.textContent = label;
    methodSel.appendChild(o);
  }
  const dateI = document.createElement('input');
  dateI.className = 'cad-input'; dateI.type = 'date'; dateI.name = 'paid_on';
  const noteI = document.createElement('input');
  noteI.className = 'cad-input'; noteI.type = 'text'; noteI.name = 'note';
  noteI.placeholder = 'optional';

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'cad-btn-primary';
  submit.dataset.label = 'Record payment';
  submit.textContent = submit.dataset.label;

  form.append(
    fld('Invoice', invSel),
    fld('Amount', amountI),
    fld('Method', methodSel),
    fld('Paid on', dateI),
    fld('Note', noteI),
    submit,
  );

  const formFlash = document.createElement('div');
  formFlash.className = 'cad-flash-slot';

  function selectedOutstanding() {
    const inv = openInvoices.find((i) => String(i.id) === String(invSel.value));
    return inv ? num(inv.outstanding) : null;
  }

  // blur wiring: the amount ceiling is PER-INVOICE — paymentAmount(outstanding)
  // captures its bound AT BUILD TIME, so the rule must be REBUILT per validation
  // call with the live picker value. A wrapper function does exactly that (rule
  // functions run as-is through validate()); no bound (no/!confirmed invoice)
  // degrades to shape-only, as the factory intends.
  const amountRule = (value) => paymentAmount(selectedOutstanding() ?? Infinity)(value);
  attachBlurError(invSel, required('an invoice'));
  attachBlurError(methodSel, required('a payment method'));
  attachBlurError(dateI, required('a payment date'));
  attachBlurError(amountI, amountRule);
  form.fields = [
    { input: invSel, rule: required('an invoice') },
    { input: methodSel, rule: required('a payment method') },
    { input: dateI, rule: required('a payment date') },
    { input: amountI, rule: amountRule },
  ];

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!validateForm(form.fields).ok) return;
    submit.disabled = true; submit.textContent = 'Working…';
    formFlash.innerHTML = '';
    try {
      const res = await fetch(LIST_URL, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json', accept: 'application/json' }),
        body: JSON.stringify({
          invoice_id: Number(invSel.value),
          method: methodSel.value,
          amount: String(amountI.value).trim(),
          paid_on: dateI.value,
          note: noteI.value.trim() || undefined,
        }),
      });
      let out = null;
      try { out = await res.json(); } catch (_) { /* non-JSON body */ }
      if (!res.ok) {
        let msg = out && (out.detail || out.message);
        if (Array.isArray(msg)) msg = 'Check the payment and try again.'; // 422 array
        if (typeof msg !== 'string' || !msg.trim()) msg = '';             // object detail
        throw new Error(msg || `Couldn’t record the payment (HTTP ${res.status}).`);
      }
      amountI.value = ''; noteI.value = '';
      const ok = document.createElement('div');
      ok.className = 'cad-flash cad-flash--ok';
      ok.setAttribute('role', 'status');
      ok.textContent = 'Payment recorded.';
      formFlash.appendChild(ok);
      await Promise.all([loadInvoices(), load(true)]); // picker + list re-sync
    } catch (e) {
      const err = document.createElement('div');
      err.className = 'cad-flash cad-flash--err';
      err.setAttribute('role', 'alert');
      err.textContent = (e && e.message) || 'Action failed.';
      formFlash.appendChild(err);
    } finally {
      submit.disabled = false; submit.textContent = submit.dataset.label;
    }
  });

  body.append(form, formFlash);

  // ---------------- list ----------------
  const listSlot = document.createElement('div');
  body.appendChild(listSlot);

  function stateBlock(text, withRetry, isErr) {
    const b = document.createElement('div');
    b.className = 'cad-stateblock' + (isErr ? ' cad-stateblock--err' : '');
    b.textContent = text + ' ';
    if (withRetry) {
      const r = document.createElement('button');
      r.type = 'button'; r.className = 'cad-linkbtn'; r.textContent = 'Retry';
      r.addEventListener('click', () => load(true));
      b.appendChild(r);
    }
    return b;
  }

  function paintList() {
    if (!lastRows) return;
    listSlot.innerHTML = '';
    if (lastRows.length === 0) {
      listSlot.appendChild(stateBlock('No payments recorded yet — the first one lands here.', false, false));
      return;
    }
    listSlot.appendChild(renderTable(COLUMNS, lastRows));
  }

  const COLUMNS = [
    { key: 'paid_on', label: 'Paid on', identity: true, render: (p) => fmtDay(p.paid_on) },
    { key: 'invoice_number', label: 'Invoice', render: (p) => p.invoice_number || '—' },
    { key: 'customer_name', label: 'Customer', render: (p) => p.customer_name || '—' },
    { key: 'method', label: 'Method', render: (p) => METHODS[p.method] || p.method || '—' },
    { key: 'note', label: 'Note', render: (p) => (p.note ? document.createTextNode(p.note) : '—') },
    { key: 'amount', label: 'Amount', num: true, render: (p) => inr(num(p.amount)) },
  ];

  function fmtDay(v) {
    if (!v) return '—';
    const d = new Date(String(v).length <= 10 ? `${v}T00:00:00+05:30` : v); // IST-pinned (T49)
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  async function load(isRefresh) {
    if (!lastRows) listSlot.replaceChildren(renderTableSkeleton(COLUMNS, 4));
    try {
      const res = await fetch(LIST_URL, { headers: authHeaders({ accept: 'application/json' }) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (!alive) return;
      lastRows = Array.isArray(data) ? data : (data && Array.isArray(data.payments) ? data.payments : []);
      lastGoodAt = new Date();
      paintList();
    } catch (_) {
      if (!alive) return;
      if (lastRows && lastRows.length) {
        paintList(); // keep last-good, but NEVER silently (T49 law)
        const stale = document.createElement('div');
        stale.className = 'cad-stateblock cad-stateblock--err';
        stale.textContent = `Couldn’t refresh — showing payments as of ${istTime(lastGoodAt)}. `;
        const r = document.createElement('button');
        r.type = 'button'; r.className = 'cad-linkbtn'; r.textContent = 'Retry';
        r.addEventListener('click', () => load(true));
        stale.appendChild(r);
        listSlot.appendChild(stale);
        return;
      }
      listSlot.replaceChildren(stateBlock('Couldn’t load payments.', true, true));
    }
  }

  // ---------------- invoice picker (T21, live) ----------------
  async function loadInvoices() {
    const prev = invSel.value;
    try {
      const res = await fetch(INVOICES_URL, { headers: authHeaders({ accept: 'application/json' }) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (!alive) return;
      const rows = Array.isArray(data) ? data : (data && Array.isArray(data.invoices) ? data.invoices : []);
      // only invoices that still demand money (T21 sends outstanding where demanded)
      openInvoices = rows.filter((r) => r && (r.state === 'confirmed') && num(r.outstanding) != null && num(r.outstanding) > 0.005);
      invSel.replaceChildren();
      if (openInvoices.length === 0) {
        const o = document.createElement('option');
        o.value = ''; o.textContent = 'No open invoices';
        invSel.appendChild(o);
        return;
      }
      for (const inv of openInvoices) {
        const o = document.createElement('option');
        o.value = String(inv.id);
        o.textContent = `${inv.number || 'Invoice'} · ${inv.customer_name || '—'} · ${inr(num(inv.outstanding))} due`;
        invSel.appendChild(o);
      }
      if (prev && openInvoices.some((i) => String(i.id) === prev)) invSel.value = prev;
    } catch (_) {
      if (!alive) return;
      invSel.replaceChildren();
      const o = document.createElement('option');
      o.value = ''; o.textContent = 'Couldn’t load invoices';
      invSel.appendChild(o);
    }
  }

  // today in IST (en-CA renders the ISO YYYY-MM-DD a date input needs) — the UTC
  // form would default to YESTERDAY's date between 00:00 and 05:30 IST (T28 verify).
  dateI.value = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  loadInvoices();
  load(false);

  return function cleanup() { alive = false; };
}

export default { render };
