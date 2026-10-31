// plans.js — Plans screen (owner: Saurabh, T15)
// Answers DESIGN's question: "What can a customer subscribe to, and on what terms?"
// Lists plans from the live DB and creates new ones. Dynamic data (D1): the table
// reads GET /api/plans (DB-backed, Karthik T14) — never static JSON.
//
// Endpoint contract this page reads/writes:
//   GET  /api/plans  -> [{id,name,billing_frequency,price,min_quantity,
//                          available_from,available_to,close_policy}]  (or {plans:[...]})
//   POST /api/plans  <- {name,billing_frequency,price,min_quantity,
//                        available_from,available_to,close_policy}
//                       201 on success; 4xx {detail|message} with a human sentence.
//   Server rules mirrored here (graded: both validate): name required, price ≥ 0 (price
//   rule), min_quantity whole number (server enforces ≥ 1 per schema), available_from ≤
//   available_to, billing_frequency + close_policy from the enums below. Dates optional.
// Until T14 lands the page shows its error state with Retry (same pattern as products).
//
// Page-module API (router contract): export render(mount) -> cleanup().

import { inr, count, istTime, DASH } from '../components/fmt.js';
import { renderTable, renderTableSkeleton } from '../components/table.js';
import { validate, setError, clearErrorFor, attachBlurError } from '../validation/validators.js';

const LIST_URL = '/api/plans';
const STYLE_ID = 'cad-plans-style';

// Billing cadence enum — mirrors schema.plans.billing_frequency CHECK.
const FREQUENCIES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];
const FREQ_LABEL = Object.fromEntries(FREQUENCIES.map((f) => [f.value, f.label]));

// Close policy enum — mirrors schema.plans.close_policy CHECK. What happens at term end.
const CLOSE_POLICIES = [
  { value: 'renew', label: 'Renew at term end' },
  { value: 'auto_close', label: 'Auto-close on end date' },
  { value: 'early_close', label: 'Allow early close' },
  { value: 'pause', label: 'Pause' },
];
const CLOSE_LABEL = Object.fromEntries(CLOSE_POLICIES.map((c) => [c.value, c.label]));

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  // Same form/page shell as products.js (one DESIGN-compliant card, 2-col fold at 640px).
  s.textContent = [
    '.cad-page{padding:var(--pad);max-width:1180px}',
    '.cad-pagehead{display:flex;align-items:baseline;justify-content:space-between;',
    'gap:var(--gap);margin:0 0 var(--gap);flex-wrap:wrap}',
    '.cad-h1{font-size:var(--fs-title);font-weight:600;color:var(--text);margin:0}',
    '.cad-btn{appearance:none;height:var(--control-height);padding:0 14px;cursor:pointer;',
    'font:inherit;font-size:var(--fs-body);border-radius:var(--radius-control);',
    'border:1px solid var(--primary);background:var(--primary);color:var(--surface)}', // ONE primary/screen
    '.cad-btn--ghost{background:var(--surface);color:var(--text);border-color:var(--control)}',
    '.cad-btn[disabled]{cursor:not-allowed;opacity:.6}',
    '.cad-form{background:var(--surface);border:1px solid var(--border);',
    'border-radius:var(--radius-card);padding:var(--card-pad);margin:0 0 var(--gap);',
    'display:grid;grid-template-columns:1fr 1fr;gap:0 var(--gap)}', // 2 cols = 1fr+1fr
    '.cad-form .cad-field--wide{grid-column:1 / -1}',
    '.cad-form select.cad-input{height:38px;background:var(--surface)}',
    '.cad-form input[type=date].cad-input{height:38px}',
    '.cad-formfoot{grid-column:1 / -1;display:flex;align-items:center;gap:var(--gap);',
    'margin-top:4px}',
    '.cad-formmsg{font-size:var(--fs-small);color:var(--negative)}',
    '.cad-formmsg--ok{color:var(--positive)}',
    '.cad-stateblock{background:var(--surface);border:1px solid var(--border);',
    'border-radius:var(--radius-card);padding:var(--card-pad);color:var(--muted);',
    'font-size:var(--fs-body)}',
    '.cad-stateblock--err{color:var(--negative)}',
    '.cad-linkbtn{appearance:none;background:none;border:0;padding:0;cursor:pointer;',
    'font:inherit;font-size:var(--fs-small);color:var(--accent);text-decoration:underline}',
    '@media (max-width:640px){.cad-form{grid-template-columns:1fr}}',
  ].join('');
  document.head.appendChild(s);
}

