/* Test rapide d'une seule route pour vérifier requestfailed capture */
import { chromium } from 'playwright';

const BASE = 'https://staging.operioz.com';
const BACKEND = 'https://staging-backend.operioz.com';
const EMAIL = 'dev@operioz.com';
const PASS = process.env.E2E_PASS || 'Azerqsdf1234!';

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await browser.newContext({ baseURL: BASE, ignoreHTTPSErrors: true });

const signin = await ctx.request.post(`${BACKEND}/api/trpc/auth.signin?batch=1`, {
  headers: { 'content-type': 'application/json' },
  data: { '0': { json: { email: EMAIL, password: PASS } } },
});
if (!signin.ok()) {
  console.log('Auth failed');
  await browser.close();
  process.exit(1);
}

const page = await ctx.newPage();
const issues = [];

page.on('console', (m) => {
  if (m.type() === 'error') {
    const t = m.text();
    if (/Download the React DevTools|preloaded using link preload|favicon|net::ERR_BLOCKED_BY_CLIENT|ERR_OICSP_|Failed to fetch|Failed to load|Uncaught SyntaxError|polyfill|extension/i.test(t)) return;
    issues.push({ type: 'console', text: t.slice(0, 200) });
  }
});

page.on('requestfailed', (r) => {
  const u = r.url();
  if (/cdn\.|cloudflare|fonts\.googleapis|google-analytics|sentry|segment|analytics|gtag|\.png\?|\.jpg\?/.test(u)) return;
  if (r.failure()?.errorText?.includes('ERR_BLOCKED_BY_CLIENT')) return;
  issues.push({ type: 'request-failed', error: r.failure()?.errorText, url: u.replace(BASE, '').slice(0, 100) });
});

try {
  console.log('Testing /calendrier-chantiers...');
  await page.goto('/calendrier-chantiers', { waitUntil: 'networkidle', timeout: 25000 });
  await page.waitForTimeout(2000);
} catch (e) {
  console.log(`Nav error: ${e.message}`);
}

console.log(`\nIssues found: ${issues.length}`);
for (const i of issues) console.log(`  - ${i.type}: ${i.text || i.error} ${i.url || ''}`);

await browser.close();
process.exit(issues.length ? 1 : 0);
