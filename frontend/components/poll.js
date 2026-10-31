// poll.js — interval poller for live endpoints (owner: Saurabh)
// Fetches a JSON endpoint now and every intervalMs. Dynamic-data must-have
// (DECISIONS D1): the UI reads changing DB state, never static JSON.
// Callers keep the last-good values on error (DESIGN: "keep old values until new land").

export function createPoller(url, intervalMs, { onData, onError } = {}) {
  let timer = null;
  let stopped = false;
  let inFlight = false;

  async function tick() {
    if (inFlight) return; // never stack requests if one is slow
    inFlight = true;
    try {
      const res = await fetch(url, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (!stopped && typeof onData === 'function') onData(data);
    } catch (err) {
      if (!stopped && typeof onError === 'function') onError(err);
    } finally {
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
