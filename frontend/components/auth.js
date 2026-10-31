// auth.js — client session store + auth helpers (owner: Saurabh, T46)
//
// Single source for the browser's auth state: the token lives in localStorage so a
// reload keeps the user signed in, and every authed request sends it as the
// `x-auth-token` header (ARCHITECTURE note 5). The login/signup screen (login.js),
// the router's sidebar user line, and the customer portal (T31) all read/write
// session through here so the shape is defined in exactly one place.
//
// AUTH CONTRACT for T08 (Karthik) — this client is tolerant about where the server
// puts things so the mirror can't drift on field placement:
//   POST /api/auth/signup {email, password} -> 200 {token, user:{email, role}}
//                                              409 {detail:"That email is already registered."}
//                                              400 {detail:<MSG.email|MSG.password>}  // mirrored
//   POST /api/auth/login  {email, password} -> 200 {token, user:{email, role}}
//                                              401 {detail:"Email or password is incorrect."}
//   GET  /api/auth/me     header x-auth-token -> 200 {email, role}   401 on bad/expired token
// token may also arrive as `access_token`; role/email may sit top-level or under `user`.

const TOKEN_KEY = 'cad.token';
const USER_KEY = 'cad.user';

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (_) { return ''; }
}

export function getUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch (_) { return null; }
}

export function isAuthed() { return !!getToken(); }

export function setSession(token, user) {
  try {
    localStorage.setItem(TOKEN_KEY, String(token || ''));
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch (_) { /* private-mode / storage full — session is just not persisted */ }
}

export function clearSession() {
  try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); } catch (_) { /* ignore */ }
}

// Attach the auth header to a fetch init's headers (no-op when signed out).
export function authHeaders(extra) {
  const t = getToken();
  const h = { ...(extra || {}) };
  if (t) h['x-auth-token'] = t;
  return h;
}

// Where a freshly-authenticated user lands: the team sees the internal Overview,
// a customer sees only their own portal (T31). Hash routes, not paths.
export function landingHashFor(role) {
  return role === 'customer' ? '#/portal' : '#/overview';
}

// Normalise a signup/login response body into {token, user:{email, role}} regardless
// of where the server nests each field. Role defaults to 'customer' (least privilege).
export function readAuthBody(body) {
  const b = body || {};
  const u = b.user || (b.data && b.data.user) || b;
  const token = b.token || b.access_token || (b.data && (b.data.token || b.data.access_token)) || '';
  const role = (u && u.role) || b.role || 'customer';
  const email = (u && u.email) || b.email || '';
  return { token: String(token), user: { email: String(email), role: String(role) } };
}

export default {
  getToken, getUser, isAuthed, setSession, clearSession,
  authHeaders, landingHashFor, readAuthBody,
};
