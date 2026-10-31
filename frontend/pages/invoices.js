// invoices.js — Invoices screen (owner: Avanthik, T22; module absorbed from
// Saurabh by the integrator's 12:50 ABSORB enactment — logged in PROGRESS.md)
// Answers DESIGN's question: "What was billed, and what is still unpaid?"
// Lists every invoice from the live DB with a paid/outstanding/overdue filter,
// one status pill per row, and a click-through detail (lines, taxes, totals,
// actions). Dynamic data (D1): reads the DB-backed endpoints, never static JSON.
//
// Endpoint contract this page reads (documented here for T21 to match):
//   GET /api/invoices          -> [{ id, number, customer_name, subscription_number,
//                                    issue_date, due_date, state, total,
//                                    amount_paid, outstanding, overdue }]
//                                (or { invoices: [...] })
//     state ∈ draft|confirmed|paid|cancelled (schema CHECK). outstanding =
//     total − amount_paid; overdue = confirmed && due_date < today IST &&
//     outstanding > 0. The page DERIVES both when fields are absent (below), so
//     the list is honest even before the server sends them.
//   GET /api/invoices/{id}     -> { ...list fields,
//                                    lines: [{description, quantity, unit_price,
//                                             tax_percent, amount}],
//                                    subtotal, discount_total, tax_total, total,
//                                    amount_paid, outstanding,
//                                    payments: [{method, amount, paid_on, note}] (opt) }
//     subtotal/discount/tax/total/paid optional — falls back to computing from
//     lines/payments so detail totals are honest pre-T21-extras.
//   POST /api/invoices/{id}/confirm | /cancel | /send
//     -> the UPDATED invoice object (detail shape). Illegal transition -> 409
//     {"detail": "<sentence>"} — the sentence is shown verbatim in the flash line.
//     Print is client-side (window.print); print CSS is T41.
// Until T21 lands the page shows its error state with Retry (T12/T15/T18 precedent).
//
// Page-module API (router contract): export render(mount) -> cleanup().

import { inr, pct, DASH } from '../components/fmt.js';
import { renderTable, renderTableSkeleton } from '../components/table.js';
import { statusPill } from '../components/pill.js';
import { authHeaders } from '../components/auth.js';

const LIST_URL = '/api/invoices';
const STYLE_ID = 'cad-invoices-style';

