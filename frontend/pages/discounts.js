// discounts.js — Discounts screen (owner: Avanthik, T24; module absorbed from
// Saurabh by the integrator's 12:50 ABSORB enactment — logged in PROGRESS.md)
// Answers DESIGN's question: "Which price rules are live, and when do they stop?"
// One rules table (live DB rows, one status pill per rule) + a create form with
// client validation mirrored by the server. Dynamic data (D1): reads DB-backed
// endpoints, never static JSON — even the product-scope picker lists LIVE products.
//
// Endpoint contract this page reads/writes (documented here for T25 to match):
//   GET  /api/discounts  -> [{id,name,kind,value,min_purchase,min_quantity,
//                              start_date,end_date,usage_limit,used_count,
//                              scope,product_id,product_name?,active}]
//                              (or {discounts:[...]}), newest first (T10/T14
//                              convention — a just-created rule is the top row).
//                              product_name = join for product-scoped rules so
//                              the table shows a name, not an id.
//                            kind ∈ fixed|percentage, scope ∈ product|subscription
//                            (schema CHECK). value: ₹ amount when fixed, % when
//                            percentage. usage_limit/used_count: NULL = unlimited.
//   POST /api/discounts  <- {name,kind,value,min_purchase?,min_quantity?,
//                             start_date,end_date?,usage_limit?,scope,product_id?}
//                          201 -> the created row; 400/409 {detail:<sentence>}
//                          shown VERBATIM in the form message.
//                          ADMIN-ONLY (T25 guard + T32 RBAC): unauthenticated/
//                          non-admin GET -> 401/403 {detail} — the sentence is
//                          surfaced in the list error block, not swallowed.
//   Validation mirror for T25 (Karthik) — same sentences client AND server:
//     name   -> required('a discount name')        'Enter a discount name.'
//     value  -> fixed: 'price' rule | percentage: 'percent' rule (pctEmpty/pctBad
//               pinned in tests/test_validators_contract.py; py mirror:
//               `def percent(v): s=str(v or "").strip(); ok=bool(re.fullmatch(r"[0-9]+(\.[0-9]{1,2})?", s)) and float(s)<=100 if s else False`
//               with the same two messages)
//     min_purchase -> 'amount' rule WHEN PRESENT (blank = no threshold)
//     min_quantity -> 'quantity' rule WHEN PRESENT (blank = no threshold)
//     start_date   -> required('a start date')      'Enter a start date.'
//     end_date     -> dateOrder pair (MSG.dateOrder)
//     usage_limit  -> 'usageLimit' rule (blank = unlimited)
//     scope=product -> product_id required          'Choose a product.'
// Until T25 lands the page shows its error state with Retry (T12/T15/T18/T22
// precedent). Product picker reads GET /api/products (live, T10 — already up).
//
// Page-module API (router contract): export render(mount) -> cleanup().

import { inr, pct, count, istTime, DASH } from '../components/fmt.js';
import { renderTable, renderTableSkeleton } from '../components/table.js';
import { statusPill } from '../components/pill.js';
import { authHeaders } from '../components/auth.js';
import { validate, attachBlurError, validateForm, required } from '../validation/validators.js';

const LIST_URL = '/api/discounts';
const PRODUCTS_URL = '/api/products';
const STYLE_ID = 'cad-discounts-style';

function num(v) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

// IST calendar date as 'YYYY-MM-DD' (en-CA renders ISO shape) — the schema's
// date strings compare correctly against it lexicographically.
function todayISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

// 'YYYY-MM-DD' -> '15 Nov 2025'. Missing -> grey dash node (DESIGN dash law).
const dateFmt = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata',
});
function fmtDateEl(v) {
  if (!v) return dash();
  const d = new Date(String(v).length <= 10 ? `${v}T00:00:00` : v);
  return Number.isNaN(d.getTime()) ? dash() : document.createTextNode(dateFmt.format(d));
}
function dash() {
  const s = document.createElement('span');
  s.className = 'cad-dash';
  s.textContent = DASH;
  return s;
}

