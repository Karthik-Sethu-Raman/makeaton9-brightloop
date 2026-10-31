// overview.js — Overview screen (owner: Karthik since the 12:50 ABSORB; T35)
// Answers DESIGN's question: "How healthy is the recurring business right now?"
// Three blocks, one question each:
//   1. KPI strip — live from /api/live/summary, polled every 3s (dynamic D1).
//   2. Daily revenue chart — /api/reports/finance revenue_series, accent line,
//      refreshed on load / Refresh / every 20s (keep-old until new lands).
//   3. Overdue invoices — /api/reports/finance overdue rows (T21's server
//      verdict) + "View all (N)" into the Invoices screen.
// DESIGN chart law baked in: ONE series in the accent hue, 2px straight
// segments, no markers, no fill, 3-5 horizontal gridlines (zero baseline), y
// ticks 4-7 round steps with the top tick ABOVE max, 4-8 x labels never
// rotated, tabular figures, plain hover tooltips (label + value, no arrow).

import { inr, count, istTime, DASH } from '../components/fmt.js';
import { renderKpiStrip } from '../components/kpi.js';
import { createPoller } from '../components/poll.js';
import { renderTable, renderTableSkeleton } from '../components/table.js';
import { statusPill } from '../components/pill.js';

const SUMMARY_URL = '/api/live/summary';
const FINANCE_URL = '/api/reports/finance';
const POLL_MS = 3000;
const FINANCE_MS = 20000;
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
    // one vertical rhythm for the three blocks — single gutter value (DESIGN)
    '.cad-stack{display:flex;flex-direction:column;gap:var(--gap)}',
    // chart + overdue cards share the surface card frame
    '.cad-card{background:var(--surface);border:1px solid var(--border);',
    'border-radius:var(--radius-card);padding:var(--card-pad)}',
    '.cad-cardhead{display:flex;align-items:baseline;justify-content:space-between;',
    'gap:var(--gap);margin:0 0 12px;flex-wrap:wrap}',
    '.cad-h2{font-size:var(--fs-section);font-weight:500;color:var(--text);margin:0}',
    '.cad-sub{font-size:var(--fs-small);color:var(--faint)}',
    '.cad-sub--err{color:var(--negative)}',
    '.cad-viewall{font:inherit;font-size:var(--fs-small);color:var(--muted);',
    'text-decoration:underline}', // muted, NOT accent — Refresh stays the one accent control
    '.cad-chartsvg{display:block}',
    '.cad-chartsvg text{font-family:var(--font);fill:var(--faint)}',
    // loading: flat grey bars at real chart anatomy (3 gridline bars + axis bar)
    '.cad-chartskel{position:relative;height:206px}',
    '.cad-chartskel i{position:absolute;left:0;right:0;height:8px;',
    'background:var(--active);border-radius:var(--radius-chip)}',
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

function num(v) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

// 'YYYY-MM-DD' -> '15 Nov' (IST calendar day; date-only pinned to +05:30 so
// machines east of IST don't render the previous day).
const dayFmt = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata',
});
function fmtDay(iso) {
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00+05:30`);
  return Number.isNaN(d.getTime()) ? DASH : dayFmt.format(d);
}

// Round even y-step (1 / 2 / 2.5 / 5 x 10^k) aiming ~4 intervals — ticks land
// 4-7 by construction and the TOP tick sits strictly above the max (DESIGN).
function niceStep(maxV) {
  if (!(maxV > 0)) return 1000; // flat-zero chart still gets an honest scale
  const raw = maxV / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const mult = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return mult * mag;
}

// SVG line chart per DESIGN. container width drives pixel geometry (redrawn on
// resize by the caller); height fixed 180+26 = DESIGN phone band 160-200 + labels.
function drawRevenueChart(host, series) {
  const W = Math.max(300, Math.floor(host.clientWidth || 640));
  const H = 206;
  const padL = W < 480 ? 64 : 84; // room for the widest '₹20,000.00' tick label
  const padR = 8, padT = 8, axisH = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - axisH;

  const values = series.map((p) => num(p.total) || 0);
  const maxV = Math.max(0, ...values);
  const step = niceStep(maxV);
  const top = step * (Math.floor(maxV / step) + 1); // strictly above max
  const yOf = (v) => padT + plotH * (1 - v / top);
  const xOf = (i) => padL + (series.length <= 1 ? 0 : (plotW * i) / (series.length - 1));

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', W);
  svg.setAttribute('height', H);
  svg.setAttribute('class', 'cad-chartsvg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Daily revenue chart, ${inr(
    values.reduce((a, v) => a + v, 0))} over ${series.length} days`);

  // gridlines at each non-zero tick (3-5 of them) + the zero baseline; ticks
  // are text only — no y-axis line (DESIGN).
  const el = (name, attrs, text) => {
    const n = document.createElementNS(svgNS, name);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    return n;
  };
  for (let t = 0; t * step <= top + 0.005; t++) {
    const v = t * step;
    const y = Math.round(yOf(v)) + 0.5;
    svg.appendChild(el('line', {
      x1: padL, x2: W - padR, y1: y, y2: y,
      stroke: v === 0 ? 'var(--control)' : 'var(--grid)', 'stroke-width': 1,
    }));
    svg.appendChild(el('text', {
      x: 0, y: y - 4, 'font-size': '12',
    }, inr(v))).setAttribute('class', 'num');
  }

  // the ONE series: accent, 2px, straight segments, no markers, no fill.
  const points = values.map((v, i) => `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`);
  if (points.length) {
    svg.appendChild(el('path', {
      d: 'M' + points.join(' L'),
      fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    }));
  }

  // x labels: 4-8, never rotated — first anchored start, last anchored end.
  const n = series.length;
  const stride = Math.max(1, Math.floor((n - 1) / 4));
  const labelAt = new Set();
  for (let i = 0; i < n; i += stride) labelAt.add(i);
  labelAt.add(n - 1);
  for (const i of labelAt) {
    const t = el('text', { x: xOf(i), y: H - 8, 'font-size': '12',
      'text-anchor': i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle' },
    fmtDay(series[i].date));
    t.setAttribute('class', 'num');
    svg.appendChild(t);
  }

  // hover: one invisible hit-zone per day, plain "label · value" tooltip
  const zoneW = Math.max(8, plotW / Math.max(1, n));
  series.forEach((p, i) => {
    const rect = el('rect', {
      x: xOf(i) - zoneW / 2, y: padT, width: zoneW, height: plotH, fill: 'transparent',
    });
    rect.appendChild(el('title', null, `${fmtDay(p.date)} · ${inr(num(p.total))}`));
    svg.appendChild(rect);
  });

  host.appendChild(svg);
}

