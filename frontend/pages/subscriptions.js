// subscriptions.js — Subscriptions screen (owner: Saurabh, T18)
// Answers DESIGN's question: "Where does every subscription stand today?"
// Lists every subscription from the live DB with a status pill per row, and a
// click-through detail view (lines, taxes, totals). Dynamic data (D1): the table
// reads GET /api/subscriptions and the detail GET /api/subscriptions/{id} — both
// DB-backed (Karthik T17), never static JSON.
//
// Endpoint contract this page reads (documented here for T17 to match):
//   GET /api/subscriptions            -> [{ id, number, customer_name, plan_name,
//                                           state, start_date, next_billing_date,
//                                           expiry_date, total }]  (or {subscriptions:[...]})
//        `total` = recurring amount (sum of line amounts per server);
//        missing -> grey dash. `state` ∈ draft|quotation|confirmed|active|closed.
//   GET /api/subscriptions/{id}       -> { ...list fields, payment_terms,
//                                          lines:[{description, quantity, unit_price,
//                                                  tax_percent, amount}],
//                                          subtotal, tax_total, total }
//        subtotal/tax_total/total optional — this page falls back to computing them
//        from `lines` so the detail totals are honest even before the server sends them.
// Until T17 lands the page shows its error state with Retry (products/plans precedent).
//
// Page-module API (router contract): export render(mount) -> cleanup().

import { inr, istTime, DASH } from '../components/fmt.js';
import { renderTable, renderTableSkeleton } from '../components/table.js';
import { statusPill } from '../components/pill.js';

const LIST_URL = '/api/subscriptions';
const STYLE_ID = 'cad-subs-style';

// Subscription lifecycle (schema.subscriptions.state CHECK). Label + pill tone: the
// hue reads as meaning — green = running, amber = pending activation, grey = quiet.
const STATES = [
  { value: 'draft',     label: 'Draft',     tone: 'neutral' },
  { value: 'quotation', label: 'Quotation', tone: 'neutral' },
  { value: 'confirmed', label: 'Confirmed', tone: 'warning' },
  { value: 'active',    label: 'Active',    tone: 'positive' },
  { value: 'closed',    label: 'Closed',    tone: 'neutral' },
];
const STATE_BY = Object.fromEntries(STATES.map((s) => [s.value, s]));
function stateInfo(v) {
  return STATE_BY[v] || { value: v, label: v || 'Unknown', tone: 'neutral' };
}

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = [
    '.cad-page{padding:var(--pad);max-width:1180px}',
    '.cad-pagehead{display:flex;align-items:baseline;justify-content:space-between;',
    'gap:var(--gap);margin:0 0 var(--gap);flex-wrap:wrap}',
    '.cad-h1{font-size:var(--fs-title);font-weight:600;color:var(--text);margin:0}',
    // one control row above the list (DESIGN: at most one) — the state filter.
    '.cad-toolbar{display:flex;align-items:center;gap:8px;margin:0 0 var(--gap)}',
    '.cad-toolbar label{font-size:var(--fs-small);color:var(--muted)}',
    '.cad-toolbar select.cad-input{height:var(--control-height);background:var(--surface);',
    'min-width:150px}',
    '.cad-btn{appearance:none;height:var(--control-height);padding:0 14px;cursor:pointer;',
    'font:inherit;font-size:var(--fs-body);border-radius:var(--radius-control);',
    'border:1px solid var(--control);background:var(--surface);color:var(--text)}',
    '.cad-stateblock{background:var(--surface);border:1px solid var(--border);',
    'border-radius:var(--radius-card);padding:var(--card-pad);color:var(--muted);',
    'font-size:var(--fs-body)}',
    '.cad-stateblock--err{color:var(--negative)}',
    '.cad-linkbtn{appearance:none;background:none;border:0;padding:0;cursor:pointer;',
    'font:inherit;font-size:var(--fs-small);color:var(--accent);text-decoration:underline}',
    // --- detail view ---
    '.cad-detailhead{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:0 0 var(--gap)}',
    '.cad-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px var(--gap);',
    'background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-card);',
    'padding:var(--card-pad);margin:0 0 var(--gap)}', // 2 cols = 1fr+1fr
    '.cad-meta dt{font-size:var(--fs-small);color:var(--muted);margin:0}',
    '.cad-meta dd{font-size:var(--fs-body);color:var(--text);margin:0 0 6px}',
    '.cad-totals{display:flex;flex-direction:column;gap:6px;align-items:flex-end;',
    'margin:var(--gap) 0 0}',
    '.cad-totline{display:flex;gap:var(--gap);min-width:260px;justify-content:space-between}',
    '.cad-totline span:first-child{color:var(--muted);font-size:var(--fs-body)}',
    '.cad-totline--grand span{font-weight:600;color:var(--text);font-size:var(--fs-section)}',
    '@media (max-width:640px){.cad-meta{grid-template-columns:1fr}',
    '.cad-totline{min-width:0;width:100%}}',
  ].join('');
  document.head.appendChild(s);
}

