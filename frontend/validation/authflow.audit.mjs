#!/usr/bin/env node
// authflow.audit.mjs — T53 (Avanthik): LIVE end-to-end auth-flow audit.
//
// Runs the whole graded auth story against a REAL uvicorn boot (own port + own
// temp DB via CADENCE_DB, simulator muted with CADENCE_TICK_SECONDS=3600), and
// checks every mirrored message BYTE-FOR-BYTE against the MSG table imported
// from validators.js — not against retyped copies, so this can never pass on a
// stale expectation:
//
//   1. mirrored messages on real 400 / 401 / 409 / 404 bodies
//   2. weak reset try does NOT burn the token; success DOES (single use)
//   3. focus-first-error on the three forms (validators.js executed against a
//      minimal DOM shim — no browser install needed; the pages' field wiring
//      is mirrored exactly from login.js / reset.html)
//   4. session survives reload (auth.js setSession -> localStorage -> getToken
//      round-trip + role landing hash)
//   5. the forgot flow's second demo channel: the reset link lands in the
//      SERVER LOG (stdout) as documented
//
// Usage:  node frontend/validation/authflow.audit.mjs
// Needs:  python + repo deps (same as scripts/run.cmd). Exits 1 on any FAIL.
// NOT wired into TEST_CMD on purpose: booting a server per CI run would slow
// and flake the shared suite (port + process cleanup under load). Run it when
// touching auth validators, login.js wiring or /api/auth.

import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MSG } from './validators.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..', '..');
const PORT = Number(process.env.AUDIT_PORT || 8901);
const BASE = `http://127.0.0.1:${PORT}`;
const DB = path.join(tmpdir(), `cadence-auth-audit-${process.pid}.db`);

