// router.js — hash router + sidebar nav for Cadence (owner: Saurabh, T06)
//
// Fills the shell's #nav with the 7 internal sections and mounts one page module
// into #view per route. Page modules export `render(mount) -> cleanup()`; we call
// the previous cleanup() before swapping so pollers/timers never leak between
// screens (overview.js polls /api/live/summary every 3s — it MUST be torn down).
//
// Routes load lazily via dynamic import(), so a screen whose module hasn't landed
// yet (products/invoices/… arrive with later tasks) simply shows an empty state
// instead of breaking the router. Adding a page = drop the module + add one ROUTES
// row; no other edit here.
//
// BOOT CONTRACT (static/index.html, Avanthik): the shell must load this module with
//   <script type="module" src="/frontend/pages/router.js"></script>
// before </body>. It self-initialises on DOMContentLoaded; nothing else to wire.

import { isAuthed, getUser, clearSession } from '../components/auth.js';

const ROUTES = [
  { path: 'overview',      label: 'Overview',         load: () => import('./overview.js') },
  { path: 'subscriptions', label: 'Subscriptions',    load: () => import('./subscriptions.js') },
  { path: 'products',      label: 'Products & plans', load: () => import('./products.js') },
  { path: 'invoices',      label: 'Invoices',         load: () => import('./invoices.js') },
  { path: 'payments',      label: 'Payments',         load: () => import('./payments.js') },
  { path: 'discounts',     label: 'Discounts',        load: () => import('./discounts.js') },
  { path: 'customers',     label: 'Customers',        load: () => import('./customers.js') },
];

// Routable but NOT in the sidebar nav: the auth screen (T46) and the customer portal
// (T31). Keeping them out of ROUTES is deliberate — they aren't internal destinations,
// so per DESIGN they don't earn a sidebar row. `login` renders standalone (sidebar
// hidden); `portal` shows the placeholder until portal.js lands.
const AUX = {
  login:  { label: 'Sign in', load: () => import('./login.js') },
  portal: { label: 'Customer portal', load: () => import('./portal.js') },
};
const DEFAULT_PATH = 'overview';
const byPath = new Map(ROUTES.map((r) => [r.path, r]));
// Resolve any known path (nav section OR aux) to its route record.
function routeFor(path) {
  return byPath.get(path) || AUX[path] || null;
}
const STYLE_ID = 'cad-router-style';

// Scoped styles for the not-yet-built placeholder screen. Tokens only (DESIGN law);
// mirrors overview.js's page frame so an unbuilt screen still looks like the app.
function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = [
    '.cad-rpage{padding:var(--pad);max-width:1180px}',
    '.cad-rh1{font-size:var(--fs-title);font-weight:600;color:var(--text);margin:0 0 var(--gap)}',
    '.cad-rempty{background:var(--surface);border:1px solid var(--border);',
    'border-radius:var(--radius-card);padding:var(--card-pad);color:var(--muted);',
    'font-size:var(--fs-body)}',
    // auth mode: hide the sidebar so the login card sits alone on the page ground
    // (DESIGN "no sidebar if ≤5 destinations" — the login screen has none).
    'body.cad-authmode .cad-sidebar{display:none}',
    'body.cad-authmode .cad-shell{grid-template-columns:1fr}',
    // sidebar user line: current user + logout (or a Sign in link when signed out).
    '.cad-userbar{margin-top:var(--gap);padding-top:var(--gap);',
    'border-top:1px solid var(--border);font-size:var(--fs-small);color:var(--muted);',
    'display:flex;flex-direction:column;gap:6px}',
    '.cad-userbar-email{color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  ].join('');
  document.head.appendChild(s);
}