// ONE status mark per row. The hue reads as meaning: green = working now,
// amber = not yet started, grey = quiet/stopped (ended, exhausted or switched
// off — none of those are emergencies, they are history).
function statusOf(r) {
  if (r.active === 0 || r.active === false) return { label: 'Off', tone: 'neutral' };
  const today = todayISO();
  if (r.end_date && String(r.end_date) < today) return { label: 'Ended', tone: 'neutral' };
  const used = num(r.used_count);
  const limit = num(r.usage_limit);
  if (limit != null && used != null && used >= limit) return { label: 'Exhausted', tone: 'neutral' };
  if (r.start_date && String(r.start_date) > today) return { label: 'Scheduled', tone: 'warning' };
  return { label: 'Live', tone: 'positive' };
}

// The task's filter axes — counts render in the option labels so the select
// doubles as a mini answer ("Live (2)").
const FILTERS = [
  { value: 'all', label: 'All rules', match: () => true },
  { value: 'live', label: 'Live', match: (r) => statusOf(r).label === 'Live' },
  { value: 'scheduled', label: 'Scheduled', match: (r) => statusOf(r).label === 'Scheduled' },
  { value: 'stopped', label: 'Stopped', match: (r) => {
    const l = statusOf(r).label;
    return l === 'Ended' || l === 'Exhausted' || l === 'Off';
  } },
];
const EMPTY_FOR = {
  all: 'No discount rules yet — add one with “New rule”.',
  live: 'No live rules — a rule is live between its start and end dates.',
  scheduled: 'Nothing scheduled yet — future-dated rules wait here.',
  stopped: 'No stopped rules.',
};

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = [
    // page frame — same rules every screen injects (T12/T18/T22 convention)
    '.cad-page{padding:var(--pad);max-width:1180px}',
    '.cad-pagehead{display:flex;align-items:baseline;justify-content:space-between;',
    'gap:var(--gap);margin:0 0 var(--gap);flex-wrap:wrap}',
    '.cad-h1{font-size:var(--fs-title);font-weight:600;color:var(--text);margin:0}',
    '.cad-btn{appearance:none;height:var(--control-height);padding:0 14px;cursor:pointer;',
    'font:inherit;font-size:var(--fs-body);border-radius:var(--radius-control);',
    'border:1px solid var(--primary);background:var(--primary);color:var(--surface)}', // ONE primary/screen
    '.cad-btn--ghost{background:var(--surface);color:var(--text);border-color:var(--control)}',
    '.cad-btn[disabled]{cursor:not-allowed;opacity:.6}',
    '.cad-toolbar{display:flex;align-items:center;gap:8px;margin:0 0 var(--gap)}',
    '.cad-toolbar label{font-size:var(--fs-small);color:var(--muted)}',
    '.cad-toolbar select.cad-input{height:var(--control-height);background:var(--surface);',
    'min-width:170px}',
    // create form — same grid every form uses (products.js convention)
    '.cad-form{background:var(--surface);border:1px solid var(--border);',
    'border-radius:var(--radius-card);padding:var(--card-pad);margin:0 0 var(--gap);',
    'display:grid;grid-template-columns:1fr 1fr;gap:0 var(--gap)}', // 2 cols = 1fr+1fr
    '.cad-form .cad-field--wide{grid-column:1 / -1}',
    '.cad-form select.cad-input{height:38px;background:var(--surface)}',
    '.cad-formfoot{grid-column:1 / -1;display:flex;align-items:center;gap:var(--gap);',
    'margin-top:4px}',
    '.cad-formmsg{font-size:var(--fs-small);color:var(--negative)}',
    '.cad-fieldnote{grid-column:1 / -1;font-size:var(--fs-small);color:var(--muted);',
    'margin-top:-8px}',
    '@media (max-width:640px){.cad-form{grid-template-columns:1fr}}', // phone: single column
  ].join('');
  document.head.appendChild(s);
}