function chartSkeleton() {
  const d = document.createElement('div');
  d.className = 'cad-chartskel';
  // bars at the real gridline anatomy (75% / 50% / 25%) + the axis strip —
  // flat grey, real sizes, no shimmer, no layout shift when data lands.
  for (const top of ['16%', '42%', '68%']) {
    const i = document.createElement('i');
    i.style.top = top;
    d.appendChild(i);
  }
  const axis = document.createElement('i');
  axis.style.top = 'calc(100% - 8px)';
  d.appendChild(axis);
  return d;
}

// render(mount) -> cleanup(). The router calls cleanup() on navigation away so
// timers stop and we don't leak between screens.
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
  body.className = 'cad-stack';
  body.setAttribute('aria-live', 'polite');

  page.append(head, body);
  mount.appendChild(page);

  let lastData = null;      // last good /api/live/summary (keep-old-on-error)
  let lastTime = null;
  let errored = false;
  let alive = true;

  // ---- block 1: KPI strip (polled live) --------------------------------
  const kpiSlot = document.createElement('div');
  body.appendChild(kpiSlot);

  function paintKpis() {
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
      kpiSlot.innerHTML = '';
      kpiSlot.appendChild(block);
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
    kpiSlot.innerHTML = '';
    kpiSlot.appendChild(renderKpiStrip(items));
  }

  // ---- block 2 + 3: finance (chart + overdue), refetched on a slower clock
  const chartCard = document.createElement('div');
  chartCard.className = 'cad-card';
  const overdueCard = document.createElement('div');
  overdueCard.className = 'cad-card';
  body.append(chartCard, overdueCard);

  let finance = null;       // last good /api/reports/finance
  let financeAt = null;     // Date of that fetch
  let financeErr = false;

  function paintChart() {
    chartCard.innerHTML = '';
    const cardHead = document.createElement('div');
    cardHead.className = 'cad-cardhead';
    const h2 = document.createElement('h2');
    h2.className = 'cad-h2';
    h2.textContent = 'Daily revenue';
    const sub = document.createElement('span');
    sub.className = 'cad-sub';
    if (financeAt) {
      sub.textContent = `${finance.window_label} · as of ${istTime(financeAt)}`;
    }
    cardHead.append(h2, sub);
    chartCard.appendChild(cardHead);

    const plot = document.createElement('div');
    chartCard.appendChild(plot);

    if (!finance) {
      if (financeErr) {
        chartCard.removeChild(plot);
        const block = document.createElement('div');
        block.className = 'cad-stateblock cad-stateblock--err';
        block.textContent = 'Couldn’t load the revenue report. ';
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'cad-linkbtn';
        retry.textContent = 'Retry';
        retry.addEventListener('click', loadFinance);
        block.appendChild(retry);
        chartCard.appendChild(block);
      } else {
        plot.appendChild(chartSkeleton());
      }
      return;
    }
    drawRevenueChart(plot, finance.revenue_series);
    if (!(finance.series_total > 0)) {
      const empty = document.createElement('p');
      empty.className = 'cad-sub';
      empty.style.margin = '8px 0 0';
      empty.textContent = 'No payments in this range yet.';
      chartCard.appendChild(empty);
    }
    if (financeErr) {
      const err = document.createElement('p');
      err.className = 'cad-sub cad-sub--err';
      err.style.margin = '8px 0 0';
      err.append(document.createTextNode(
        `Couldn’t refresh — showing revenue as of ${istTime(financeAt)}. `));
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'cad-linkbtn';
      retry.textContent = 'Retry';
      retry.addEventListener('click', loadFinance);
      err.appendChild(retry);
      chartCard.appendChild(err);
    }
  }

  const OVERDUE_COLS = [
    { key: 'number', label: 'Number', identity: true },
    { key: 'customer_name', label: 'Customer' },
    { key: 'due_date', label: 'Due date', render: (r) => fmtDay(r.due_date) },
    { key: 'state', label: 'Status', render: () => statusPill('Overdue', 'negative') },
    { key: 'outstanding', label: 'Outstanding', num: true, render: (r) => inr(num(r.outstanding)) },
  ];

  function paintOverdue() {
    overdueCard.innerHTML = '';
    const cardHead = document.createElement('div');
    cardHead.className = 'cad-cardhead';
    const h2 = document.createElement('h2');
    h2.className = 'cad-h2';
    h2.textContent = 'Overdue invoices';
    cardHead.appendChild(h2);
    if (finance) {
      const viewAll = document.createElement('a');
      viewAll.className = 'cad-viewall';
      viewAll.href = '#/invoices';
      viewAll.textContent = `View all (${finance.overdue_count})`;
      cardHead.appendChild(viewAll);
    }
    overdueCard.appendChild(cardHead);

    if (!finance) {
      if (financeErr) {
        const block = document.createElement('div');
        block.className = 'cad-stateblock cad-stateblock--err';
        block.style.background = 'transparent';
        block.style.border = '0';
        block.style.padding = '0';
        block.textContent = 'Couldn’t load the overdue list. ';
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'cad-linkbtn';
        retry.textContent = 'Retry';
        retry.addEventListener('click', loadFinance);
        block.appendChild(retry);
        overdueCard.appendChild(block);
      } else {
        const sk = renderTableSkeleton(OVERDUE_COLS, 3);
        sk.style.background = 'transparent';
        sk.style.border = '0';
        overdueCard.appendChild(sk);
      }
      return;
    }
    if (!finance.overdue.length) {
      const empty = document.createElement('p');
      empty.className = 'cad-sub';
      empty.style.margin = '0';
      empty.textContent = 'No overdue invoices — nothing is past its due date.';
      overdueCard.appendChild(empty);
    } else {
      overdueCard.appendChild(renderTable(OVERDUE_COLS, finance.overdue));
    }
    if (financeErr) {
      const err = document.createElement('p');
      err.className = 'cad-sub cad-sub--err';
      err.style.margin = '8px 0 0';
      err.append(document.createTextNode(
        `Couldn’t refresh — showing overdue as of ${istTime(financeAt)}. `));
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'cad-linkbtn';
      retry.textContent = 'Retry';
      retry.addEventListener('click', loadFinance);
      err.appendChild(retry);
      overdueCard.appendChild(err);
    }
  }

  function paintFinance() {
    paintChart();
    paintOverdue();
  }

  async function loadFinance() {
    try {
      const res = await fetch(FINANCE_URL, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (!alive) return;
      finance = data;
      financeAt = new Date();
      financeErr = false; // fresh data landed — clear any stale error note
      paintFinance();
    } catch (_) {
      if (!alive) return;
      financeErr = true; // keep-old values; blocks quote the last-good time
      paintFinance();
    }
  }

  // redraw the chart only when its width actually changed (debounced) — the
  // overdue table reflows on its own.
  let resizeTimer = 0;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (alive && finance) paintChart();
    }, 150);
  }
  window.addEventListener('resize', onResize);

  const poller = createPoller(SUMMARY_URL, POLL_MS, {
    onData(data) {
      lastData = data;
      const ts = field(data, 'updated_at');
      const parsed = ts ? new Date(ts) : new Date();
      lastTime = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
      errored = false;
      paintStatus();
      paintKpis();
    },
    onError() {
      errored = true;
      paintStatus();
      paintKpis();
    },
  });

  function paintStatus() {
    if (lastTime) {
      stamp.textContent = (errored ? 'Couldn’t refresh · updated ' : 'Updated ') + istTime(lastTime);
    } else if (errored) {
      stamp.textContent = 'Couldn’t load';
    } else {
      stamp.textContent = 'Loading…';
    }
    status.classList.toggle('cad-status--err', errored);
  }

  refreshBtn.addEventListener('click', () => { poller.refresh(); loadFinance(); });

  paintStatus();
  paintKpis();       // first paint = loading bars before the first response
  paintFinance();    // chart + overdue skeletons
  poller.start();
  loadFinance();
  const financeTimer = setInterval(loadFinance, FINANCE_MS);

  return function cleanup() {
    alive = false; // late fetches resolving after nav away must not paint
    poller.stop();
    clearInterval(financeTimer);
    clearTimeout(resizeTimer);
    window.removeEventListener('resize', onResize);
  };
}

export default { render };
