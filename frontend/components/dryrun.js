// dryrun.js — T00 dry-run micro-task (owner: Saurabh)
// One tiny pure utility exercised ONLY by the 11:15 pipeline dry-run.
// clamp(n, lo, hi): keep a number inside [lo, hi]; non-finite input -> lo.
// (Useful for pinning chart y-scales / progress widths later, but ships here
//  purely to prove the claim→commit→push→test cycle end to end.)

export function clamp(n, lo, hi) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return lo;
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}
