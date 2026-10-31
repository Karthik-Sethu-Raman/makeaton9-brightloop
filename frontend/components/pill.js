// pill.js — shared status pill for Cadence (owner: Saurabh)
// DESIGN "Status pills": pale tint + dark text of the SAME hue (never a saturated
// fill + white text), ONE status mark per row. Four tones map onto DESIGN's token
// pairs; neutral uses the grey --active chip so "nothing special" never shouts.
//   positive -> --pill-positive-bg / --pill-positive-ink   (green: good/settled)
//   warning  -> --pill-warning-bg  / --pill-warning-ink    (amber: in progress)
//   negative -> --pill-negative-bg / --pill-negative-ink   (red: bad/stopped)
//   neutral  -> --active chip + --muted ink                (grey: draft/quiet)
//
// Usage: statusPill('Active', 'positive') -> <span> node. Callers own the
// label<->tone mapping (e.g. subscription/invoice states) so the hue reads as
// meaning, not decoration.

const STYLE_ID = 'cad-pill-style';

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = [
    '.cad-pill{display:inline-flex;align-items:center;height:22px;padding:0 10px;',
    'border-radius:999px;font-size:var(--fs-small);font-weight:500;line-height:1;',
    'white-space:nowrap;background:var(--active);color:var(--muted)}', // neutral default
    '.cad-pill--positive{background:var(--pill-positive-bg);color:var(--pill-positive-ink)}',
    '.cad-pill--warning{background:var(--pill-warning-bg);color:var(--pill-warning-ink)}',
    '.cad-pill--negative{background:var(--pill-negative-bg);color:var(--pill-negative-ink)}',
  ].join('');
  document.head.appendChild(s);
}

const TONES = new Set(['positive', 'warning', 'negative', 'neutral']);

// label: visible text. tone: one of TONES (unknown -> neutral grey).
export function statusPill(label, tone = 'neutral') {
  ensureStyle();
  const el = document.createElement('span');
  el.className = 'cad-pill' + (tone !== 'neutral' && TONES.has(tone) ? ` cad-pill--${tone}` : '');
  el.textContent = label == null ? '' : String(label);
  return el;
}

export default { statusPill };
