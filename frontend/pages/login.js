// login.js — Sign in / Create account screen (owner: Saurabh, T46)
// Answers DESIGN's question for the auth seam: "Who are you, and what may you see?"
//
// One standalone auth card (no sidebar — the router hides it on this route, per
// DESIGN's "no sidebar if ≤5 destinations" rule, the same treatment as reset.html).
// Two modes in one form: Sign in (email+password) and Create account (adds confirm).
// Validation is client AND server (graded must-have): validators.js gates the fields
// here; the server mirrors the same rules/messages (T08). On success the token goes
// to localStorage via components/auth.js and we redirect by role — admin/staff to the
// internal Overview, a customer to their portal (T31).
//
// Reads/writes the AUTH CONTRACT documented in components/auth.js (T08, Karthik).
// Until T08 lands the form submits and shows its error/Retry state — same precedent
// as overview.js and reset.html (screen done against the contract, API pending).
//
// Page-module API (router contract): export render(mount) -> cleanup().

import { attachBlurError, validateForm, setError, clearErrorFor } from '../validation/validators.js';
import { setSession, landingHashFor, readAuthBody } from '../components/auth.js';

const STYLE_ID = 'cad-login-style';

// Scoped layout for the auth card inside #view. Centres the card on the page ground
// and sizes it like reset.html's standalone card. Tokens only (DESIGN law) — the
// card chrome itself comes from layout.css's shared .cad-auth-* classes (T33/T44).
function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = [
    '.cad-login{min-height:calc(100vh - 2px);display:flex;flex-direction:column;',
    'align-items:center;justify-content:center;gap:var(--gap);padding:var(--pad)}',
    '.cad-login-brand{display:flex;align-items:center;gap:8px}',
    '.cad-login-wordmark{font-size:var(--fs-section);font-weight:500;color:var(--text)}',
    '.cad-login-card{width:100%;max-width:380px;background:var(--surface);',
    'border:1px solid var(--border);border-radius:var(--radius-card);padding:var(--card-pad)}',
    '.cad-login-h1{margin:0 0 4px;font-size:var(--fs-title);font-weight:600;color:var(--text)}',
    '.cad-login-lede{margin:0 0 var(--gap);color:var(--muted);font-size:var(--fs-body)}',
    '.cad-login-form .cad-btn-primary{width:100%;margin-top:4px}',
    '.cad-login-alt{margin-top:var(--gap);font-size:var(--fs-small);color:var(--muted);',
    'display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between}',
    '.cad-login-result{margin-top:var(--gap);font-size:var(--fs-body)}',
    '.cad-login-result--err{color:var(--negative)}',
    '@media (max-width:720px){.cad-login-form .cad-btn-primary{height:44px}}',
  ].join('');
  document.head.appendChild(s);
}

// Copper-ring mark, same shape/markup as the sidebar + reset.html brand (colors via tokens).
function brandMark() {
  const span = document.createElement('span');
  span.innerHTML =
    '<svg class="cad-mark" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">' +
    '<circle class="cad-mark-ring" cx="10" cy="10" r="8"></circle>' +
    '<circle class="cad-mark-dot" cx="16.9" cy="6" r="2.2"></circle></svg>';
  return span.firstChild;
}

function field(labelText, input) {
  const wrap = document.createElement('div');
  wrap.className = 'cad-field';
  const lab = document.createElement('label');
  lab.className = 'cad-label';
  lab.textContent = labelText;
  lab.htmlFor = input.id;
  wrap.append(lab, input);
  return wrap;
}

// Mode comes from the hash query: #/login?mode=signup ; default is sign in.
function modeFromHash() {
  const q = (location.hash.split('?')[1] || '');
  return new URLSearchParams(q).get('mode') === 'signup' ? 'signup' : 'login';
}