// Table columns. Value is the answer figure (right, ₹ or %); name is the
// identity column (truncates); ONE pill per row.
const COLUMNS = [
  { key: 'name', label: 'Name', identity: true },
  { key: 'value', label: 'Value', num: true, render: (r) => {
    const v = num(r.value);
    if (v == null) return dash();
    return document.createTextNode(r.kind === 'percentage' ? `${pct(v)} off` : `${inr(v)} off`);
  } },
  { key: 'scope', label: 'Scope', render: (r) => {
    if (r.scope === 'product') {
      if (r.product_name) return document.createTextNode(String(r.product_name));
      return r.product_id != null ? document.createTextNode(`Product #${r.product_id}`) : dash();
    }
    return document.createTextNode('Whole subscription');
  } },
  { key: 'minimum', label: 'Minimum', num: true, render: (r) => {
    const parts = [];
    if (num(r.min_purchase) != null) parts.push(inr(num(r.min_purchase)));
    if (num(r.min_quantity) != null) parts.push(`${count(num(r.min_quantity))}+ qty`);
    return parts.length ? document.createTextNode(parts.join(' · ')) : dash();
  } },
  { key: 'window', label: 'Window', render: (r) => {
    const wrap = document.createElement('span');
    wrap.appendChild(fmtDateEl(r.start_date));
    wrap.appendChild(document.createTextNode(' – '));
    if (r.end_date) wrap.appendChild(fmtDateEl(r.end_date));
    else wrap.appendChild(dash()); // open-ended rule: the stop date is unknown
    return wrap;
  } },
  { key: 'used', label: 'Used', num: true, render: (r) => {
    const used = num(r.used_count);
    const limit = num(r.usage_limit);
    if (used == null && limit == null) return dash();
    if (limit == null) return document.createTextNode(count(used)); // unlimited
    return document.createTextNode(`${count(used)} of ${count(limit)}`);
  } },
  { key: 'status', label: 'Status', render: (r) => {
    const info = statusOf(r);
    return statusPill(info.label, info.tone);
  } },
];

function field(labelText, input, wide) {
  const wrap = document.createElement('div');
  wrap.className = 'cad-field' + (wide ? ' cad-field--wide' : '');
  const lab = document.createElement('label');
  lab.className = 'cad-label';
  lab.textContent = labelText;
  lab.htmlFor = input.id;
  wrap.append(lab, input);
  return wrap;
}