function num(v) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

// 'YYYY-MM-DD' -> '15 Nov 2025' (IST calendar date). Missing -> grey dash.
const dateFmt = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata',
});
function fmtDate(v) {
  if (!v) return DASH;
  const d = new Date(String(v).length <= 10 ? `${v}T00:00:00` : v);
  return Number.isNaN(d.getTime()) ? DASH : dateFmt.format(d);
}

// List columns for the shared table. Status is one pill (DESIGN: one mark/row);
// total right-aligned ₹ tabular; number is the identity column (truncates).
const COLUMNS = [
  { key: 'number', label: 'Number', identity: true },
  { key: 'customer_name', label: 'Customer', render: (r) => r.customer_name || DASH },
  { key: 'plan_name', label: 'Plan', render: (r) => r.plan_name || DASH },
  { key: 'state', label: 'Status', render: (r) => {
    const info = stateInfo(r.state);
    return statusPill(info.label, info.tone);
  } },
  { key: 'next_billing_date', label: 'Next billing', render: (r) => fmtDate(r.next_billing_date) },
  { key: 'total', label: 'Total', num: true, render: (r) => inr(num(r.total)) },
];

export function render(mount) {
  ensureStyle();
  mount.innerHTML = '';
  let alive = true;
  let lastRows = null;     // last good list (survives a failed refresh)
  let lastGoodAt = null;   // when lastRows landed — quoted if a refresh fails (T49 law)
  let filterState = 'all'; // client-side state filter over the live rows

  const page = document.createElement('section');
  page.className = 'cad-page';
  mount.appendChild(page);

  // ---------------------------- LIST view ----------------------------
  function viewList() {
    page.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'cad-pagehead';
    const h1 = document.createElement('h1');
    h1.className = 'cad-h1';
    h1.textContent = 'Subscriptions';
    head.appendChild(h1);

    const toolbar = document.createElement('div');
    toolbar.className = 'cad-toolbar';
    const flabel = document.createElement('label');
    flabel.textContent = 'State';
    flabel.htmlFor = 'subf-state';
    const fsel = document.createElement('select');
    fsel.className = 'cad-input'; fsel.id = 'subf-state';
    const allOpt = document.createElement('option');
    allOpt.value = 'all'; allOpt.textContent = 'All states';
    fsel.appendChild(allOpt);
    for (const st of STATES) {
      const o = document.createElement('option');
      o.value = st.value; o.textContent = st.label; fsel.appendChild(o);
    }
    fsel.value = filterState;
    fsel.addEventListener('change', () => { filterState = fsel.value; paintList(); });
    toolbar.append(flabel, fsel);

    const listSlot = document.createElement('div');
    listSlot.setAttribute('aria-live', 'polite');

    page.append(head, toolbar, listSlot);

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

    // Paint from lastRows + current filter (no refetch — instant filtering of live data).
    function paintList() {
      if (!lastRows) return;
      const rows = filterState === 'all'
        ? lastRows
        : lastRows.filter((r) => r.state === filterState);
      if (rows.length === 0) {
        const msg = filterState === 'all'
          ? 'No subscriptions yet — they appear here as customers subscribe.'
          : `No ${stateInfo(filterState).label.toLowerCase()} subscriptions right now.`;
        showState(stateBlock(msg, false, false));
      } else {
        showState(renderTable(COLUMNS, rows, { onRowClick: (row) => viewDetail(row) }));
      }
    }

    async function load() {
      if (!lastRows) showState(renderTableSkeleton(COLUMNS, 5));
      try {
        const res = await fetch(LIST_URL, { headers: { accept: 'application/json' } });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        if (!alive) return;
        const rows = Array.isArray(data)
          ? data
          : (data && Array.isArray(data.subscriptions) ? data.subscriptions : []);
        lastRows = rows;
        lastGoodAt = new Date();
        paintList();
      } catch (_) {
        if (!alive) return;
        if (lastRows && lastRows.length) {
          // keep the last-good list, but NEVER silently (DESIGN / T49 law): repaint
          // the good rows and append a stale note quoting when they landed + Retry.
          paintList();
          const stale = document.createElement('div');
          stale.className = 'cad-stateblock cad-stateblock--err';
          stale.style.marginTop = 'var(--gap)';
          stale.textContent = `Couldn’t refresh — showing subscriptions as of ${istTime(lastGoodAt)}. `;
          const r = document.createElement('button');
          r.type = 'button'; r.className = 'cad-linkbtn'; r.textContent = 'Retry';
          r.addEventListener('click', load);
          stale.appendChild(r);
          listSlot.appendChild(stale);
          return;
        }
        showState(stateBlock('Couldn’t load subscriptions.', true, true));
      }
    }

    // Already have rows (returning from detail) -> paint instantly; else fetch.
    if (lastRows) paintList(); else load();
  }

  // --------------------------- DETAIL view ---------------------------
  function viewDetail(rowStub) {
    page.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'cad-pagehead';
    const back = document.createElement('button');
    back.type = 'button'; back.className = 'cad-btn';
    back.textContent = '← Subscriptions';
    back.addEventListener('click', viewList);
    head.appendChild(back);
    page.appendChild(head);

    const body = document.createElement('div');
    body.setAttribute('aria-live', 'polite');
    page.appendChild(body);

    function paint(sub) {
      body.innerHTML = '';

      const title = document.createElement('div');
      title.className = 'cad-detailhead';
      const h1 = document.createElement('h1');
      h1.className = 'cad-h1';
      h1.textContent = sub.number || 'Subscription';
      const info = stateInfo(sub.state);
      title.append(h1, statusPill(info.label, info.tone));
      body.appendChild(title);

      // meta grid (2 cols) — who, what, when.
      const meta = document.createElement('dl');
      meta.className = 'cad-meta';
      const pairs = [
        ['Customer', sub.customer_name || DASH],
        ['Plan', sub.plan_name || DASH],
        ['Start date', fmtDate(sub.start_date)],
        ['Next billing', fmtDate(sub.next_billing_date)],
        ['Expiry', fmtDate(sub.expiry_date)],
        ['Payment terms', sub.payment_terms || DASH],
      ];
      for (const [k, v] of pairs) {
        const dt = document.createElement('dt'); dt.textContent = k;
        const dd = document.createElement('dd'); dd.textContent = v;
        meta.append(dt, dd);
      }
      body.appendChild(meta);

      // lines table (reuse shared renderer; static rows — no drill-down here).
      const lines = Array.isArray(sub.lines) ? sub.lines : [];
      const lineCols = [
        { key: 'description', label: 'Description', identity: true },
        { key: 'quantity', label: 'Qty', num: true, render: (l) => (num(l.quantity) == null ? DASH : String(num(l.quantity))) },
        { key: 'unit_price', label: 'Unit price', num: true, render: (l) => inr(num(l.unit_price)) },
        { key: 'tax_percent', label: 'Tax', num: true, render: (l) => (num(l.tax_percent) == null ? DASH : `${num(l.tax_percent)}%`) },
        { key: 'amount', label: 'Amount', num: true, render: (l) => inr(num(l.amount)) },
      ];
      if (lines.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'cad-stateblock';
        empty.textContent = 'No lines on this subscription yet.';
        body.appendChild(empty);
      } else {
        body.appendChild(renderTable(lineCols, lines));
      }

      // totals — prefer server figures; fall back to computing from the lines so the
      // detail is honest even before T17 sends subtotal/tax/total.
      const subtotal = num(sub.subtotal) != null ? num(sub.subtotal)
        : lines.reduce((a, l) => a + (num(l.amount) || 0), 0);
      const taxTotal = num(sub.tax_total) != null ? num(sub.tax_total)
        : lines.reduce((a, l) => a + (num(l.amount) || 0) * (num(l.tax_percent) || 0) / 100, 0);
      const grand = num(sub.total) != null ? num(sub.total) : subtotal + taxTotal;

      const totals = document.createElement('div');
      totals.className = 'cad-totals';
      const totLine = (label, value, grandClass) => {
        const row = document.createElement('div');
        row.className = 'cad-totline' + (grandClass ? ' cad-totline--grand' : '');
        const l = document.createElement('span'); l.textContent = label;
        const v = document.createElement('span'); v.className = 'num'; v.textContent = inr(value);
        row.append(l, v); return row;
      };
      totals.append(
        totLine('Subtotal', subtotal, false),
        totLine('Tax', taxTotal, false),
        totLine('Total', grand, true),
      );
      body.appendChild(totals);
    }

    async function loadDetail() {
      // Paint what we already know from the list row immediately (no blank wait),
      // then enrich with lines/totals from the detail endpoint.
      paint(rowStub);
      if (rowStub.id == null) return;
      try {
        const res = await fetch(`${LIST_URL}/${encodeURIComponent(rowStub.id)}`,
          { headers: { accept: 'application/json' } });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const full = await res.json();
        if (!alive) return;
        paint(Object.assign({}, rowStub, full));
      } catch (_) {
        if (!alive) return;
        // We still have the list-row stub painted; surface a quiet line + Retry
        // under it rather than wiping the view.
        const note = document.createElement('div');
        note.className = 'cad-stateblock cad-stateblock--err';
        note.textContent = 'Couldn’t load the line detail. ';
        const r = document.createElement('button');
        r.type = 'button'; r.className = 'cad-linkbtn'; r.textContent = 'Retry';
        r.addEventListener('click', loadDetail);
        note.appendChild(r);
        body.appendChild(note);
      }
    }

    loadDetail();
  }

  viewList();

  return function cleanup() {
    alive = false; // a late fetch resolving after nav away must not paint
  };
}

export default { render };
