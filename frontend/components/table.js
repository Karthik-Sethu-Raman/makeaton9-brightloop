// table.js — shared data-table renderer for Cadence (owner: Saurabh)
// Bakes DESIGN.md's table rules in ONE place so every list screen (Products,
// Subscriptions, Invoices, Payments, Customers) looks identical:
//   - 12px grey sentence-case headers, no fill band, no zebra, 1px row rules
//   - numbers right-aligned + .num tabular, one right edge per row
//   - identity column 1/3–1/2 width, single-line truncate + ellipsis
//   - missing value -> grey dash (callers format; this just renders strings)
//   - below ~640px each row folds to a two-line stack (identity + key number
//     on line 1, other fields labelled on line 2) — never horizontal scroll.
//
// columns: [{ key, label, align?: 'right', num?: bool, identity?: bool,
//             render?: (row) => string|Node }]
// rows:    array of row objects. render() wins over row[key] when present.

const STYLE_ID = 'cad-table-style';

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = [
    '.cad-tablewrap{background:var(--surface);border:1px solid var(--border);',
    'border-radius:var(--radius-card);overflow:hidden}',
    '.cad-table{width:100%;border-collapse:collapse;font-size:var(--fs-body);color:var(--text)}',
    '.cad-table th{font-size:var(--fs-small);font-weight:400;color:var(--muted);',
    'text-align:left;padding:10px var(--card-pad);border-bottom:1px solid var(--border)}',
    '.cad-table th.cad-col--right{text-align:right}',
    '.cad-table td{padding:0 var(--card-pad);height:var(--row-height);',
    'border-top:1px solid var(--rule);vertical-align:middle;', // 1px row rules
    'max-width:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}', // truncate one line
    '.cad-table tbody tr:first-child td{border-top:0}',
    '.cad-table td.cad-col--right{text-align:right}',
    '.cad-table .cad-col--id{width:40%;color:var(--text)}', // identity column ~1/3–1/2
    '.cad-table .cad-cell__sub{display:none}', // line-2 label hidden on desktop
    // --- phone: fold each row into a two-line stacked block (DESIGN phone rules) ---
    '@media (max-width:640px){',
    '.cad-table,.cad-table tbody,.cad-table tr,.cad-table td{display:block;width:auto}',
    '.cad-table thead{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}',
    '.cad-table tr{border-top:1px solid var(--rule);padding:10px var(--card-pad)}',
    '.cad-table tbody tr:first-child{border-top:0}',
    '.cad-table td{height:auto;padding:1px 0;border:0;max-width:none;white-space:normal;',
    'display:flex;justify-content:space-between;gap:var(--gap)}',
    '.cad-table td.cad-col--id{width:auto;font-weight:500;padding-bottom:4px}',
    '.cad-table td.cad-col--right{text-align:right}',
    '.cad-table .cad-cell__sub{display:inline;font-size:13px;color:var(--faint)}',
    '}',
  ].join('');
  document.head.appendChild(s);
}

function fillCell(td, col, row) {
  const out = col.render ? col.render(row) : row[col.key];
  if (out instanceof Node) td.appendChild(out);
  else td.textContent = out == null ? '' : String(out);
}

// Build the table element. `rows` may be []; caller shows its own empty block
// (keeps the frame+header, per DESIGN states) rather than an empty table.
export function renderTable(columns, rows) {
  ensureStyle();
  const wrap = document.createElement('div');
  wrap.className = 'cad-tablewrap';

  const table = document.createElement('table');
  table.className = 'cad-table';

  const thead = document.createElement('thead');
  const htr = document.createElement('tr');
  for (const col of columns) {
    const th = document.createElement('th');
    if (col.align === 'right' || col.num) th.classList.add('cad-col--right');
    th.textContent = col.label;
    htr.appendChild(th);
  }
  thead.appendChild(htr);

  const tbody = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');
    for (const col of columns) {
      const td = document.createElement('td');
      if (col.identity) td.classList.add('cad-col--id');
      if (col.align === 'right' || col.num) td.classList.add('cad-col--right');
      if (col.num) td.classList.add('num');
      // line-2 label for the stacked phone layout (hidden on desktop by CSS)
      if (!col.identity) {
        const lbl = document.createElement('span');
        lbl.className = 'cad-cell__sub';
        lbl.textContent = col.label;
        td.appendChild(lbl);
      }
      const valSpan = document.createElement('span');
      fillCell(valSpan, col, row);
      td.appendChild(valSpan);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }

  table.append(thead, tbody);
  wrap.appendChild(table);
  return wrap;
}

// Loading skeleton: the final table layout with flat grey bars (no shimmer, no
// layout shift when real rows land). n rows of the same columns.
export function renderTableSkeleton(columns, n = 4) {
  const skelCol = { label: '' };
  const rows = Array.from({ length: n }, () => ({}));
  const cols = columns.map((c) => ({
    ...c,
    render: () => {
      const bar = document.createElement('span');
      bar.className = 'cad-skelbar';
      return bar;
    },
  }));
  ensureSkelStyle();
  const el = renderTable(cols, rows);
  void skelCol;
  return el;
}

const SKEL_STYLE_ID = 'cad-skelbar-style';
function ensureSkelStyle() {
  if (document.getElementById(SKEL_STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = SKEL_STYLE_ID;
  s.textContent = '.cad-skelbar{display:inline-block;height:12px;width:70%;'
    + 'background:var(--active);border-radius:var(--radius-chip)}';
  document.head.appendChild(s);
}

export default { renderTable, renderTableSkeleton };