// Invoice lifecycle (schema.invoices.state CHECK). Pill tone reads as meaning:
// green = settled, amber = awaiting payment, red = past due, grey = quiet.
const STATES = {
  draft: { label: 'Draft', tone: 'neutral' },
  confirmed: { label: 'Confirmed', tone: 'warning' },
  paid: { label: 'Paid', tone: 'positive' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

// The task's filter axes. Match on the LIVE rows; counts render in the option
// labels so the select doubles as a mini answer ("Overdue (2)").
const FILTERS = [
  { value: 'all', label: 'All invoices', match: () => true },
  { value: 'paid', label: 'Paid', match: (r) => r.state === 'paid' },
  { value: 'outstanding', label: 'Outstanding', match: (r) => r.state === 'confirmed' && (outstandingOf(r) || 0) > 0.005 },
  { value: 'overdue', label: 'Overdue', match: isOverdue },
];
const EMPTY_FOR = {
  all: 'No invoices yet — they appear here when the billing run issues them.',
  paid: 'No paid invoices yet.',
  outstanding: 'Nothing outstanding — every confirmed invoice is fully paid.',
  overdue: 'No overdue invoices — nothing is past its due date.',
};

function num(v) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

// IST calendar date as 'YYYY-MM-DD' (en-CA locale renders ISO shape) — due_date
// strings compare correctly against it lexicographically.
function todayISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

// Server figure wins; else derive. Paid -> real 0 (prints ₹0.00 per DESIGN);
// draft/cancelled -> unknown (nothing is demanded yet / any more) -> grey dash.
function outstandingOf(r) {
  if (num(r.outstanding) != null) return num(r.outstanding);
  if (r.state === 'paid') return 0;
  if (r.state !== 'confirmed') return null;
  const t = num(r.total);
  if (t == null) return null;
  return Math.max(0, t - (num(r.amount_paid) || 0));
}

function isOverdue(r) {
  if (typeof r.overdue === 'boolean') return r.overdue; // server verdict wins
  const out = outstandingOf(r);
  return r.state === 'confirmed' && out != null && out > 0.005
    && !!r.due_date && String(r.due_date) < todayISO();
}

// ONE status mark per row: an overdue invoice shows "Overdue" (negative) — the
// hue carries the meaning better than "Confirmed" would on a past-due bill.
function stateInfo(r) {
  if (isOverdue(r)) return { label: 'Overdue', tone: 'negative' };
  return STATES[r.state] || { label: r.state || 'Unknown', tone: 'neutral' };
}

// Missing value -> grey dash INSIDE a .cad-dash span (DESIGN dash law; the class
// has existed in layout.css since the T36 audit). table.js renders Nodes.
function dash() {
  const s = document.createElement('span');
  s.className = 'cad-dash';
  s.textContent = DASH;
  return s;
}

// 'YYYY-MM-DD' -> '15 Nov 2025' (IST calendar date). Missing -> grey dash node.
const dateFmt = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata',
});
function fmtDateEl(v) {
  if (!v) return dash();
  const d = new Date(String(v).length <= 10 ? `${v}T00:00:00` : v);
  return Number.isNaN(d.getTime()) ? dash() : document.createTextNode(dateFmt.format(d));
}

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = [
    // page frame — same rules every list screen injects (T18 convention) so the
    // screens stay identical; state/flash/dash/linkbtn classes come from layout.css.
    '.cad-page{padding:var(--pad);max-width:1180px}',
    '.cad-pagehead{display:flex;align-items:baseline;justify-content:space-between;',
    'gap:var(--gap);margin:0 0 var(--gap);flex-wrap:wrap}',
    '.cad-h1{font-size:var(--fs-title);font-weight:600;color:var(--text);margin:0}',
    // one control row above the list (DESIGN: at most one) — the status filter.
    '.cad-toolbar{display:flex;align-items:center;gap:8px;margin:0 0 var(--gap)}',
    '.cad-toolbar label{font-size:var(--fs-small);color:var(--muted)}',
    '.cad-toolbar select.cad-input{height:var(--control-height);background:var(--surface);',
    'min-width:170px}',
    '.cad-btn{appearance:none;height:var(--control-height);padding:0 14px;cursor:pointer;',
    'font:inherit;font-size:var(--fs-body);border-radius:var(--radius-control);',
    'border:1px solid var(--control);background:var(--surface);color:var(--text)}',
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
    '.cad-duenote{font-size:var(--fs-small);color:var(--faint)}',
    // --- actions ---
    '.cad-actions{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 var(--gap)}',
    '.cad-actions .cad-btn[disabled]{opacity:.6;cursor:default}', // stays legible (DESIGN)
    '.cad-danger{margin:var(--gap) 0 0;padding-top:var(--gap);border-top:1px solid var(--border)}',
    '.cad-danger p{margin:0 0 8px;font-size:var(--fs-small);color:var(--muted)}',
    '.cad-btn--danger{color:var(--negative);border-color:var(--negative)}',
    '.cad-subhead{font-size:var(--fs-section);font-weight:500;color:var(--text);',
    'margin:var(--gap) 0 8px}',
    '@media (max-width:640px){.cad-meta{grid-template-columns:1fr}',
    '.cad-totline{min-width:0;width:100%}}',
  ].join('');
  document.head.appendChild(s);
}

// List columns. Outstanding is the screen's answer figure -> rightmost column;
// number is the identity column (truncates). One pill per row.
const COLUMNS = [
  { key: 'number', label: 'Number', identity: true },
  { key: 'customer_name', label: 'Customer', render: (r) => r.customer_name || dash() },
  { key: 'due_date', label: 'Due date', render: (r) => fmtDateEl(r.due_date) },
  { key: 'state', label: 'Status', render: (r) => {
    const info = stateInfo(r);
    return statusPill(info.label, info.tone);
  } },
  { key: 'total', label: 'Total', num: true, render: (r) => inr(num(r.total)) },
  { key: 'outstanding', label: 'Outstanding', num: true, render: (r) => inr(outstandingOf(r)) },
];

