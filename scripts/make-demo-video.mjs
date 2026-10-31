#!/usr/bin/env node
// make-demo-video.mjs — Cadence demo video recorder (task T-V1, spec: VIDEO-SCRIPT.md)
//
// Records the submission video fully autonomously: Playwright chromium with
// recordVideo ON; captions are injected INTO the page as a fixed overlay div
// (bottom third, styled only with DESIGN.md tokens) so they are burned into the
// footage — no voice, no editing, no post-processing.
//
// Output:  <repo>/../makeaton9-video/demo.webm   (outside the repo, never committed)
// Usage:   node scripts/make-demo-video.mjs [--only 1,2,5]   (default: all 7 scenes)
// Env:     BASE_URL=http://127.0.0.1:8000 (default)
//
// The recorder boots the app itself if /api/health is not answering: it spawns
// `python -m uvicorn backend.api.main:app --port 8000` (same as scripts/run.cmd)
// and kills it again on exit. Scenes are best-effort: if the app does not yet
// have a scene's page (e.g. the portal signup form), that scene logs a warning
// and is skipped instead of failing the whole recording.
//
// Deps (dev only, app runtime has no npm):  cd scripts && npm install
// && npx playwright install chromium

import { spawn } from 'node:child_process';
import { mkdirSync, renameSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const OUT_DIR = path.resolve(REPO, '..', 'makeaton9-video');
const OUT_FILE = path.join(OUT_DIR, 'demo.webm');

// All rehearsal-tunable knobs (T09) live here.
const CONFIG = {
  baseUrl: process.env.BASE_URL || 'http://127.0.0.1:8000',
  viewport: { width: 1280, height: 800 }, // spec: 1280x800
  phone: { width: 390, height: 844 },     // spec scene 5
  bootTimeoutMs: 45_000,   // max wait for uvicorn to answer after spawn
  sceneHoldMs: 6_000,      // default caption hold (spec: scenes hold 4-8s)
  liveChangesNeeded: 2,    // scene 2: KPI strip must visibly change this many times
  liveTimeoutMs: 40_000,
  navTimeoutMs: 4_000,     // per-scene explicit waits
  // T09 rehearsal findings (11:32): the hero/validation form is the T46 auth screen
  // at #/login?mode=signup. #/portal and #/signup were pre-T46 guesses that now
  // resolve to placeholder screens with no form.
  signupRoute: '#/login?mode=signup',
  // Scene 6 prefers real #nav clicks (T06 landed); hash fallback kept for safety.
  navRoutes: ['#/overview', '#/subscriptions', '#/invoices'],
  demoEmail: () => `demo.reel.${Date.now()}@brightloop.test`,
  demoPassword: 'Reel!Pass2026', // >8 chars, upper, lower, special — passes policy
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const warn = (msg) => console.log(`[video] [warn] ${msg}`);

// ---------------------------------------------------------------------------
// Server management: use a running app if healthy, else boot one and own it.
// ---------------------------------------------------------------------------
let serverProc = null;

async function isUp() {
  try {
    // Any HTTP answer (even 404) means the server is listening.
    await fetch(`${CONFIG.baseUrl}/api/health`, { signal: AbortSignal.timeout(1500) });
    return true;
  } catch {
    return false;
  }
}

async function waitHealthy(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isUp()) return true;
    await sleep(750);
  }
  return false;
}

async function ensureServer() {
  if (await isUp()) return;
  console.log('[video] server down — spawning uvicorn (scripts/run.cmd equivalent)');
  serverProc = spawn(
    'python', ['-m', 'uvicorn', 'backend.api.main:app', '--port', '8000'],
    { cwd: REPO, stdio: 'ignore', shell: true },
  );
  if (!(await waitHealthy(CONFIG.bootTimeoutMs))) {
    console.error(
      '[video] FATAL: server never became healthy. ' +
      'Start it yourself with scripts\\run.cmd, verify http://127.0.0.1:8000, then rerun.',
    );
    process.exit(1);
  }
  console.log('[video] server is up (spawned by recorder; will be killed on exit)');
}

