import { chromium } from 'playwright';

// Vérification du socle refonte (S1, OPE-415) : TanStack Router monté sur `/v2/*`.
// Prouve que (1) `/v2/ping` (route démo lazy du routeur neuf) rend bien, (2) `/v2/clients`
// (PoC repris sous le socle) rend bien, le tout SANS erreur console/pageerror — c.-à-d. que le
// routeur neuf cohabite avec wouter et partage les providers (QueryClient + tRPC + auth).
// Usage : ./scripts/pw-run.sh scripts/e2e/v2-socle-check.mjs E2E_PASS='...'

const BASE = process.env.BASE || 'https://staging.operioz.com';
const EMAIL = process.env.E2E_EMAIL || 'dev@operioz.com';
const PASS = process.env.E2E_PASS || '';

const issues = [];
const add = (o) => issues.push(o);

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await browser.newContext({ baseURL: BASE, ignoreHTTPSErrors: true });

const signin = await ctx.request.post('/api/trpc/auth.signin?batch=1', {
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
  if (m.type() !== 'error') return;
  const t = m.text();
  if (/Download the React DevTools|preloaded using link preload|favicon/i.test(t)) return;
  // Les 404 réseau sont couverts (avec URL) par le handler 'response' ci-dessous → on évite le doublon.
  if (/Failed to load resource/i.test(t)) return;
  add({ route: current, type: 'console', text: t.slice(0, 400) });
});
page.on('pageerror', (e) => add({ route: current, type: 'pageerror', text: String(e?.message || e).slice(0, 400) }));
// `/v2/clients` est désormais alimenté par tRPC (`clients.list`, client partagé) — plus aucun
// `/api/rest/clients` : tout 4xx/5xx est une vraie régression (la dette REST OPE-366 est supprimée).
page.on('response', (r) => {
  if (r.status() < 400) return;
  add({ route: current, type: 'http', status: r.status(), url: r.url().replace(BASE, '').slice(0, 160) });
});

// (route, sélecteur de texte qui prouve le rendu du socle)
const cases = [
  { route: '/v2/ping', expect: 'pong' },
  { route: '/v2/clients', expect: 'Clients' },
];

for (const c of cases) {
  current = c.route;
  await page.goto(c.route, { waitUntil: 'networkidle', timeout: 25000 });
  await page.waitForTimeout(1500);
  const body = (await page.textContent('body')) || '';
  if (!body.includes(c.expect)) {
    add({ route: c.route, type: 'missing-content', text: `attendu "${c.expect}" absent` });
  }
  await page.screenshot({ path: `/tmp/v2-socle-${c.route.replace(/\//g, '_')}.png`, fullPage: true });
}

// --- Bascule strangler-fig (OPE-420) : flag `?v2=1` + util de bascule par route ---
// IMPORTANT : tester d'abord SANS flag (le flag est « collant » via localStorage une fois activé).
let basculeCount = 0;

// 1) Sans flag → la route legacy reste legacy (parité : aucun détournement).
basculeCount++;
current = '/clients (sans flag)';
await page.goto('/clients', { waitUntil: 'networkidle', timeout: 25000 });
await page.waitForTimeout(1200);
if (new URL(page.url()).pathname !== '/clients') {
  add({ route: '/clients', type: 'bascule', text: `flag OFF mais redirigé vers ${page.url()}` });
}

// 2) Avec `?v2=1` → bascule vers `/v2/<route>` migrée.
basculeCount++;
current = '/clients?v2=1';
await page.goto('/clients?v2=1', { waitUntil: 'networkidle', timeout: 25000 });
await page.waitForTimeout(1500);
if (new URL(page.url()).pathname !== '/v2/clients') {
  add({ route: '/clients?v2=1', type: 'bascule', text: `flag ON mais pas de bascule, URL=${page.url()}` });
}

await browser.close();
const total = cases.length + basculeCount;
console.log(`cas testés: ${total} | issues: ${issues.length}`);
if (issues.length) console.log(JSON.stringify(issues, null, 2));
process.exit(issues.length ? 1 : 0);
