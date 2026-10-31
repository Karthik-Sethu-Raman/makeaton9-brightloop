// products.js — Products & plans screen, products half (owner: Saurabh, T12)
// Answers DESIGN's question: "What are we selling, at what price?"
// Lists products from the live DB and creates new ones. Dynamic data (D1): the
// table reads GET /api/products (DB-backed, Karthik T10) — never static JSON.
//
// Endpoint contract this page reads/writes:
//   GET  /api/products  -> [{id,name,type,sales_price,cost_price,notes}]  (or {products:[...]})
//   POST /api/products  <- {name,type,sales_price,cost_price,notes}
//                         201 on success; 4xx {detail|message} with a human sentence.
// Until T10 lands the page shows its error state with Retry (same pattern as overview).
//
// Page-module API (router contract): export render(mount) -> cleanup().

import { inr } from '../components/fmt.js';
import { renderTable, renderTableSkeleton } from '../components/table.js';
import { validate, setError, clearErrorFor } from '../validation/validators.js';

const LIST_URL = '/api/products';
const STYLE_ID = 'cad-products-style';

const TYPES = [
  { value: 'software', label: 'Software' },
  { value: 'addon', label: 'Add-on' },
  { value: 'service', label: 'Service' },
];
const TYPE_LABEL = Object.fromEntries(TYPES.map((t) => [t.value, t.label]));

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
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
    '.cad-form textarea.cad-input{height:auto;padding:8px 10px;resize:vertical;min-height:60px}',
    '.cad-form select.cad-input{height:38px;background:var(--surface)}',
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

// Column spec for the shared table renderer. Prices right-aligned, ₹ tabular,
// name is the identity column (truncates), notes truncates with a dash fallback.
const COLUMNS = [
  { key: 'name', label: 'Name', identity: true },
  { key: 'type', label: 'Type', render: (r) => TYPE_LABEL[r.type] || r.type || '—' },
  { key: 'sales_price', label: 'Sales price', num: true, render: (r) => inr(num(r.sales_price)) },
  { key: 'cost_price', label: 'Cost price', num: true, render: (r) => inr(num(r.cost_price)) },
  { key: 'notes', label: 'Notes', render: (r) => (r.notes ? String(r.notes) : '—') },
];

function num(v) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

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

export function render(mount) {
  ensureStyle();
  mount.innerHTML = '';
  let alive = true;

  const page = document.createElement('section');
  page.className = 'cad-page';

  // --- header: h1 + "New product" (the frequent job, one click, DESIGN) ---
  const head = document.createElement('div');
  head.className = 'cad-pagehead';
  const h1 = document.createElement('h1');
  h1.className = 'cad-h1';
  h1.textContent = 'Products & plans';
  const newBtn = document.createElement('button');
  newBtn.type = 'button';
  newBtn.className = 'cad-btn';
  newBtn.textContent = 'New product';
  head.append(h1, newBtn);

  const formSlot = document.createElement('div');
  const listSlot = document.createElement('div');
  listSlot.setAttribute('aria-live', 'polite');

  page.append(head, formSlot, listSlot);
  mount.appendChild(page);

  // ---------------- create form (hidden until "New product") ----------------
  let formEl = null;
  function buildForm() {
    const form = document.createElement('form');
    form.className = 'cad-form';
    form.noValidate = true;

    const nameI = document.createElement('input');
    nameI.className = 'cad-input'; nameI.id = 'pf-name'; nameI.type = 'text';
    nameI.autocomplete = 'off'; nameI.maxLength = 120;

    const typeI = document.createElement('select');
    typeI.className = 'cad-input'; typeI.id = 'pf-type';
    for (const t of TYPES) {
      const o = document.createElement('option');
      o.value = t.value; o.textContent = t.label; typeI.appendChild(o);
    }

    const salesI = document.createElement('input');
    salesI.className = 'cad-input'; salesI.id = 'pf-sales'; salesI.type = 'text';
    salesI.inputMode = 'decimal'; salesI.placeholder = '0.00';

    const costI = document.createElement('input');
    costI.className = 'cad-input'; costI.id = 'pf-cost'; costI.type = 'text';
    costI.inputMode = 'decimal'; costI.placeholder = '0.00';

    const notesI = document.createElement('textarea');
    notesI.className = 'cad-input'; notesI.id = 'pf-notes'; notesI.rows = 2;

    const foot = document.createElement('div');
    foot.className = 'cad-formfoot';
    const save = document.createElement('button');
    save.type = 'submit'; save.className = 'cad-btn'; save.textContent = 'Save product';
    const cancel = document.createElement('button');
    cancel.type = 'button'; cancel.className = 'cad-btn cad-btn--ghost'; cancel.textContent = 'Cancel';
    const msg = document.createElement('span');
    msg.className = 'cad-formmsg'; msg.setAttribute('role', 'status');
    foot.append(save, cancel, msg);

    form.append(
      field('Name', nameI),
      field('Type', typeI),
      field('Sales price (₹)', salesI),
      field('Cost price (₹)', costI),
      field('Notes', notesI, true),
      foot,
    );

    // Client-side validation mirrors the server rules (graded: both validate).
    function checkName() {
      const v = nameI.value.trim();
      if (!v) { setError(nameI, 'Enter a product name.'); return false; }
      clearErrorFor(nameI); return true;
    }
    function checkPrice(input) {
      const r = validate('price', input.value);
      if (r.ok) { clearErrorFor(input); return true; }
      setError(input, r.message); return false;
    }
    nameI.addEventListener('blur', checkName);
    salesI.addEventListener('blur', () => checkPrice(salesI));
    costI.addEventListener('blur', () => checkPrice(costI));
    [nameI, salesI, costI].forEach((i) =>
      i.addEventListener('input', () => { if (i.getAttribute('aria-err')) i.dispatchEvent(new Event('blur')); }));

    cancel.addEventListener('click', closeForm);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      msg.textContent = ''; msg.classList.remove('cad-formmsg--ok');
      // Validate every field, focus the FIRST failing one (DESIGN forms).
      const nameOk = checkName();
      const salesOk = checkPrice(salesI);
      const costOk = checkPrice(costI);
      if (!nameOk) { nameI.focus(); return; }
      if (!salesOk) { salesI.focus(); return; }
      if (!costOk) { costI.focus(); return; }

      const payload = {
        name: nameI.value.trim(),
        type: typeI.value,
        sales_price: parseFloat(salesI.value),
        cost_price: parseFloat(costI.value),
        notes: notesI.value.trim(),
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
        msg.textContent = err.message || 'Couldn’t save the product.';
      } finally {
        save.disabled = false; save.textContent = 'Save product';
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
  async function load() {
    // Loading: show skeleton only when we have nothing yet (no flash on refresh).
    if (!lastRows) showState('loading', renderTableSkeleton(COLUMNS, 4));
    try {
      const res = await fetch(LIST_URL, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (!alive) return;
      const rows = Array.isArray(data) ? data : (data && Array.isArray(data.products) ? data.products : []);
      lastRows = rows;
      if (rows.length === 0) {
        showState('empty', stateBlock('No products yet — add your first with “New product”.', false, false));
      } else {
        showState('data', renderTable(COLUMNS, rows));
      }
    } catch (_) {
      if (!alive) return;
      if (lastRows && lastRows.length) return; // keep last-good list on a failed refresh
      showState('error', stateBlock('Couldn’t load products.', true, true));
    }
  }

  load();

  return function cleanup() {
    alive = false; // a late fetch/POST resolving after nav away must not paint
  };
}

export default { render };