function killServer() {
  if (!serverProc) return;
  const pid = serverProc.pid;
  if (process.platform === 'win32') {
    // shell:true means the pid is a cmd wrapper — kill the whole tree.
    spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { shell: true, stdio: 'ignore' });
  } else {
    serverProc.kill();
  }
}

// ---------------------------------------------------------------------------
// Caption overlay — injected into the page, styled ONLY via DESIGN.md tokens
// (var(--surface)/--text/--accent/--border/--font), so the caption inherits the
// app's own design system. This is what burns the text into the footage.
// ---------------------------------------------------------------------------
async function showCaption(page, text) {
  await page.evaluate((t) => {
    if (!document.getElementById('cad-caption-style')) {
      const style = document.createElement('style');
      style.id = 'cad-caption-style';
      style.textContent = [
        '#cad-video-caption{position:fixed;left:50%;bottom:7%;transform:translateX(-50%);',
        'z-index:2147483647;max-width:min(760px,86vw);background:var(--surface,#ffffff);',
        'color:var(--text,#111827);border:1px solid var(--border,#e4e7eb);',
        'border-left:3px solid var(--accent,#b45309);border-radius:var(--radius-card,8px);',
        'padding:12px 20px;text-align:center;',
        'font:500 20px/1.4 var(--font,"Fira Sans","Segoe UI",system-ui,sans-serif);',
        'box-shadow:0 2px 10px rgba(17,24,39,.14)}',
      ].join('');
      document.head.appendChild(style);
    }
    let el = document.getElementById('cad-video-caption');
    if (!el) {
      el = document.createElement('div');
      el.id = 'cad-video-caption';
      el.setAttribute('aria-hidden', 'true');
      document.body.appendChild(el);
    }
    el.textContent = t;
  }, text);
}

