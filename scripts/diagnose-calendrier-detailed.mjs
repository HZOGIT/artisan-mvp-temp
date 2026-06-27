/* Diagnostic détaillé : loggue TOUTES les erreurs sur /calendrier-chantiers */
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
const allErrors = [];
const allRequests = [];

page.on('console', (m) => {
  allErrors.push({ type: 'console', level: m.type(), text: m.text() });
});

page.on('pageerror', (e) => {
  allErrors.push({ type: 'pageerror', text: String(e?.message || e) });
});

page.on('requestfailed', (r) => {
  allRequests.push({
    url: r.url(),
    method: r.request().method(),
    status: 'failed',
    error: r.failure()?.errorText
  });
});

page.on('response', (r) => {
  const u = r.url();
  const status = r.status();
  if (status >= 300) {
    allRequests.push({
      url: u,
      method: r.request().method(),
      status: status
    });
  }
});

try {
  console.log('Visiting /calendrier-chantiers...');
  await page.goto('/calendrier-chantiers', { waitUntil: 'networkidle', timeout: 25000 });
  await page.waitForTimeout(3000);

  const finalUrl = page.url();
  const txtLen = await page.evaluate(() => document.body?.innerText?.trim().length || 0);
  const h1 = await page.evaluate(() => document.querySelector('h1')?.innerText);

  console.log(`\n✓ Page loaded`);
  console.log(`  Final URL: ${finalUrl}`);
  console.log(`  H1: ${h1 || '(none)'}`);
  console.log(`  Content length: ${txtLen} chars`);
} catch (e) {
  console.log(`✗ Navigation error: ${e.message}`);
}

console.log(`\n=== ALL CONSOLE MESSAGES (${allErrors.length}) ===`);
for (const e of allErrors) {
  if (e.type === 'console') {
    console.log(`  [${e.level.toUpperCase()}] ${e.text.slice(0, 300)}`);
  } else {
    console.log(`  [PAGEERROR] ${e.text.slice(0, 300)}`);
  }
}

console.log(`\n=== ALL REQUESTS (${allRequests.length}) ===`);
for (const r of allRequests) {
  if (r.status === 'failed') {
    console.log(`  ✗ FAILED: ${r.method} ${r.url.replace(BASE, '').slice(0, 200)} — ${r.error}`);
  } else if (r.status >= 400) {
    console.log(`  ! ${r.status}: ${r.method} ${r.url.replace(BASE, '').slice(0, 200)}`);
  } else if (r.status >= 300) {
    console.log(`  → ${r.status}: ${r.method} ${r.url.replace(BASE, '').slice(0, 200)}`);
  }
}

const errCount = allErrors.filter(e => e.level === 'error' || e.type === 'pageerror').length;
const failedCount = allRequests.filter(r => r.status === 'failed').length;
console.log(`\nSummary: ${errCount} errors/pageErrors + ${failedCount} failed requests`);

await browser.close();
process.exit(errCount || failedCount ? 1 : 0);