export function render(mount) {
  ensureStyle();
  mount.innerHTML = '';
  let alive = true;

  const mode = modeFromHash();
  const isSignup = mode === 'signup';

  const page = document.createElement('section');
  page.className = 'cad-login';

  const brand = document.createElement('div');
  brand.className = 'cad-login-brand';
  const word = document.createElement('span');
  word.className = 'cad-login-wordmark';
  word.textContent = 'Cadence';
  brand.append(brandMark(), word);

  const card = document.createElement('div');
  card.className = 'cad-login-card';

  const h1 = document.createElement('h1');
  h1.className = 'cad-login-h1';
  h1.textContent = isSignup ? 'Create account' : 'Sign in';
  const lede = document.createElement('p');
  lede.className = 'cad-login-lede';
  lede.textContent = isSignup
    ? 'Set up your Cadence account to manage recurring billing.'
    : 'Sign in to your Cadence workspace.';

  const form = document.createElement('form');
  form.className = 'cad-login-form';
  form.noValidate = true;

  const emailI = document.createElement('input');
  emailI.className = 'cad-input'; emailI.id = 'login-email'; emailI.type = 'email';
  emailI.name = 'email'; emailI.autocomplete = 'email'; emailI.style.width = '100%';

  const passI = document.createElement('input');
  passI.className = 'cad-input'; passI.id = 'login-password'; passI.type = 'password';
  passI.name = 'password'; passI.style.width = '100%';
  passI.autocomplete = isSignup ? 'new-password' : 'current-password';

  form.append(field('Email', emailI), field('Password', passI));

  // Signup adds a confirm field. Match is a client-only UX check (not a server rule),
  // so its message lives here rather than in the mirrored MSG table.
  let confirmI = null;
  if (isSignup) {
    confirmI = document.createElement('input');
    confirmI.className = 'cad-input'; confirmI.id = 'login-confirm'; confirmI.type = 'password';
    confirmI.name = 'confirm'; confirmI.autocomplete = 'new-password'; confirmI.style.width = '100%';
    form.append(field('Confirm password', confirmI));
  }

  const submit = document.createElement('button');
  submit.type = 'submit'; submit.className = 'cad-btn-primary';
  submit.textContent = isSignup ? 'Create account' : 'Sign in';
  form.append(submit);

  const result = document.createElement('div');
  result.className = 'cad-login-result'; result.setAttribute('aria-live', 'polite');

  // Alt actions: switch mode + (sign-in only) forgot password -> standalone reset page.
  const alt = document.createElement('div');
  alt.className = 'cad-login-alt';
  const toggle = document.createElement('a');
  toggle.className = 'cad-linkbtn';
  toggle.href = isSignup ? '#/login' : '#/login?mode=signup';
  toggle.textContent = isSignup ? 'Have an account? Sign in' : 'Create an account';
  alt.appendChild(toggle);
  if (!isSignup) {
    const forgot = document.createElement('a');
    forgot.className = 'cad-linkbtn';
    forgot.href = '/reset.html'; // standalone reset page (T33), per its contract
    forgot.textContent = 'Forgot password?';
    alt.appendChild(forgot);
  }

  card.append(h1, lede, form, result, alt);
  page.append(brand, card);
  mount.appendChild(page);

  // --- validation wiring (client half of the graded must-have) ---
  attachBlurError(emailI, 'email');
  attachBlurError(passI, 'password');
  function checkConfirm() {
    if (!confirmI) return true;
    if (confirmI.value !== passI.value) { setError(confirmI, 'Passwords do not match.'); return false; }
    clearErrorFor(confirmI); return true;
  }
  if (confirmI) {
    confirmI.addEventListener('blur', checkConfirm);
    confirmI.addEventListener('input', () => { if (confirmI.getAttribute('aria-err')) checkConfirm(); });
    passI.addEventListener('input', () => { if (confirmI.getAttribute('aria-err')) checkConfirm(); });
  }

  function showError(text) {
    result.innerHTML = '';
    result.className = 'cad-login-result cad-login-result--err';
    result.textContent = text + ' ';
  }
  function showRetry(text) {
    showError(text);
    const r = document.createElement('button');
    r.type = 'button'; r.className = 'cad-linkbtn'; r.textContent = 'Retry';
    r.addEventListener('click', () => { result.innerHTML = ''; });
    result.appendChild(r);
  }
  function clearResult() { result.innerHTML = ''; result.className = 'cad-login-result'; }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearResult();
    // Gate on the rule results; validateForm renders inline errors + focuses the first.
    const v = validateForm([
      { input: emailI, rule: 'email' },
      { input: passI, rule: 'password' },
    ]);
    const confirmOk = checkConfirm();
    if (!v.ok) return;
    if (!confirmOk) { confirmI.focus(); return; }

    const url = isSignup ? '/api/auth/signup' : '/api/auth/login';
    submit.disabled = true;
    const label = submit.textContent;
    submit.textContent = isSignup ? 'Creating…' : 'Signing in…';
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ email: emailI.value.trim(), password: passI.value }),
      });
      const body = await res.json().catch(() => ({}));
      if (!alive) return;
      if (res.ok) {
        const { token, user } = readAuthBody(body);
        if (!token) { showRetry('Signed in but no session token was returned.'); return; }
        setSession(token, user);
        // Redirect by role; the hashchange re-renders the sidebar user line (router).
        location.hash = landingHashFor(user.role);
        return;
      }
      // Server detail for 400/401/409 is corrected in place — no Retry, no reload.
      const detail = body && (body.detail || body.message);
      if (res.status === 401) {
        showError(detail || 'Email or password is incorrect.');
      } else if (res.status === 409) {
        showError(detail || 'That email is already registered.');
      } else if (res.status === 400) {
        showError(detail || 'Please check the details and try again.');
      } else {
        showRetry('Couldn’t reach the server.'); // 5xx / unexpected — retryable
      }
    } catch (_) {
      if (!alive) return;
      showRetry('Couldn’t reach the server.'); // network failure — the only true Retry case
    } finally {
      if (alive) { submit.disabled = false; submit.textContent = label; }
    }
  });

  emailI.focus();

  return function cleanup() {
    alive = false; // a late login response resolving after nav away must not redirect
  };
}

export default { render };
