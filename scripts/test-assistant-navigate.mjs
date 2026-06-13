// Test diagnostique : l'assistant doit NAVIGUER + lister correctement.
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'https://staging.operioz.com';
const EMAIL = process.env.E2E_EMAIL || 'dev@operioz.com';
const PASS = process.env.E2E_PASS || '';
const MSG = process.env.MSG || 'affiche-moi les devis envoyés';

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await browser.newContext({ baseURL: BASE, ignoreHTTPSErrors: true });
const login = await ctx.request.post('/api/trpc/auth.signin?batch=1', {
  headers: { 'content-type': 'application/json' },
  data: { '0': { json: { email: EMAIL, password: PASS } } },
});
console.log('login HTTP', login.status());

const page = await ctx.newPage();
let streamHit = null;
const logs = [];
page.on('pageerror', e => logs.push('PAGEERR: ' + (e?.message || e)));
page.on('console', m => { if (m.type() === 'error') logs.push('CONSOLE: ' + m.text().slice(0,160)); });
page.on('response', r => { if (r.url().includes('/api/assistant/stream')) streamHit = r.status(); });

await page.goto('/assistant', { waitUntil: 'networkidle', timeout: 25000 });
await page.waitForTimeout(1200);
console.log('URL avant:', new URL(page.url()).pathname + new URL(page.url()).search);

const ta = page.locator('textarea').first();
await ta.waitFor({ state: 'visible', timeout: 10000 });
await ta.fill(MSG);
// envoi via le bouton submit (plus fiable que Enter)
const sendBtn = page.locator('button[type="submit"]').first();
if (await sendBtn.count()) await sendBtn.click(); else await ta.press('Enter');

let navigated = false;
for (let i = 0; i < 25; i++) {
  await page.waitForTimeout(1000);
  const p = new URL(page.url());
  if (p.pathname.startsWith('/devis') || p.search.includes('filtre=')) { navigated = true; break; }
}
const url2 = new URL(page.url());
console.log('stream appelé:', streamHit ?? 'NON');
console.log('URL après:', url2.pathname + url2.search);
console.log('NAVIGATION FRONT:', navigated ? '✅ OUI' : '❌ NON');

// Récupérer le dernier message assistant (texte rendu)
const lastMsg = await page.evaluate(() => {
  const els = document.querySelectorAll('[class*="prose"], .text-sm');
  return els.length ? els[els.length - 1].innerText.slice(0, 300) : '(aucun)';
});
console.log('Réponse IA (extrait):', JSON.stringify(lastMsg));
if (logs.length) console.log('Logs:', logs.slice(0, 6));
await browser.close();
process.exit(navigated ? 0 : 1);
