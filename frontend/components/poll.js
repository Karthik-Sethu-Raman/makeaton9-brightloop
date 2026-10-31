// poll.js — interval poller for live endpoints (owner: Saurabh)
// Fetches a JSON endpoint now and every intervalMs. Dynamic-data must-have
// (DECISIONS D1): the UI reads changing DB state, never static JSON.
// Callers keep the last-good values on error (DESIGN: "keep old values until new land").

export function createPoller(url, intervalMs, { onData, onError } = {}) {
  let timer = null;
  let stopped = false;
  let inFlight = false;

  // T36 pass-3: a hung request must not trap the screen in "loading" forever —
  // without a timeout inFlight never clears, so Retry (refresh) no-ops. Abort at
  // ~2x the interval (min 4s): long enough not to kill a merely-slow poll, short
  // enough that the caller's onError can repaint a Retry.
  const ABORT_MS = Math.max(intervalMs * 2, 4000);

  async function tick() {
    if (inFlight) return; // never stack requests if one is slow
    inFlight = true;
    const ac = typeof AbortController === 'function' ? new AbortController() : null;
    const killer = ac ? setTimeout(() => ac.abort(), ABORT_MS) : null;
    try {
      const res = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: ac ? ac.signal : undefined,
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (!stopped && typeof onData === 'function') onData(data);
    } catch (err) {
      if (!stopped && typeof onError === 'function') onError(err);
    } finally {
      if (killer) clearTimeout(killer);
      inFlight = false;
    }
  }

  function start() {
    stopped = false;
    tick();
    timer = setInterval(tick, intervalMs);
    return poller;
  }

  function stop() {
    stopped = true;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  const poller = { start, stop, refresh: tick };
  return poller;
}