export function render(mount) {
  ensureStyle();
  mount.innerHTML = '';
  let alive = true;
  let lastRows = null;        // last good list (survives a failed refresh)
  let lastGoodAt = null;      // T49(d) law: when lastRows landed — quoted if a refresh fails
  let filterValue = 'all';

  const page = document.createElement('section');
  page.className = 'cad-page';

  // --- header: h1 + "New rule" (the frequent job, one click, DESIGN) ---
  const head = document.createElement('div');
  head.className = 'cad-pagehead';
  const h1 = document.createElement('h1');
  h1.className = 'cad-h1';
  h1.textContent = 'Discounts';
  const newBtn = document.createElement('button');
  newBtn.type = 'button';
  newBtn.className = 'cad-btn';
  newBtn.textContent = 'New rule';
  head.append(h1, newBtn);

  const formSlot = document.createElement('div');
  const toolbar = document.createElement('div');
  toolbar.className = 'cad-toolbar';
  const flabel = document.createElement('label');
  flabel.textContent = 'Show';
  flabel.htmlFor = 'df-status';
  const fsel = document.createElement('select');
  fsel.className = 'cad-input'; fsel.id = 'df-status';
  for (const f of FILTERS) {
    const o = document.createElement('option');
    o.value = f.value; o.textContent = f.label; o.dataset.f = f.value;
    fsel.appendChild(o);
  }
  fsel.addEventListener('change', () => { filterValue = fsel.value; paintList(); });
  toolbar.append(flabel, fsel);

  const listSlot = document.createElement('div');
  listSlot.setAttribute('aria-live', 'polite');

  page.append(head, formSlot, toolbar, listSlot);
  mount.appendChild(page);

  // ----------------------------- list + states -----------------------------
  function showState(node) { listSlot.innerHTML = ''; listSlot.appendChild(node); }
  function stateBlock(text, withRetry, isErr) {
    const b = document.createElement('div');
    b.className = 'cad-stateblock' + (isErr ? ' cad-stateblock--err' : '');
    b.textContent = text + ' ';
    if (withRetry) {
      const r = document.createElement('button');
      r.type = 'button'; r.className = 'cad-linkbtn'; r.textContent = 'Retry';
      r.addEventListener('click', () => load());
      b.appendChild(r);
    }
    return b;
  }

  function paintList() {
    if (!lastRows) return;
    for (const o of fsel.options) { // live counts in the option labels
      const f = FILTERS.find((x) => x.value === o.dataset.f);
      const n = f ? lastRows.filter(f.match).length : 0;
      o.textContent = `${f.label} (${n})`;
    }
    const f = FILTERS.find((x) => x.value === filterValue) || FILTERS[0];
    const rows = lastRows.filter(f.match);
    if (rows.length === 0) {
      showState(stateBlock(EMPTY_FOR[f.value] || EMPTY_FOR.all, false, false));
    } else {
      showState(renderTable(COLUMNS, rows));
    }
  }

  async function load() {
    if (!lastRows) showState(renderTableSkeleton(COLUMNS, 4));
    try {
      // Admin-only resource (T25/T32): send the session token when present so a
      // signed-in admin just works; the server's 401/403 sentence shows otherwise.
      const res = await fetch(LIST_URL, { headers: authHeaders({ accept: 'application/json' }) });
      let body = null;
      try { body = await res.json(); } catch (_) { /* non-JSON error body */ }
      if (!res.ok) {
        const sentence = body && (body.detail || body.message);
        throw new Error(sentence ? `Couldn’t load discount rules. ${sentence}` : 'HTTP ' + res.status);
      }
      if (!alive) return;
      const rows = Array.isArray(body)
        ? body
        : (body && Array.isArray(body.discounts) ? body.discounts : []);
      lastRows = rows;
      lastGoodAt = new Date(); // the stamp a failed refresh must quote
      paintList();
    } catch (e) {
      if (!alive) return;
      if (lastRows && lastRows.length) {
        // keep the last-good list but SAY so — one sentence with the last-good
        // time + Retry, inside the block (DESIGN error law). Never silent.
        paintList();
        const stale = document.createElement('div');
        stale.className = 'cad-stateblock cad-stateblock--err';
        stale.textContent = `Couldn’t refresh — showing rules as of ${istTime(lastGoodAt)}. `;
        const r = document.createElement('button');
        r.type = 'button'; r.className = 'cad-linkbtn'; r.textContent = 'Retry';
        r.addEventListener('click', () => load());
        stale.appendChild(r);
        listSlot.appendChild(stale);
        return;
      }
      showState(stateBlock(e && e.message ? e.message : 'Couldn’t load discount rules.', true, true));
    }
  }

  // ---------------- create form (hidden until "New rule") ----------------
  let formEl = null;

  // Optional thresholds: blank = no threshold; any typed value must pass the
  // shared shape rule (the server validates the same way "when present").
  const optAmount = (v) => (String(v ?? '').trim() ? validate('amount', v) : { ok: true, message: '' });
  const optQuantity = (v) => (String(v ?? '').trim() ? validate('quantity', v) : { ok: true, message: '' });
  const productRequired = (v) => (String(v ?? '').trim()
    ? { ok: true, message: '' }
    : { ok: false, message: 'Choose a product.' });

  function buildForm() {
    const form = document.createElement('form');
    form.className = 'cad-form';
    form.noValidate = true;

    const nameI = document.createElement('input');
    nameI.className = 'cad-input'; nameI.id = 'df-name'; nameI.type = 'text';
    nameI.autocomplete = 'off'; nameI.maxLength = 120;

    const kindI = document.createElement('select');
    kindI.className = 'cad-input'; kindI.id = 'df-kind';
    for (const [v, t] of [['fixed', 'Fixed amount off (₹)'], ['percentage', 'Percentage off (%)']]) {
      const o = document.createElement('option');
      o.value = v; o.textContent = t; kindI.appendChild(o);
    }

    const valueI = document.createElement('input');
    valueI.className = 'cad-input'; valueI.id = 'df-value'; valueI.type = 'text';
    valueI.inputMode = 'decimal'; valueI.placeholder = '0.00';

    const scopeI = document.createElement('select');
    scopeI.className = 'cad-input'; scopeI.id = 'df-scope';
    for (const [v, t] of [['subscription', 'Whole subscription'], ['product', 'One product']]) {
      const o = document.createElement('option');
      o.value = v; o.textContent = t; scopeI.appendChild(o);
    }

    const minPurI = document.createElement('input');
    minPurI.className = 'cad-input'; minPurI.id = 'df-minpur'; minPurI.type = 'text';
    minPurI.inputMode = 'decimal'; minPurI.placeholder = 'e.g. 5000 (optional)';

    const minQtyI = document.createElement('input');
    minQtyI.className = 'cad-input'; minQtyI.id = 'df-minqty'; minQtyI.type = 'text';
    minQtyI.inputMode = 'numeric'; minQtyI.placeholder = 'e.g. 5 (optional)';

    const startI = document.createElement('input');
    startI.className = 'cad-input'; startI.id = 'df-start'; startI.type = 'date';

    const endI = document.createElement('input');
    endI.className = 'cad-input'; endI.id = 'df-end'; endI.type = 'date';

    const limitI = document.createElement('input');
    limitI.className = 'cad-input'; limitI.id = 'df-limit'; limitI.type = 'text';
    limitI.inputMode = 'numeric'; limitI.placeholder = 'blank = unlimited';

    const productI = document.createElement('select');
    productI.className = 'cad-input'; productI.id = 'df-product';
    const productField = field('Product', productI);
    const prodNote = document.createElement('div');
    prodNote.className = 'cad-fieldnote';
    prodNote.setAttribute('role', 'status');

    const foot = document.createElement('div');
    foot.className = 'cad-formfoot';
    const save = document.createElement('button');
    save.type = 'submit'; save.className = 'cad-btn'; save.textContent = 'Save rule';
    const cancel = document.createElement('button');
    cancel.type = 'button'; cancel.className = 'cad-btn cad-btn--ghost'; cancel.textContent = 'Cancel';
    const msg = document.createElement('span');
    // this span only ever carries ERRORS (a successful save closes the form) —
    // role=alert announces assertively, per the T47 flash convention.
    msg.className = 'cad-formmsg'; msg.setAttribute('role', 'alert');
    foot.append(save, cancel, msg);

    form.append(
      field('Name', nameI),
      field('Kind', kindI),
      field('Amount off (₹)', valueI),
      field('Applies to', scopeI),
      productField,
      field('Minimum purchase (₹)', minPurI),
      field('Minimum quantity', minQtyI),
      field('Start date', startI),
      field('End date (optional)', endI),
      field('Usage limit', limitI),
      foot,
    );

    // The value rule FOLLOWS the kind select: ₹ when fixed, % when percentage.
    // Rule functions are dispatched by validate() as-is, so the switch re-runs
    // on every blur/submit — a changed kind can never leave the old rule behind.
    const valueRule = (v) => validate(kindI.value === 'percentage' ? 'percent' : 'price', v);
    attachBlurError(nameI, required('a discount name'));
    const valueWiring = attachBlurError(valueI, valueRule);
    attachBlurError(minPurI, optAmount);
    attachBlurError(minQtyI, optQuantity);
    attachBlurError(startI, required('a start date'));
    attachBlurError(endI, 'dateOrder', () => startI.value);
    attachBlurError(limitI, 'usageLimit');
    attachBlurError(productI, productRequired);

    // Value field relabels with the kind; a typed value or showing error
    // re-checks immediately under the new rule (empty + clean stays clean —
    // required-ness first speaks on blur, per DESIGN).
    const valueLab = form.querySelector('label[for="df-value"]');
    kindI.addEventListener('change', () => {
      valueLab.textContent = kindI.value === 'percentage' ? 'Percentage off (%)' : 'Amount off (₹)';
      if (valueI.value.trim() || valueI.getAttribute('aria-err')) valueWiring.run();
    });

    // Product picker shows only for product scope; populate from the LIVE
    // products list (T10) — never a hardcoded dropdown.
    function syncScope() {
      const isProduct = scopeI.value === 'product';
      productField.style.display = isProduct ? '' : 'none';
      if (isProduct && productI.options.length === 0) loadProductOptions();
    }
    scopeI.addEventListener('change', syncScope);
    syncScope();

    async function loadProductOptions() {
      productI.innerHTML = '';
      const ph = document.createElement('option');
      ph.value = ''; ph.textContent = 'Loading products…';
      productI.appendChild(ph);
      prodNote.textContent = '';
      try {
        const res = await fetch(PRODUCTS_URL, { headers: { accept: 'application/json' } });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        if (!alive) return;
        const rows = Array.isArray(data) ? data : (data && Array.isArray(data.products) ? data.products : []);
        productI.innerHTML = '';
        const empty = document.createElement('option');
        empty.value = ''; empty.textContent = 'Choose a product';
        productI.appendChild(empty);
        for (const p of rows) {
          const o = document.createElement('option');
          o.value = String(p.id); o.textContent = p.name;
          productI.appendChild(o);
        }
      } catch (_) {
        if (!alive) return;
        productI.innerHTML = '';
        const bad = document.createElement('option');
        bad.value = ''; bad.textContent = 'Couldn’t load products';
        productI.appendChild(bad);
        prodNote.textContent = '';
        const r = document.createElement('button');
        r.type = 'button'; r.className = 'cad-linkbtn'; r.textContent = 'Retry';
        r.addEventListener('click', loadProductOptions);
        prodNote.appendChild(r);
      }
    }

    cancel.addEventListener('click', closeForm);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      msg.textContent = '';
      // Validate every field; focus jumps to the FIRST error (DESIGN forms).
      const fields = [
        { input: nameI, rule: required('a discount name') },
        { input: valueI, rule: valueRule },
        { input: minPurI, rule: optAmount },
        { input: minQtyI, rule: optQuantity },
        { input: startI, rule: required('a start date') },
        { input: endI, rule: 'dateOrder', getPairValue: () => startI.value },
        { input: limitI, rule: 'usageLimit' },
      ];
      if (scopeI.value === 'product') fields.push({ input: productI, rule: productRequired });
      const gate = validateForm(fields);
      if (!gate.ok) return;

      const optFloat = (s) => (String(s ?? '').trim() ? parseFloat(s) : null);
      const optInt = (s) => (String(s ?? '').trim() ? parseInt(s, 10) : null);
      const payload = {
        name: nameI.value.trim(),
        kind: kindI.value,
        value: parseFloat(valueI.value),
        min_purchase: optFloat(minPurI.value),
        min_quantity: optInt(minQtyI.value),
        start_date: startI.value,
        end_date: endI.value || null,
        usage_limit: optInt(limitI.value),
        scope: scopeI.value,
        product_id: scopeI.value === 'product' ? optInt(productI.value) : null,
      };
      save.disabled = true; save.textContent = 'Saving…';
      try {
        const res = await fetch(LIST_URL, {
          method: 'POST',
          headers: authHeaders({ 'content-type': 'application/json', accept: 'application/json' }),
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const detail = await res.json().catch(() => null);
          const serverMsg = detail && (detail.detail || detail.message);
          throw new Error(serverMsg || `Couldn’t save (HTTP ${res.status}).`);
        }
        if (!alive) return;
        closeForm();
        load(); // re-read the live list so the new rule is the top row
      } catch (err) {
        if (!alive) return;
        msg.textContent = err.message || 'Couldn’t save the rule.';
      } finally {
        save.disabled = false; save.textContent = 'Save rule';
      }
    });

    return { form, focus: () => nameI.focus() };
  }

  function openForm() {
    if (formEl) return;
    const built = buildForm();
    formEl = built.form;
    formSlot.appendChild(formEl);
    newBtn.disabled = true; // one primary action on screen at a time
    built.focus();
  }
  function closeForm() {
    if (formEl) { formEl.remove(); formEl = null; }
    newBtn.disabled = false;
  }
  newBtn.addEventListener('click', openForm);

  if (lastRows) paintList(); else load();

  return function cleanup() {
    alive = false; // a late fetch resolving after nav away must not paint
  };
}

export default { render };