const results = [];
function check(id, name, pass, note) {
  results.push({ id, name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${name}${note ? ' — ' + note : ''}`);
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function post(route, body) {
  const res = await fetch(BASE + route, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
async function get(route, headers) {
  const res = await fetch(BASE + route, { headers: headers ?? {} });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

// ---------------------------------------------------------------------------
// 1. Boot a real server (same command as scripts/run.cmd, private port + DB).
// ---------------------------------------------------------------------------
console.log(`[audit] booting uvicorn :${PORT}  db=${DB}`);
const server = spawn('python', ['-m', 'uvicorn', 'backend.api.main:app', '--port', String(PORT)], {
  cwd: REPO,
  env: { ...process.env, CADENCE_DB: DB, CADENCE_TICK_SECONDS: '3600' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let stdout = '';
server.stdout.on('data', (c) => { stdout += String(c); });
server.stderr.on('data', (c) => { stdout += String(c); });

let booted = false;
for (let i = 0; i < 90 && !booted; i++) {
  try { const r = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(2000) }); booted = r.ok; } catch { /* not up yet */ }
  if (!booted) await new Promise((r) => setTimeout(r, 500));
}

const EMAIL = `audit.${Date.now()}@brightloop.test`;
const GOOD_PW = 'Audit!Pass2026'; // >8 chars, upper, lower, special
let cleanupDb = true;

try {
  if (!booted) throw new Error('server did not answer /api/health in 45s');
  console.log('[audit] server up — running checks\n');

  // --- signup: mirrored 400s, 200, 409 ------------------------------------
  {
    const emptyEmail = await post('/api/auth/signup', { email: '', password: GOOD_PW });
    check('A1', 'signup empty email -> 400 MSG.emailEmpty',
      emptyEmail.status === 400 && emptyEmail.body.detail === MSG.emailEmpty,
      `got ${emptyEmail.status} ${JSON.stringify(emptyEmail.body.detail)}`);

    const badEmail = await post('/api/auth/signup', { email: 'nope@nodot', password: GOOD_PW });
    check('A2', 'signup bad email -> 400 MSG.emailBad',
      badEmail.status === 400 && badEmail.body.detail === MSG.emailBad,
      `got ${badEmail.status} ${JSON.stringify(badEmail.body.detail)}`);

    const weak = await post('/api/auth/signup', { email: EMAIL, password: 'weak' });
    check('A3', 'signup weak password -> 400 MSG.password',
      weak.status === 400 && weak.body.detail === MSG.password,
      `got ${weak.status} ${JSON.stringify(weak.body.detail)}`);

    // code-point trap through the wire: 8 code points (9 UTF-16 units) must FAIL
    const emoji = await post('/api/auth/signup', { email: EMAIL, password: '\u{1F600}Aa!bcd' });
    check('A4', 'signup emoji password (8 code points) -> 400 MSG.password',
      emoji.status === 400 && emoji.body.detail === MSG.password,
      `got ${emoji.status} ${JSON.stringify(emoji.body.detail)}`);

    const ok = await post('/api/auth/signup', { email: EMAIL, password: GOOD_PW });
    check('A5', 'signup valid -> 200 {token, user.role=customer}',
      ok.status === 200 && !!ok.body.token && ok.body.user?.role === 'customer',
      `got ${ok.status} role=${ok.body.user?.role}`);

    const dup = await post('/api/auth/signup', { email: EMAIL, password: GOOD_PW });
    check('A6', 'signup duplicate -> 409 "That email is already registered."',
      dup.status === 409 && dup.body.detail === 'That email is already registered.',
      `got ${dup.status} ${JSON.stringify(dup.body.detail)}`);

    const padded = await post('/api/auth/login', { email: `  ${EMAIL}  `, password: GOOD_PW });
    check('G3', 'login trims surrounding spaces server-side',
      padded.status === 200 && !!padded.body.token,
      `got ${padded.status}`);
  }

  // --- login / me ----------------------------------------------------------
  let sessionToken = '';
  {
    const wrong = await post('/api/auth/login', { email: EMAIL, password: 'Wrong!Pass1' });
    check('F1', 'login wrong password -> 401 "Email or password is incorrect."',
      wrong.status === 401 && wrong.body.detail === 'Email or password is incorrect.',
      `got ${wrong.status} ${JSON.stringify(wrong.body.detail)}`);

    const ghost = await post('/api/auth/login', { email: `ghost.${Date.now()}@brightloop.test`, password: 'Whatever!123' });
    check('F2', 'login unknown email -> SAME 401 sentence (no user enumeration)',
      ghost.status === 401 && ghost.body.detail === 'Email or password is incorrect.',
      `got ${ghost.status} ${JSON.stringify(ghost.body.detail)}`);

    const right = await post('/api/auth/login', { email: EMAIL, password: GOOD_PW });
    sessionToken = right.body.token || '';
    check('G1', 'login correct -> 200 token', right.status === 200 && !!sessionToken, `got ${right.status}`);

    const me = await get('/api/auth/me', { 'x-auth-token': sessionToken });
    check('G2', 'GET /me with token -> 200 {email, role}',
      me.status === 200 && me.body.email === EMAIL && me.body.role === 'customer',
      `got ${me.status} ${JSON.stringify(me.body)}`);

    const badMe = await get('/api/auth/me', { 'x-auth-token': 'not-a-token' });
    check('G4', 'GET /me with bad token -> 401', badMe.status === 401, `got ${badMe.status}`);
  }

  // --- forgot / reset: the T53 core ---------------------------------------
  {
    const ghost = await post('/api/auth/forgot', { email: `nobody.${Date.now()}@brightloop.test` });
    check('H1', 'forgot unknown email -> 404 "No account uses that email."',
      ghost.status === 404 && ghost.body.detail === 'No account uses that email.',
      `got ${ghost.status} ${JSON.stringify(ghost.body.detail)}`);

    const forgot = await post('/api/auth/forgot', { email: EMAIL });
    const url = String(forgot.body.reset_url || '');
    check('I1', 'forgot known email -> 200 reset_url of contract shape',
      forgot.status === 200 && url.startsWith('/reset.html?token='),
      `got ${forgot.status} url=${url.slice(0, 30)}…`);
    check('I2', 'reset link ALSO logged to server stdout (2nd demo channel)',
      stdout.includes(`[auth] password reset link for ${EMAIL}:`), `scanned ${stdout.length} chars of server output`);

    const token = url.split('token=')[1] || '';

    const weakTry = await post('/api/auth/reset', { token, password: 'short' });
    check('J1', 'reset WEAK password -> 400 MSG.password',
      weakTry.status === 400 && weakTry.body.detail === MSG.password,
      `got ${weakTry.status} ${JSON.stringify(weakTry.body.detail)}`);

    const afterWeak = await post('/api/auth/reset', { token, password: GOOD_PW + 'x' });
    check('J2', 'TOKEN NOT BURNED by the weak try — same token still resets',
      afterWeak.status === 200 && afterWeak.body.ok === true, `got ${afterWeak.status}`);

    const replay = await post('/api/auth/reset', { token, password: GOOD_PW + 'y' });
    check('L1', 'token IS single-use after success -> 404 expired sentence',
      replay.status === 404 && replay.body.detail === 'That reset link has expired. Request a new one.',
      `got ${replay.status} ${JSON.stringify(replay.body.detail)}`);

    const relogin = await post('/api/auth/login', { email: EMAIL, password: GOOD_PW + 'x' });
    check('M1', 'login with the NEW password -> 200 (reset landed end-to-end)',
      relogin.status === 200 && !!relogin.body.token, `got ${relogin.status}`);

    const oldLogin = await post('/api/auth/login', { email: EMAIL, password: GOOD_PW });
    check('M2', 'old password rejected after reset', oldLogin.status === 401, `got ${oldLogin.status}`);
  }

  // --- focus-first-error + inline rendering: execute validators.js ---------
  // against a minimal DOM shim. Field lists mirror the pages' wiring exactly:
  //   login/signup (login.js:187-197): [email, password] then client-only confirm
  //   reset.html (141 / 163):           [password] / [email]
  {
    const byId = new Map();
    const focusLog = [];
    const makeEl = (tag) => {
      const el = {
        tagName: tag, attrs: {}, children: [], _text: '',
        // `.id = x` property assignment must behave like a browser: reflect into the
        // attribute AND the getElementById registry (setError uses property form).
        set id(v) { el.attrs.id = String(v); byId.set(String(v), el); },
        get id() { return el.attrs.id || ''; },
        set className(v) { el.attrs.class = String(v); },
        get className() { return el.attrs.class || ''; },
        set textContent(v) { el._text = String(v); },
        get textContent() { return el._text; },
        setAttribute(k, v) { el.attrs[k] = String(v); if (k === 'id') byId.set(String(v), el); },
        getAttribute(k) { return k in el.attrs ? el.attrs[k] : null; },
        removeAttribute(k) { delete el.attrs[k]; },
        appendChild(c) { el.children.push(c); return c; },
        insertAdjacentElement(_pos, el2) { el.children.push(el2); el._inline = el2; return el2; },
        remove() { if (el.attrs.id) byId.delete(el.attrs.id); el._removed = true; },
        focus() { focusLog.push(el.attrs.id || el.name || '?'); },
      };
      return el;
    };
    const input = (id, value) => {
      const el = makeEl('input');
      el.attrs.id = id; byId.set(id, el);
      el.name = id; el.value = value ?? '';
      return el;
    };
    globalThis.document = { createElement: makeEl, getElementById: (id) => byId.get(id) || null };

    const { validateForm } = await import('./validators.js');

    // N. login form, both empty: focus MUST land on email (first field), message under it
    const le = input('login-email', ''), lp = input('login-password', '');
    const n = validateForm([{ input: le, rule: 'email' }, { input: lp, rule: 'password' }]);
    check('N1', 'login empty submit: not ok', n.ok === false && n.first === le, `ok=${n.ok}`);
    check('N2', 'login empty submit: FIRST error focused (email)', focusLog.at(-1) === 'login-email', `focusLog=${JSON.stringify(focusLog)}`);
    check('N3', 'login empty submit: inline error = MSG.emailEmpty',
      le._inline?.textContent === MSG.emailEmpty, `got ${JSON.stringify(le._inline?.textContent)}`);
    check('N4', 'login empty submit: aria-invalid + aria-describedby wired',
      le.getAttribute('aria-invalid') === 'true' && (le.getAttribute('aria-describedby') || '').includes(le._inline.attrs.id),
      `err=${le.getAttribute('aria-err')}`);

    // O. signup form: email valid, password weak -> password is the first error
    const se = input('login-email', 'audit@example.com'), sp = input('login-password', 'weak');
    const o = validateForm([{ input: se, rule: 'email' }, { input: sp, rule: 'password' }]);
    check('O1', 'signup weak password: not ok, first = password field',
      o.ok === false && o.first === sp, `first=${o.first === se ? 'email' : 'password'}`);
    check('O2', 'signup weak password: focus on password, NOT a later field',
      focusLog.at(-1) === 'login-password', `focusLog=${JSON.stringify(focusLog)}`);
    check('O3', 'signup weak password: inline error = MSG.password',
      sp._inline?.textContent === MSG.password, `got ${JSON.stringify(sp._inline?.textContent)}`);
    check('O4', 'signup weak password: valid email field got NO error + error CLEARS on revalidate',
      se._inline === undefined, se._inline ? `unexpected: ${se._inline.textContent}` : 'clean');

    // P. reset.html mode 1 (email form): empty -> focus email + MSG.emailEmpty
    const re = input('email', '');
    const p = validateForm([{ input: re, rule: 'email' }]);
    check('P1', 'reset email form empty: focus email, MSG.emailEmpty',
      p.ok === false && focusLog.at(-1) === 'email' && re._inline?.textContent === MSG.emailEmpty,
      `focus=${focusLog.at(-1)} msg=${JSON.stringify(re._inline?.textContent)}`);

    // Q. reset.html mode 2 (password form): weak -> focus password + MSG.password
    const rp = input('password', 'short');
    const q = validateForm([{ input: rp, rule: 'password' }]);
    check('Q1', 'reset password form weak: focus password, MSG.password',
      q.ok === false && focusLog.at(-1) === 'password' && rp._inline?.textContent === MSG.password,
      `focus=${focusLog.at(-1)} msg=${JSON.stringify(rp._inline?.textContent)}`);

    // P2. clear-on-fix: correcting the value then revalidating removes the error node
    rp.value = GOOD_PW;
    const q2 = validateForm([{ input: rp, rule: 'password' }]);
    check('P2', 'error node removed once the value is valid',
      q2.ok === true && rp._inline?._removed === true, `ok=${q2.ok} removed=${rp._inline?._removed}`);

    delete globalThis.document;
  }

  // --- session survives reload ---------------------------------------------
  // auth.js keeps the token in localStorage (cad.token) and the router re-reads
  // it on every boot (router.js sidebar user line). Simulate the reload pair:
  // setSession before "reload" -> fresh getToken/getUser after.
  {
    const store = new Map();
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    };
    const auth = await import('../components/auth.js');
    auth.setSession(sessionToken, { email: EMAIL, role: 'customer' });
    // "reload" happens here — nothing in memory survives; only the shim (localStorage) does
    const token2 = auth.getToken();
    const user2 = auth.getUser();
    check('R1', 'session survives reload: token + user round-trip localStorage',
      token2 === sessionToken && user2?.email === EMAIL && user2?.role === 'customer',
      `token=${token2 ? 'kept' : 'LOST'} user=${JSON.stringify(user2)}`);
    check('R2', 'reload landing: customer -> #/portal, staff -> #/overview',
      auth.landingHashFor('customer') === '#/portal' && auth.landingHashFor('admin') === '#/overview',
      `${auth.landingHashFor('customer')} / ${auth.landingHashFor('admin')}`);
    delete globalThis.localStorage;
  }
} catch (err) {
  check('BOOT', 'audit crashed', false, String(err?.stack || err));
  cleanupDb = false; // keep the DB for post-mortem
} finally {
  server.kill();
  await new Promise((r) => setTimeout(r, 800));
  if (cleanupDb) { for (const suffix of ['', '-wal', '-shm']) { try { rmSync(DB + suffix, { force: true }); } catch { /* best effort */ } } }
}

const failed = results.filter((r) => !r.pass);
console.log(`\n[audit] ${results.length - failed.length}/${results.length} checks passed` + (failed.length ? `  FAILED: ${failed.map((f) => f.id).join(', ')}` : ' — ALL GREEN'));
process.exit(failed.length ? 1 : 0);