// ---------------------------------------------------------------------------
// Scenes (VIDEO-SCRIPT.md table). Each: caption text + run(page) best-effort.
// ---------------------------------------------------------------------------
async function gotoApp(page, hash = '') {
  await page.goto(CONFIG.baseUrl + '/' + hash, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.cad-shell', { timeout: 10_000 }).catch(() => {});
}

// Scene 2: resolve when the KPI strip text has visibly changed N times
// (explicit wait on the data counter, never a fixed sleep on live data).
async function waitForLiveChanges(page) {
  try {
    await page.waitForFunction(
      ([sel, need]) => {
        const txt = document.querySelector(sel)?.innerText ?? '';
        const s = (window.__cadSnap ??= { txt: '', changes: 0 });
        if (txt && txt !== s.txt) { s.txt = txt; s.changes += 1; }
        return s.changes >= need;
      },
      ['.cad-kpis', CONFIG.liveChangesNeeded],
      { timeout: CONFIG.liveTimeoutMs, polling: 500 },
    );
    return true;
  } catch {
    return false;
  }
}

// Open the auth screen's signup form (T46: #/login?mode=signup — email + password
// + confirm). T09 rule: each scene OWNS its navigation and shows its caption AFTER
// navigating — page.goto full-loads destroy an injected caption div, so a caption
// shown before the goto would never reach the footage.
async function gotoSignupForm(page) {
  await page.goto(`${CONFIG.baseUrl}/${CONFIG.signupRoute}`, { waitUntil: 'domcontentloaded' });
  const form = page.locator('form:has(input[type="email"])').first();
  try {
    await form.waitFor({ state: 'visible', timeout: CONFIG.navTimeoutMs });
  } catch {
    return null; // auth screen absent → caller skips its scene (best-effort rule)
  }
  return form;
}

// Fill EVERY password field on the form (signup has password + confirm — T46).
// Filling only the first would (a) trip Playwright strict mode on .fill() and
// (b) leave confirm mismatched so the submit gate rejects the hero flow.
async function fillAllPasswords(form, value) {
  const pw = form.locator('input[type="password"]');
  const n = await pw.count();
  for (let i = 0; i < n; i++) await pw.nth(i).fill(value);
}

async function hideCaption(page) {
  await page.evaluate(() => document.getElementById('cad-video-caption')?.remove());
}

const SCENES = [
  {
    id: 1,
    caption:
      'Cadence — built for the Subscription Management System problem. ' +
      'Plans, subscriptions and recurring billing in one place, replacing spreadsheets ' +
      'and hand-typed invoices.',
    async run(page) {
      await gotoApp(page);
      await showCaption(page, this.caption);
      await sleep(CONFIG.sceneHoldMs);
    },
  },
  {
    id: 2,
    caption:
      'Live data — a simulator thread lands payments in the database every few seconds; ' +
      'this Overview polls /api/live/summary every 3s. Not static JSON.',
    async run(page) {
      await gotoApp(page, '#/overview');
      await showCaption(page, this.caption);
      const changed = await waitForLiveChanges(page);
      if (!changed) warn('scene 2: KPI values did not visibly change in time (feed slow or overview absent)');
      await sleep(4_000); // let the changed numbers sit on camera
    },
  },
  {
    id: 3,
    caption: 'Hero flow — create an account: unique email, strong password, then straight into the app.',
    async run(page) {
      const form = await gotoSignupForm(page);
      if (!form) return warn('scene 3 skipped: signup form not found (auth screen pending)');
      await showCaption(page, this.caption);
      await form.locator('input[type="email"]').first().fill(CONFIG.demoEmail());
      await fillAllPasswords(form, CONFIG.demoPassword);
      await sleep(1_000); // filled form readable on camera before submit
      await form.locator('button[type="submit"], button:not([type])').first().click().catch(() => {});
      // Explicit wait for the post-signup redirect (login.js sets the hash by role) —
      // never a fixed sleep on a network action.
      await page
        .waitForFunction(() => !location.hash.startsWith('#/login'), null, { timeout: CONFIG.navTimeoutMs })
        .catch(() => warn('scene 3: no post-signup redirect observed (login.js contract changed?)'));
      // Customer accounts land on #/portal (T31 pending → placeholder). Show the
      // signed-in shell instead: the sidebar now carries the new account's email.
      await page.evaluate(() => { location.hash = '#/overview'; });
      await sleep(3_000);
    },
  },
  {
    id: 4,
    caption: 'Input validation — client AND server.',
    async run(page) {
      // Scene 3 left us signed in, and the router bounces authed users off
      // #/login → clear the session so the form is actually reachable.
      await page.evaluate(() => localStorage.clear());
      const form = await gotoSignupForm(page);
      if (!form) return warn('scene 4 skipped: signup form not found (auth screen pending)');
      await showCaption(page, this.caption);
      const email = form.locator('input[type="email"]').first();
      const pass = form.locator('input[type="password"]').first();
      await email.fill('not-an-email');
      await pass.fill('short');
      await pass.press('Tab'); // blur → inline error under the field (T07 wiring)
      let caught = true;
      await page.waitForSelector('.cad-fielderror', { timeout: 6_000 }).catch(() => { caught = false; });
      if (!caught) {
        // Some forms validate on submit instead of blur — try that before giving up.
        await form.locator('button[type="submit"], button:not([type])').first().click().catch(() => {});
        await page.waitForSelector('.cad-fielderror', { timeout: 4_000 })
          .catch(() => warn('scene 4: no inline validation error appeared on camera'));
      }
      await sleep(4_000); // error message readable on camera
    },
  },
  {
    id: 5,
    caption: 'Responsive — same app, phone width.',
    async run(page) {
      await showCaption(page, this.caption);
      await page.setViewportSize(CONFIG.phone);
      await sleep(1_000); // let the layout reflow
      await sleep(CONFIG.sceneHoldMs);
      await page.setViewportSize(CONFIG.viewport); // restore for navigation scene
    },
  },
  {
    id: 6,
    caption: 'Clean navigation.',
    async run(page) {
      await showCaption(page, this.caption);
      // Prefer real menu clicks (T06 #nav); else hash-navigate.
      const links = page.locator('#nav a');
      const n = Math.min(await links.count(), 3);
      if (n >= 2) {
        for (let i = 0; i < n; i++) {
          await links.nth(i).click();
          await sleep(2_500);
        }
      } else {
        warn('scene 6: #nav empty (T06 pending) — falling back to hash routes');
        for (const route of CONFIG.navRoutes) {
          await page.goto(`${CONFIG.baseUrl}/${route}`, { waitUntil: 'domcontentloaded' });
          await sleep(2_500);
        }
      }
    },
  },
  {
    id: 7,
    caption: '', // end card is its own overlay (below), not the caption bar
    async run(page) {
      // The scene-6 caption bar sits at a HIGHER z-index than the end card —
      // remove it or "Clean navigation." burns on top of the finale.
      await hideCaption(page);
      await page.evaluate(() => {
        const card = document.createElement('div');
        card.id = 'cad-endcard';
        card.style.cssText = [
          'position:fixed;inset:0;z-index:2147483646;display:flex;flex-direction:column;',
          'align-items:center;justify-content:center;gap:14px;text-align:center;',
          'background:var(--ground,#f8fafc);color:var(--text,#111827);',
          'font-family:var(--font,"Fira Sans","Segoe UI",system-ui,sans-serif);',
        ].join('');
        // The Cadence mark, same geometry as static/index.html.
        const mark = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        mark.setAttribute('width', '40'); mark.setAttribute('height', '40');
        mark.setAttribute('viewBox', '0 0 20 20');
        mark.innerHTML =
          '<circle cx="10" cy="10" r="8" fill="none" stroke="var(--accent,#b45309)" stroke-width="1.6"/>' +
          '<circle cx="16.9" cy="6" r="2.2" fill="var(--accent,#b45309)"/>';
        const name = document.createElement('div');
        name.style.cssText = 'font-size:32px;font-weight:600';
        name.textContent = 'Cadence';
        const tag = document.createElement('div');
        tag.style.cssText = 'font-size:16px;color:var(--muted,#475569)';
        tag.textContent = 'Run plans, subscriptions and recurring billing in one place.';
        const stack = document.createElement('div');
        stack.style.cssText = 'font-size:16px;margin-top:10px';
        stack.textContent = 'Stack: Python FastAPI + SQLite + vanilla HTML/CSS/JS. Everything runs locally.';
        const team = document.createElement('div');
        team.style.cssText = 'font-size:14px;color:var(--faint,#64748b)';
        team.textContent = 'Built by Karthik, Manu, Saurabh, Avanthik — all four committed.';
        card.append(mark, name, tag, stack, team);
        document.body.appendChild(card);
      });
      await sleep(8_000);
    },
  },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const onlyArg = process.argv.find((a) => a.startsWith('--only'));
  let scenes = SCENES;
  if (onlyArg) {
    const ids = (onlyArg.split('=')[1] ?? process.argv[process.argv.indexOf(onlyArg) + 1] ?? '')
      .split(',').map(Number).filter(Boolean);
    scenes = SCENES.filter((s) => ids.includes(s.id));
  }
  if (!scenes.length) { console.error('[video] FATAL: no scenes selected'); process.exit(1); }

  await ensureServer();

  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: CONFIG.viewport,
    recordVideo: { dir: OUT_DIR, size: CONFIG.viewport }, // spec: video 'on'
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);

  try {
    for (const scene of scenes) {
      console.log(`[video] scene ${scene.id}/7${scene.caption ? ` — ${scene.caption.slice(0, 60)}…` : ' — end card'}`);
      if (scene.caption) await showCaption(page, scene.caption);
      await scene.run(page);
    }
  } finally {
    // Closing the context is what finalises and flushes the .webm file.
    const video = page.video();
    await context.close();
    await browser.close();
    killServer();
    const tmp = video ? await video.path() : null;
    if (tmp) {
      rmSync(OUT_FILE, { force: true }); // a previous take must not block the rename
      renameSync(tmp, OUT_FILE);
      console.log(`VIDEO READY @ ${OUT_FILE}`);
    } else {
      console.error('[video] FATAL: no video file was produced');
      process.exitCode = 1;
    }
  }
}

main().catch((err) => {
  console.error('[video] FATAL:', err);
  killServer();
  process.exit(1);
});