export function render(mount) {
  ensureStyle();
  mount.innerHTML = '';
  let alive = true;
  let lastRows = null;        // last good list (survives a failed refresh)
  let filterValue = 'all';    // client-side status filter over the live rows

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
    h1.textContent = 'Invoices';
    head.appendChild(h1);

    const toolbar = document.createElement('div');
    toolbar.className = 'cad-toolbar';
    const flabel = document.createElement('label');
    flabel.textContent = 'Show';
    flabel.htmlFor = 'invf-status';
    const fsel = document.createElement('select');
    fsel.className = 'cad-input'; fsel.id = 'invf-status';
    for (const f of FILTERS) {
      const o = document.createElement('option');
      o.value = f.value; o.textContent = f.label; o.dataset.f = f.value;
      fsel.appendChild(o);
    }
    fsel.value = filterValue;
    fsel.addEventListener('change', () => { filterValue = fsel.value; paintList(); });
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

    // Paint from lastRows + current filter (instant — no refetch to filter).
    function paintList() {
      if (!lastRows) return;
      // counts into the option labels (dynamic, from live rows)
      for (const o of fsel.options) {
        const f = FILTERS.find((x) => x.value === o.dataset.f);
        const n = f ? lastRows.filter(f.match).length : 0;
        o.textContent = `${f.label} (${n})`;
      }
      const f = FILTERS.find((x) => x.value === filterValue) || FILTERS[0];
      const rows = lastRows.filter(f.match);
      if (rows.length === 0) {
        showState(stateBlock(EMPTY_FOR[f.value] || EMPTY_FOR.all, false, false));
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
          : (data && Array.isArray(data.invoices) ? data.invoices : []);
        lastRows = rows;
        paintList();
      } catch (_) {
        if (!alive) return;
        if (lastRows && lastRows.length) return; // keep last-good list on failed refresh
        showState(stateBlock('Couldn’t load invoices.', true, true));
      }
    }

    if (lastRows) paintList(); else load();
  }

  // --------------------------- DETAIL view ---------------------------
  function viewDetail(rowStub) {
    page.innerHTML = '';
    let flash = null; // { kind: 'ok'|'err', text } — survives repaints of paint()

    const head = document.createElement('div');
    head.className = 'cad-pagehead';
    const back = document.createElement('button');
    back.type = 'button'; back.className = 'cad-btn';
    back.textContent = '← Invoices';
    back.addEventListener('click', viewList);
    head.appendChild(back);
    page.appendChild(head);

    const body = document.createElement('div');
    body.setAttribute('aria-live', 'polite');
    page.appendChild(body);

    // One POST action. Busy = label swap + disabled (T47 convention); the result
    // lands in the flash line (ok announces politely, err assertively).
    // T49(f): FastAPI 422 bodies put an ARRAY in detail — never render [object Object].
    // fire() accepts an optional onError callback (used by the cancel arm to re-arm).
    async function fire(verb, inv, btn, onError) {
      const orig = btn.textContent;
      btn.disabled = true; btn.textContent = 'Working…';
      flash = null;
      try {
        const res = await fetch(`${LIST_URL}/${encodeURIComponent(inv.id)}/${verb}`,
          { method: 'POST', headers: authHeaders({ accept: 'application/json' }) });
        let out = null;
        try { out = await res.json(); } catch (_) { /* non-JSON error body */ }
        if (!res.ok) {
          let msg = out && (out.detail || out.message);
          if (Array.isArray(msg)) msg = 'Check the invoice and try again.'; // 422 detail array
          throw new Error(msg || `Couldn’t ${verb} the invoice (HTTP ${res.status}).`);
        }
        const merged = mergeFresh(inv, out);
        // keep the list cache in step so Back shows the new state without a refetch
        if (lastRows) {
          const i = lastRows.findIndex((r) => r.id === merged.id);
          if (i >= 0) lastRows[i] = mergeFresh(lastRows[i], merged);
        }
        flash = {
          kind: 'ok',
          text: verb === 'confirm' ? 'Invoice confirmed.'
            : verb === 'send' ? 'Invoice sent to the customer.'
            : 'Invoice cancelled.',
        };
        paint(merged);
        // the state change may have removed the button that had focus — send it
        // to the result line instead of dropping it to <body>.
        paintFlash(true);
      } catch (e) {
        btn.disabled = false; btn.textContent = orig;
        flash = { kind: 'err', text: e && e.message ? e.message : 'Action failed.' };
        paintFlash();
        if (typeof onError === 'function') onError();
      }
    }

    // T49(e): derived fields (outstanding/overdue) go STALE across merges — if the
    // fresh response doesn't carry them, drop the old values so outstandingOf/
    // isOverdue re-derive from the new state instead of showing a cancelled
    // invoice as still owed.
    function mergeFresh(oldInv, fresh) {
      const base = Object.assign({}, oldInv);
      const f = fresh && typeof fresh === 'object' ? fresh : {};
      for (const k of ['outstanding', 'overdue']) {
        if (!(k in f)) delete base[k];
      }
      return Object.assign(base, f);
    }

    // The flash line: created/replaced in a fixed slot so it never moves layout.
    let flashSlot = null;
    function paintFlash(focusIt) {
      if (!flashSlot) return;
      flashSlot.innerHTML = '';
      if (!flash) return;
      const el = document.createElement('div');
      el.className = 'cad-flash cad-flash--' + flash.kind;
      el.setAttribute('role', flash.kind === 'ok' ? 'status' : 'alert');
      el.textContent = flash.text;
      el.tabIndex = -1;
      flashSlot.appendChild(el);
      if (focusIt) el.focus(); // repaint may remove the button that was focused
    }

    function paint(inv) {
      body.innerHTML = '';
      flashSlot = null;

      const info = stateInfo(inv);

      const title = document.createElement('div');
      title.className = 'cad-detailhead';
      const h1 = document.createElement('h1');
      h1.className = 'cad-h1';
      h1.textContent = inv.number || 'Invoice';
      title.append(h1, statusPill(info.label, info.tone));
      body.appendChild(title);

      // flash slot sits under the title — result of the last action stays visible
      flashSlot = document.createElement('div');
      body.appendChild(flashSlot);
      paintFlash(false);

      // meta grid (2 cols) — who, what, when.
      const meta = document.createElement('dl');
      meta.className = 'cad-meta';
      const pairs = [
        ['Customer', inv.customer_name || DASH],
        ['Subscription', inv.subscription_number || DASH],
        ['Issue date', fmtDateEl(inv.issue_date)],
        ['Due date', fmtDateEl(inv.due_date)],
      ];
      for (const [k, v] of pairs) {
        const dt = document.createElement('dt'); dt.textContent = k;
        const dd = document.createElement('dd');
        if (v instanceof Node) dd.appendChild(v); else dd.textContent = v;
        meta.append(dt, dd);
      }
      body.appendChild(meta);

      // ---- actions (non-destructive): one row above the numbers ----
      const acts = document.createElement('div');
      acts.className = 'cad-actions';
      const mkBtn = (label, onClick) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'cad-btn'; b.textContent = label;
        b.addEventListener('click', onClick);
        return b;
      };
      if (inv.state === 'draft') {
        acts.appendChild(mkBtn('Confirm', (e) => fire('confirm', inv, e.currentTarget)));
      }
      if (inv.state === 'confirmed') {
        acts.appendChild(mkBtn('Send to customer', (e) => fire('send', inv, e.currentTarget)));
      }
      if (inv.state === 'confirmed' || inv.state === 'paid') {
        acts.appendChild(mkBtn('Print', () => window.print())); // print CSS = T41
      }
      if (acts.childElementCount) body.appendChild(acts);

      // ---- lines table (shared renderer; static rows — no drill-down here) ----
      const lines = Array.isArray(inv.lines) ? inv.lines : [];
      const lineCols = [
        { key: 'description', label: 'Description', identity: true },
        { key: 'quantity', label: 'Qty', num: true, render: (l) => (num(l.quantity) == null ? dash() : String(num(l.quantity))) },
        { key: 'unit_price', label: 'Unit price', num: true, render: (l) => inr(num(l.unit_price)) },
        { key: 'tax_percent', label: 'Tax', num: true, render: (l) => pct(num(l.tax_percent)) },
        { key: 'amount', label: 'Amount', num: true, render: (l) => inr(num(l.amount)) },
      ];
      if (lines.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'cad-stateblock';
        empty.textContent = 'No lines on this invoice yet.';
        body.appendChild(empty);
      } else {
        body.appendChild(renderTable(lineCols, lines));
      }

      // ---- totals: server figures preferred; else computed from lines/payments ----
      const pays = Array.isArray(inv.payments) ? inv.payments : [];
      const subtotal = num(inv.subtotal) != null ? num(inv.subtotal)
        : lines.reduce((a, l) => a + (num(l.amount) || 0), 0);
      const discount = num(inv.discount_total) != null ? num(inv.discount_total) : 0;
      const taxTotal = num(inv.tax_total) != null ? num(inv.tax_total)
        : lines.reduce((a, l) => a + (num(l.amount) || 0) * (num(l.tax_percent) || 0) / 100, 0);
      const total = num(inv.total) != null ? num(inv.total) : subtotal - discount + taxTotal;
      const paid = num(inv.amount_paid) != null ? num(inv.amount_paid)
        : pays.reduce((a, p) => a + (num(p.amount) || 0), 0);
      const balance = outstandingOf(Object.assign({}, inv, { total }));

      const totals = document.createElement('div');
      totals.className = 'cad-totals';
      const totLine = (label, value, cls) => {
        const row = document.createElement('div');
        row.className = 'cad-totline' + (cls ? ' ' + cls : '');
        const l = document.createElement('span'); l.textContent = label;
        const v = document.createElement('span'); v.className = 'num'; v.textContent = inr(value);
        row.append(l, v); return row;
      };
      totals.append(
        totLine('Subtotal', subtotal, null),
        totLine('Discount', discount, null),
        totLine('Tax', taxTotal, null),
        totLine('Total', total, 'cad-totline--grand'),
        totLine('Paid', paid, null),
        totLine('Balance due', balance, null),
      );
      if (num(balance) != null && num(balance) > 0.005 && inv.state === 'confirmed') {
        const note = document.createElement('div');
        note.className = 'cad-duenote';
        const d = fmtDateEl(inv.due_date);
        note.append(document.createTextNode(isOverdue(inv) ? 'Was due ' : 'Due '), d);
        totals.appendChild(note);
      }
      body.appendChild(totals);

      // ---- payments received against this invoice (optional field) ----
      if (pays.length) {
        const METHODS = { upi: 'UPI', card: 'Card', bank_transfer: 'Bank transfer', cash: 'Cash', cheque: 'Cheque' };
        const h = document.createElement('h2');
        h.className = 'cad-subhead';
        h.textContent = 'Payments received';
        const payCols = [
          { key: 'paid_on', label: 'Paid on', identity: true, render: (p) => fmtDateEl(p.paid_on) },
          { key: 'method', label: 'Method', render: (p) => METHODS[p.method] || p.method || DASH },
          { key: 'note', label: 'Note', render: (p) => (p.note ? document.createTextNode(p.note) : dash()) },
          { key: 'amount', label: 'Amount', num: true, render: (p) => inr(num(p.amount)) },
        ];
        body.append(h, renderTable(payCols, pays));
      }

      // ---- destructive action: separate section + consequence words (DESIGN) ----
      if (inv.state === 'draft' || inv.state === 'confirmed') {
        const dz = document.createElement('div');
        dz.className = 'cad-danger';
        const p = document.createElement('p');
        p.textContent = 'Cancelling stops all payment requests for this invoice. '
          + 'This cannot be undone.';
        const cbtn = document.createElement('button');
        cbtn.type = 'button'; cbtn.className = 'cad-btn'; cbtn.textContent = 'Cancel invoice';
        // two-step arm: the confirmation NAMES THE OBJECT, then a 6s disarm timer.
        let armed = false; let timer = 0;
        cbtn.addEventListener('click', () => {
          if (!armed) {
            armed = true;
            cbtn.classList.add('cad-btn--danger');
            cbtn.textContent = `Really cancel ${inv.number || 'this invoice'}?`;
            timer = setTimeout(() => {
              armed = false; cbtn.classList.remove('cad-btn--danger');
              cbtn.textContent = 'Cancel invoice';
            }, 6000);
            return;
          }
          clearTimeout(timer);
          fire('cancel', inv, cbtn);
        });
        dz.append(p, cbtn);
        body.appendChild(dz);
      }
    }

    async function loadDetail() {
      // Paint the list-row stub immediately (no blank wait), then enrich.
      paint(rowStub);
      if (rowStub.id == null) return;
      try {
        const res = await fetch(`${LIST_URL}/${encodeURIComponent(rowStub.id)}`,
          { headers: { accept: 'application/json' } });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const full = await res.json();
        if (!alive) return;
        flash = null; // a fresh load clears a stale action result
        paint(mergeFresh(rowStub, full));
      } catch (_) {
        if (!alive) return;
        // The stub is still painted; surface a quiet line + Retry under it.
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
