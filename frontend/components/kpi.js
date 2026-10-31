// kpi.js — KPI strip renderer (owner: Saurabh)
// DESIGN.md KPI rules: ONE container split by 1px rules into equal columns
// (median 3-4), NOT a card-per-KPI with an icon circle, NO sparklines.
// Label (grey, small) ABOVE value (24px tabular). The screen's answer figure
// is 30-36px and >=1.3x its siblings (answer:true). Colours come only from
// tokens (var(--...)) — no raw hex lives outside tokens.css.

const STYLE_ID = 'cad-kpi-style';

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = [
    '.cad-kpis{display:flex;background:var(--surface);border:1px solid var(--border);',
    'border-radius:var(--radius-card);overflow:hidden}',
    '.cad-kpi{flex:1 1 0;padding:var(--card-pad);border-left:1px solid var(--rule);min-width:0}',
    '.cad-kpi:first-child{border-left:0}',
    '.cad-kpi__label{font-size:var(--fs-small);color:var(--muted);margin:0 0 6px;font-weight:400}',
    '.cad-kpi__value{font-size:var(--fs-kpi);font-weight:500;color:var(--text);line-height:1.15;',
    'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.cad-kpi--answer .cad-kpi__value{font-size:32px}', // answer figure: 32px, 1.33x siblings
    '.cad-kpi__skel{display:inline-block;height:20px;width:80px;background:var(--active);',
    'border-radius:var(--radius-chip)}', // loading: flat grey bar, no shimmer
    '.cad-kpi--answer .cad-kpi__skel{height:26px;width:120px}',
    '@media (max-width:640px){',
    '.cad-kpis{display:grid;grid-template-columns:1fr 1fr}',
    '.cad-kpi{border-left:0;border-top:1px solid var(--rule)}',
    '.cad-kpi:nth-child(-n+2){border-top:0}',
    '.cad-kpi:nth-child(2n){border-left:1px solid var(--rule)}',
    '}',
  ].join('');
  document.head.appendChild(s);
}

// items: [{ label, value, answer?, loading? }] -> a single strip element.
// loading cells show a flat grey bar at the real value size (no layout shift
// when data lands). Values carry .num so columns don't jitter on live update.
export function renderKpiStrip(items) {
  ensureStyle();
  const strip = document.createElement('div');
  strip.className = 'cad-kpis';
  for (const it of items) {
    const cell = document.createElement('div');
    cell.className = 'cad-kpi' + (it.answer ? ' cad-kpi--answer' : '');

    const label = document.createElement('p');
    label.className = 'cad-kpi__label';
    label.textContent = it.label;

    const val = document.createElement('div');
    val.className = 'cad-kpi__value num';
    if (it.loading) {
      const bar = document.createElement('span');
      bar.className = 'cad-kpi__skel';
      val.appendChild(bar);
    } else {
      val.textContent = it.value;
    }

    cell.append(label, val);
    strip.appendChild(cell);
  }
  return strip;
}
