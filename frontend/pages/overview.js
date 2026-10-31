// overview.js — Overview screen (owner: Saurabh)
// Answers DESIGN's question: "How healthy is the recurring business right now?"
// Live KPI strip polled from /api/live/summary every 3s (dynamic data, D1).
//
// Endpoint contract this page reads (Manu's T03 /api/live/summary) — fields may sit
// at top level or nested under `kpis`; freshness from `updated_at` (ISO, IST) or
// else the client receive time:
//   { updated_at, kpis: { active_subscriptions, revenue_collected,
//                         outstanding, overdue_invoices } }
// Unknown/missing numbers render as a grey dash; a real 0 prints "0"/"₹0.00".

import { inr, count, istTime } from '../components/fmt.js';
import { renderKpiStrip } from '../components/kpi.js';
import { createPoller } from '../components/poll.js';

const SUMMARY_URL = '/api/live/summary';
const POLL_MS = 3000;
const STYLE_ID = 'cad-overview-style';

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = [
    '.cad-page{padding:var(--pad);max-width:1180px}', // 1180 within DESIGN 1100-1200
    '.cad-pagehead{display:flex;align-items:baseline;justify-content:space-between;',
    'gap:var(--gap);margin:0 0 var(--gap);flex-wrap:wrap}',
    '.cad-h1{font-size:var(--fs-title);font-weight:600;color:var(--text);margin:0}',
    '.cad-status{display:flex;align-items:baseline;gap:8px;font-size:var(--fs-small);',
    'color:var(--faint)}',
    '.cad-status--err{color:var(--negative)}',
    '.cad-linkbtn{appearance:none;background:none;border:0;padding:0;cursor:pointer;',
    'font:inherit;font-size:var(--fs-small);color:var(--accent);text-decoration:underline}',
    '.cad-stateblock{background:var(--surface);border:1px solid var(--border);',
    'border-radius:var(--radius-card);padding:var(--card-pad);color:var(--muted);',
    'font-size:var(--fs-body)}',
    '.cad-stateblock--err{color:var(--negative)}',
  ].join('');
  document.head.appendChild(s);
}

// Read a numeric field whether it sits top-level or under `kpis`.
function field(data, key) {
  if (!data) return null;
  if (data[key] != null) return data[key];
  if (data.kpis && data.kpis[key] != null) return data.kpis[key];
  return null;
}

// render(mount) -> cleanup(). The router calls cleanup() on navigation away so
// the 3s poller stops and we don't leak timers between screens.
export function render(mount) {
  ensureStyle();
  mount.innerHTML = '';

  const page = document.createElement('section');
  page.className = 'cad-page';

  // --- header: h1 + freshness stamp + refresh (one h1 per screen, DESIGN) ---
  const head = document.createElement('div');
  head.className = 'cad-pagehead';

  const h1 = document.createElement('h1');
  h1.className = 'cad-h1';
  h1.textContent = 'Overview';

  const status = document.createElement('div');
  status.className = 'cad-status';
  const stamp = document.createElement('span');
  const refreshBtn = document.createElement('button');
  refreshBtn.type = 'button';
  refreshBtn.className = 'cad-linkbtn';
  refreshBtn.textContent = 'Refresh';
  status.append(stamp, refreshBtn);
  head.append(h1, status);

  const body = document.createElement('div');
  body.setAttribute('aria-live', 'polite');

  page.append(head, body);
  mount.appendChild(page);

  let lastData = null; // last successful payload (keep-old-on-error)
  let lastTime = null; // Date of last good data
  let errored = false;

  function paint() {
    // Status line: freshness + optional error note.
    if (lastTime) {
      stamp.textContent = (errored ? 'Couldn’t refresh · updated ' : 'Updated ') + istTime(lastTime);
    } else if (errored) {
      stamp.textContent = 'Couldn’t load';
    } else {
      stamp.textContent = 'Loading…';
    }
    status.classList.toggle('cad-status--err', errored);

    // Body: error block only when we have NOTHING to show; otherwise keep the
    // strip (loading bars on first paint, real values once data lands).
    body.innerHTML = '';
    if (!lastData && errored) {
      const block = document.createElement('div');
      block.className = 'cad-stateblock cad-stateblock--err';
      block.textContent = 'Couldn’t reach the live feed. ';
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'cad-linkbtn';
      retry.textContent = 'Retry';
      retry.addEventListener('click', () => poller.refresh());
      block.appendChild(retry);
      body.appendChild(block);
      return;
    }

    const loading = !lastData;
    const d = lastData;
    const items = [
      { label: 'Revenue collected', value: inr(field(d, 'revenue_collected')), answer: true, loading },
      { label: 'Active subscriptions', value: count(field(d, 'active_subscriptions')), loading },
      { label: 'Still owed', value: inr(field(d, 'outstanding')), loading },
      { label: 'Overdue invoices', value: count(field(d, 'overdue_invoices')), loading },
    ];
    body.appendChild(renderKpiStrip(items));
  }

  const poller = createPoller(SUMMARY_URL, POLL_MS, {
    onData(data) {
      lastData = data;
      const ts = field(data, 'updated_at');
      const parsed = ts ? new Date(ts) : new Date();
      lastTime = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
      errored = false;
      paint();
    },
    onError() {
      errored = true;
      paint();
    },
  });

  refreshBtn.addEventListener('click', () => poller.refresh());

  paint(); // first paint = loading state before the first response lands
  poller.start();

  return function cleanup() {
    poller.stop();
  };
}

export default { render };