// Current hash -> route path. `#/products` -> "products"; `#/login?mode=signup` ->
// "login"; empty -> overview; unknown -> overview (nav) sections only.
function currentPath() {
  const raw = (location.hash || '').replace(/^#\/?/, '');
  const seg = raw.split(/[/?]/)[0];
  return routeFor(seg) ? seg : DEFAULT_PATH;
}

// Build the sidebar nav once; anchors use real hash hrefs so a plain click (or
// middle-click / Ctrl-click to a new tab) navigates natively.
function buildNav(navEl) {
  navEl.textContent = '';
  for (const r of ROUTES) {
    const a = document.createElement('a');
    a.className = 'cad-navitem';
    a.href = `#/${r.path}`;
    a.dataset.path = r.path;
    a.textContent = r.label;
    navEl.appendChild(a);
  }
}

function setActive(navEl, path) {
  for (const a of navEl.querySelectorAll('.cad-navitem')) {
    const on = a.dataset.path === path;
    a.classList.toggle('is-active', on);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

function renderPlaceholder(mount, label) {
  ensureStyle();
  mount.innerHTML = '';
  const page = document.createElement('section');
  page.className = 'cad-rpage';
  const h1 = document.createElement('h1');
  h1.className = 'cad-rh1';
  h1.textContent = label;
  const empty = document.createElement('div');
  empty.className = 'cad-rempty';
  empty.textContent = 'This screen is being built — it will appear here shortly.';
  page.append(h1, empty);
  mount.appendChild(page);
}

// --- sidebar user line: current user + logout, or a Sign in link when signed out.
// Built once, lazily, into the sidebar (after #nav); refreshed on every navigation
// because the auth state flips when login.js redirects post-sign-in. Router owns the
// shell nav (T06), so this lives here rather than in a page module.
let userbarEl = null;
function updateUserbar(navEl) {
  const sidebar = navEl.parentElement;
  if (!sidebar) return;
  if (!userbarEl) {
    userbarEl = document.createElement('div');
    userbarEl.className = 'cad-userbar';
    sidebar.appendChild(userbarEl);
  }
  userbarEl.textContent = '';
  if (isAuthed()) {
    const user = getUser() || {};
    const who = document.createElement('div');
    who.className = 'cad-userbar-email';
    who.textContent = user.email || 'Signed in';
    who.title = who.textContent;
    const out = document.createElement('button');
    out.type = 'button';
    out.className = 'cad-linkbtn';
    out.textContent = 'Log out';
    out.addEventListener('click', () => {
      clearSession();
      location.hash = '#/login';
      updateUserbar(navEl); // reflect the signed-out state immediately
    });
    userbarEl.append(who, out);
  } else {
    const link = document.createElement('a');
    link.className = 'cad-linkbtn';
    link.href = '#/login';
    link.textContent = 'Sign in';
    userbarEl.appendChild(link);
  }
}

let currentCleanup = null;
let navToken = 0; // guards against two async loads racing (fast nav clicks)

async function navigate(navEl, viewEl) {
  const path = currentPath();
  setActive(navEl, path);

  // Auth mode (login screen): hide the sidebar so the card sits alone. Any other
  // route restores the shell. Keep the user line in step with the session.
  document.body.classList.toggle('cad-authmode', path === 'login');
  updateUserbar(navEl);

  // An already-signed-in user has no business on the login screen — send them home.
  if (path === 'login' && isAuthed()) {
    location.hash = '#/overview';
    return;
  }

  // Tear down the outgoing screen BEFORE loading the next (stop its pollers).
  if (currentCleanup) {
    try { currentCleanup(); } catch (_) { /* cleanup must never block nav */ }
    currentCleanup = null;
  }

  const route = routeFor(path) || byPath.get(DEFAULT_PATH);
  const token = ++navToken;

  let mod;
  try {
    mod = await route.load();
  } catch (_) {
    if (token !== navToken) return; // a newer navigation already won
    renderPlaceholder(viewEl, route.label); // module not built yet
    return;
  }
  if (token !== navToken) return;

  const render = mod && (mod.render || (mod.default && mod.default.render));
  if (typeof render !== 'function') {
    renderPlaceholder(viewEl, route.label);
    return;
  }
  const cleanup = render(viewEl);
  currentCleanup = typeof cleanup === 'function' ? cleanup : null;
}

function boot() {
  const navEl = document.getElementById('nav');
  const viewEl = document.getElementById('view');
  if (!navEl || !viewEl) return; // shell not present — nothing to drive

  buildNav(navEl);
  const run = () => navigate(navEl, viewEl);
  window.addEventListener('hashchange', run);

  if (!location.hash) {
    location.hash = '#/overview'; // lands on Overview; fires hashchange -> run()
  } else {
    run();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

export { ROUTES, currentPath };
