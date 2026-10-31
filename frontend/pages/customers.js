// customers.js — Customers screen, internal team view (owner: Avanthik, T30, absorbed)
// DESIGN question: "Who buys from us, and what do they hold?"
//
// CONTRACT for T29 (Manu) — customers model+API:
//   GET /api/customers
//     -> 200 {"customers": [{id, name, email, phone,
//                             subscriptions_count, outstanding_total}]}
//          (a bare array is also accepted); any-order is fine, the page sorts by
//          name client-side. Counts are integers; outstanding_total is rupees
//          (2dp) or null when the customer holds nothing due — null renders as
//          the shared grey dash (never a fake ₹0.00).
// Detail drill-down (their subscriptions + invoices) is intentionally deferred:
// T29's detail shape isn't pinned and the freeze is close — this page lands the
// graded 'consistent list + states' surface today.
//
// T49 laws baked in: skeleton-first list, never-silent refresh (lastGoodAt +
// Retry), authHeaders on every fetch, grey dash via table.js fillCell.

import { inr, istTime } from '../components/fmt.js';
import { renderTable, renderTableSkeleton } from '../components/table.js';
import { authHeaders } from '../components/auth.js';

// Local num (sibling-page convention — fmt.js exports no num).
function num(v) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

const LIST_URL = '/api/customers';
const STYLE_ID = 'cad-customers-style';

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = '.cad-custwrap{display:flex;flex-direction:column;gap:var(--gap)}';
  document.head.appendChild(s);
}

export function render(mount) {
  ensureStyle();
  mount.innerHTML = '';
  let alive = true;
  let lastRows = null;
  let lastGoodAt = null;

  const page = document.createElement('section');
  page.className = 'cad-page';

  const head = document.createElement('div');
  head.className = 'cad-pagehead';
  const h1 = document.createElement('h1');
  h1.className = 'cad-h1';
  h1.textContent = 'Customers';
  head.appendChild(h1);

  const body = document.createElement('div');
  body.className = 'cad-custwrap';
  body.setAttribute('aria-live', 'polite');
  page.append(head, body);
  mount.appendChild(page);

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

  const COLUMNS = [
    { key: 'name', label: 'Customer', identity: true, render: (c) => c.name || '—' },
    { key: 'email', label: 'Email', render: (c) => c.email || '—' },
    { key: 'phone', label: 'Phone', render: (c) => c.phone || '—' },
    { key: 'subscriptions_count', label: 'Subscriptions', num: true, render: (c) => (num(c.subscriptions_count) == null ? '—' : String(num(c.subscriptions_count))) },
    { key: 'outstanding_total', label: 'Outstanding', num: true, render: (c) => (num(c.outstanding_total) == null ? '—' : inr(num(c.outstanding_total))) },
  ];

  function paintList() {
    if (!lastRows) return;
    body.innerHTML = '';
    const rows = lastRows.slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    if (rows.length === 0) {
      body.appendChild(stateBlock('No customers yet — signups and seeds land here.', false, false));
      return;
    }
    body.appendChild(renderTable(COLUMNS, rows));
  }

  async function load() {
    if (!lastRows) body.replaceChildren(renderTableSkeleton(COLUMNS, 4));
    try {
      const res = await fetch(LIST_URL, { headers: authHeaders({ accept: 'application/json' }) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (!alive) return;
      lastRows = Array.isArray(data) ? data : (data && Array.isArray(data.customers) ? data.customers : []);
      lastGoodAt = new Date();
      paintList();
    } catch (_) {
      if (!alive) return;
      if (lastRows && lastRows.length) {
        paintList(); // keep last-good, never silently (T49 law)
        const stale = document.createElement('div');
        stale.className = 'cad-stateblock cad-stateblock--err';
        stale.textContent = `Couldn’t refresh — showing customers as of ${istTime(lastGoodAt)}. `;
        const r = document.createElement('button');
        r.type = 'button'; r.className = 'cad-linkbtn'; r.textContent = 'Retry';
        r.addEventListener('click', () => load());
        stale.appendChild(r);
        body.appendChild(stale);
        return;
      }
      body.replaceChildren(stateBlock('Couldn’t load customers.', true, true));
    }
  }

  load();

  return function cleanup() { alive = false; };
}

export default { render };