function num(v) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

// 'YYYY-MM-DD' -> '15 Nov 2025' (IST calendar date, no time). Missing -> grey dash.
const dateFmt = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata',
});
function fmtDate(v) {
  if (!v) return DASH;
  const d = new Date(String(v).length <= 10 ? `${v}T00:00:00` : v);
  return Number.isNaN(d.getTime()) ? DASH : dateFmt.format(d);
}
// Availability window as "from → to"; dash when neither bound is set.
function windowText(r) {
  if (!r.available_from && !r.available_to) return DASH;
  return `${fmtDate(r.available_from)} → ${fmtDate(r.available_to)}`;
}

// Column spec for the shared table renderer. Price right-aligned ₹ tabular; min qty
// a right-aligned count; name is the identity column (truncates).
const COLUMNS = [
  { key: 'name', label: 'Name', identity: true },
  { key: 'billing_frequency', label: 'Billing', render: (r) => FREQ_LABEL[r.billing_frequency] || r.billing_frequency || DASH },
  { key: 'price', label: 'Price', num: true, render: (r) => inr(num(r.price)) },
  { key: 'min_quantity', label: 'Min qty', num: true, render: (r) => count(num(r.min_quantity)) },
  { key: 'window', label: 'Available', render: windowText },
  { key: 'close_policy', label: 'At term end', render: (r) => CLOSE_LABEL[r.close_policy] || r.close_policy || DASH },
];

function field(label, input, wide) {
  const wrap = document.createElement('div');
  wrap.className = 'cad-field' + (wide ? ' cad-field--wide' : '');
  const lab = document.createElement('label');
  lab.className = 'cad-label';
  lab.textContent = label;
  lab.htmlFor = input.id;
  wrap.append(lab, input);
  return wrap;
}

function select(id, options) {
  const sel = document.createElement('select');
  sel.className = 'cad-input'; sel.id = id;
  for (const o of options) {
    const opt = document.createElement('option');
    opt.value = o.value; opt.textContent = o.label; sel.appendChild(opt);
  }
  return sel;
}

