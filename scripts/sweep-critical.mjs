/* Sweep des routes critiques seulement */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'https://staging.operioz.com';
const BACKEND = process.env.BACKEND || 'https://staging-backend.operioz.com';
const EMAIL = process.env.E2E_EMAIL || 'dev@operioz.com';
const PASS = process.env.E2E_PASS || '';

const ROUTES = [
  '/', '/dashboard', '/calendrier-chantiers', '/chantiers', '/interventions',
  '/clients', '/devis', '/factures', '/parametres'
];

const issues = [];
const add = (o) => issues.push(o);

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await browser.newContext({ baseURL: BASE, ignoreHTTPSErrors: true });

const signin = await ctx.request.post(`${BACKEND}/api/trpc/auth.signin?batch=1`, {
  headers: { 'content-type': 'application/json' },
  data: { '0': { json: { email: EMAIL, password: PASS } } },
});
if (!signin.ok()) {
  console.log(JSON.stringify({ fatal: `login failed HTTP ${signin.status()}` }));
  await browser.close();
  process.exit(2);
}

const page = await ctx.newPage();
let current = '';

page.on('console', (m) => {
  if (m.type() === 'error') {
    const t = m.text();
    if (/Download the React DevTools|preloaded using link preload|favicon|net::ERR_BLOCKED_BY_CLIENT|ERR_OICSP_|Failed to fetch|Failed to load|Uncaught SyntaxError|polyfill|extension|i18next/i.test(t)) return;
    add({ route: current, type: 'console', text: t.slice(0, 400) });
  }
});

page.on('pageerror', (e) => add({ route: current, type: 'pageerror', text: String(e?.message || e).slice(0, 400) }));

page.on('requestfailed', (r) => {
  const u = r.url();
  if (/cdn\.|cloudflare|fonts\.googleapis|google-analytics|sentry|segment|analytics|gtag|\.png\?|\.jpg\?/.test(u)) return;
  if (r.failure()?.errorText?.includes('ERR_BLOCKED_BY_CLIENT')) return;
  add({ route: current, type: 'request-failed', text: `${r.failure()?.errorText || 'unknown'}: ${u.replace(BASE, '').slice(0, 150)}` });
});

page.on('response', (r) => {
  const u = r.url();
  if (u.includes('/api/') && r.status() >= 400) {
    add({ route: current, type: 'http', status: r.status(), url: u.replace(BASE, '').slice(0, 160) });
  }
});

for (const route of ROUTES) {
  current = route;
  try {
    console.error(`Testing ${route}...`);
    await page.goto(route, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);
  } catch (e) {
    add({ route, type: 'nav-error', text: String(e?.message || e).slice(0, 300) });
  }
}

await browser.close();

console.log('=== E2E CRITICAL SWEEP ===');
console.log(`routes testées: ${ROUTES.length} | issues: ${issues.length}`);
for (const i of issues) {
  console.log(`[${i.route}] ${i.type}: ${i.text || i.url || ''}`);
}
process.exit(issues.length ? 1 : 0);
