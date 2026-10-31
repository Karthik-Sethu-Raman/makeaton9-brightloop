// fmt.js — number/date formatting for Cadence (owner: Saurabh)
// ₹ en-IN grouping, fixed decimals per DESIGN.md, IST times. No hardcoded data.
// Missing values render as an em dash (DESIGN: "Missing = grey dash"); real zero prints.

const DASH = '—'; // em dash for missing values

const inrFmt = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const intFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

const pctFmt = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const timeFmt = new Intl.DateTimeFormat('en-IN', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Kolkata',
});

function isNum(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

// Money: ₹12,34,567.00 — null/NaN -> dash, but a real 0 prints "₹0.00".
export function inr(n) {
  return isNum(n) ? inrFmt.format(n) : DASH;
}

// Counts: integer en-IN grouping. Real 0 prints "0".
export function count(n) {
  return isNum(n) ? intFmt.format(n) : DASH;
}

// Percentages: one decimal, e.g. "12.5%".
export function pct(n) {
  return isNum(n) ? pctFmt.format(n) + '%' : DASH;
}

// "16:02" in IST. Accepts a Date, ISO string, or ms; invalid -> dash.
export function istTime(d = new Date()) {
  const dt = d instanceof Date ? d : new Date(d);
  return Number.isNaN(dt.getTime()) ? DASH : timeFmt.format(dt);
}

export { DASH };