export function render(mount) {
  ensureStyle();
  mount.innerHTML = '';
  let alive = true;

  const page = document.createElement('section');
  page.className = 'cad-page';

  // --- header: h1 + "New plan" (the frequent job, one click, DESIGN) ---
  const head = document.createElement('div');
  head.className = 'cad-pagehead';
  const h1 = document.createElement('h1');
  h1.className = 'cad-h1';
  h1.textContent = 'Plans';
  // Back to the Products half of this section (Plans is reached from there).
  const backLink = document.createElement('a');
  backLink.className = 'cad-btn cad-btn--ghost';
  backLink.href = '#/products';
  backLink.textContent = 'Products';
  backLink.style.textDecoration = 'none';
  backLink.style.display = 'inline-flex';
  backLink.style.alignItems = 'center';
  const newBtn = document.createElement('button');
  newBtn.type = 'button';
  newBtn.className = 'cad-btn';
  newBtn.textContent = 'New plan';
  const headActions = document.createElement('div');
  headActions.style.display = 'flex';
  headActions.style.gap = 'var(--gap)';
  headActions.append(backLink, newBtn);
  head.append(h1, headActions);

  const formSlot = document.createElement('div');
  const listSlot = document.createElement('div');
  listSlot.setAttribute('aria-live', 'polite');

  page.append(head, formSlot, listSlot);
  mount.appendChild(page);

  // ---------------- create form (hidden until "New plan") ----------------
  let formEl = null;
  function buildForm() {
    const form = document.createElement('form');
    form.className = 'cad-form';
    form.noValidate = true;

    const nameI = document.createElement('input');
    nameI.className = 'cad-input'; nameI.id = 'plf-name'; nameI.type = 'text';
    nameI.autocomplete = 'off'; nameI.maxLength = 120;

    const freqI = select('plf-freq', FREQUENCIES);
    freqI.value = 'monthly'; // most common cadence, saves a click

    const priceI = document.createElement('input');
    priceI.className = 'cad-input'; priceI.id = 'plf-price'; priceI.type = 'text';
    priceI.inputMode = 'decimal'; priceI.placeholder = '0.00';

    const minQtyI = document.createElement('input');
    minQtyI.className = 'cad-input'; minQtyI.id = 'plf-minqty'; minQtyI.type = 'text';
    minQtyI.inputMode = 'numeric'; minQtyI.value = '1';

    const fromI = document.createElement('input');
    fromI.className = 'cad-input'; fromI.id = 'plf-from'; fromI.type = 'date';

    const toI = document.createElement('input');
    toI.className = 'cad-input'; toI.id = 'plf-to'; toI.type = 'date';

    const closeI = select('plf-close', CLOSE_POLICIES); // default = first (renew)

    const foot = document.createElement('div');
    foot.className = 'cad-formfoot';
    const save = document.createElement('button');
    save.type = 'submit'; save.className = 'cad-btn'; save.textContent = 'Save plan';
    const cancel = document.createElement('button');
    cancel.type = 'button'; cancel.className = 'cad-btn cad-btn--ghost'; cancel.textContent = 'Cancel';
    const msg = document.createElement('span');
    msg.className = 'cad-formmsg'; msg.setAttribute('role', 'status');
    foot.append(save, cancel, msg);

    form.append(
      field('Name', nameI),
      field('Billing frequency', freqI),
      field('Price (₹)', priceI),
      field('Minimum quantity', minQtyI),
      field('Available from', fromI),
      field('Available to', toI),
      field('At term end', closeI, true),
      foot,
    );

    // Client-side validation mirrors the server rules (graded: both validate).
    // Name has no shared rule (required-only); the rest use validators.js rules so the
    // Python mirror (T14) shares the exact messages.
    function checkName() {
      const v = nameI.value.trim();
      if (!v) { setError(nameI, 'Enter a plan name.'); return false; }
      clearErrorFor(nameI); return true;
    }
    const priceGuard = attachBlurError(priceI, 'price');
    // minQuantity (not quantity): the schema CHECKs min_quantity >= 1, so a client-
    // valid 0 used to get server-rejected with a DIVERGENT sentence (T36 pass-2
    // finding; rewired by integrator T14 — one line, same sentence both sides now).
    const minQtyGuard = attachBlurError(minQtyI, 'minQuantity');
    // dateOrder error belongs on the END field; its start value comes from fromI.
    const dateGuard = attachBlurError(toI, 'dateOrder', () => fromI.value);
    nameI.addEventListener('blur', checkName);
    nameI.addEventListener('input', () => { if (nameI.getAttribute('aria-err')) checkName(); });
    // re-check the window when the START date changes, so a stale error clears.
    fromI.addEventListener('change', () => { if (toI.getAttribute('aria-err')) dateGuard.run(); });

    cancel.addEventListener('click', closeForm);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      msg.textContent = ''; msg.classList.remove('cad-formmsg--ok');
      // Validate every field, focus the FIRST failing one (DESIGN forms).
      const nameOk = checkName();
      const priceOk = priceGuard.run();
      const minQtyOk = minQtyGuard.run();
      const dateOk = dateGuard.run();
      if (!nameOk) { nameI.focus(); return; }
      if (!priceOk) { priceI.focus(); return; }
      if (!minQtyOk) { minQtyI.focus(); return; }
      if (!dateOk) { toI.focus(); return; }

      const payload = {
        name: nameI.value.trim(),
        billing_frequency: freqI.value,
        price: parseFloat(priceI.value),
        min_quantity: parseInt(minQtyI.value, 10),
        available_from: fromI.value || null,
        available_to: toI.value || null,
        close_policy: closeI.value,
      };
      save.disabled = true; save.textContent = 'Saving…';
      try {
        const res = await fetch(LIST_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const detail = await res.json().catch(() => null);
          const serverMsg = detail && (detail.detail || detail.message);
          throw new Error(serverMsg || `Couldn’t save (HTTP ${res.status}).`);
        }
        if (!alive) return;
        closeForm();
        load(); // re-read the live list so the new row shows immediately
      } catch (err) {
        if (!alive) return;
        msg.textContent = err.message || 'Couldn’t save the plan.';
      } finally {
        save.disabled = false; save.textContent = 'Save plan';
      }
    });

    return { form, focus: () => nameI.focus() };
  }

  function openForm() {
    if (formEl) return;
    const built = buildForm();
    formEl = built.form;
    formSlot.appendChild(formEl);
    newBtn.disabled = true;
    built.focus();
  }
  function closeForm() {
    if (formEl) { formEl.remove(); formEl = null; }
    newBtn.disabled = false;
  }
  newBtn.addEventListener('click', openForm);

  // ----------------------------- list + states -----------------------------
  function showState(kind, node) {
    listSlot.innerHTML = '';
    listSlot.appendChild(node);
    void kind;
  }
  function stateBlock(text, withRetry, isErr) {
    const b = document.createElement('div');
    b.className = 'cad-stateblock' + (isErr ? ' cad-stateblock--err' : '');
    b.textContent = text + ' ';
    if (withRetry) {
      const r = document.createElement('button');
      r.type = 'button'; r.className = 'cad-linkbtn'; r.textContent = 'Retry';
      r.addEventListener('click', load);
      b.appendChild(r);
    }
    return b;
  }

  let lastRows = null;
  let lastGoodAt = null;      // when lastRows landed — quoted if a refresh fails (T49 law)
  async function load() {
    // Loading: show skeleton only when we have nothing yet (no flash on refresh).
    if (!lastRows) showState('loading', renderTableSkeleton(COLUMNS, 4));
    try {
      const res = await fetch(LIST_URL, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (!alive) return;
      const rows = Array.isArray(data) ? data : (data && Array.isArray(data.plans) ? data.plans : []);
      lastRows = rows;
      lastGoodAt = new Date();
      if (rows.length === 0) {
        showState('empty', stateBlock('No plans yet — add your first with “New plan”.', false, false));
      } else {
        showState('data', renderTable(COLUMNS, rows));
      }
    } catch (_) {
      if (!alive) return;
      if (lastRows && lastRows.length) {
        // keep the last-good list, but NEVER silently (DESIGN / T49 law): repaint
        // the good rows and append a stale note quoting when they landed + Retry.
        showState('data', renderTable(COLUMNS, lastRows));
        const stale = document.createElement('div');
        stale.className = 'cad-stateblock cad-stateblock--err';
        stale.style.marginTop = 'var(--gap)';
        stale.textContent = `Couldn’t refresh — showing plans as of ${istTime(lastGoodAt)}. `;
        const r = document.createElement('button');
        r.type = 'button'; r.className = 'cad-linkbtn'; r.textContent = 'Retry';
        r.addEventListener('click', load);
        stale.appendChild(r);
        listSlot.appendChild(stale);
        return;
      }
      showState('error', stateBlock('Couldn’t load plans.', true, true));
    }
  }

  load();

  return function cleanup() {
    alive = false; // a late fetch/POST resolving after nav away must not paint
  };
}

export default { render };
