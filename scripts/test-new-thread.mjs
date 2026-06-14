// Vérifie le bouton "+ Nouvelle conversation" (reset du thread). Scopé au panneau
// principal (/assistant) pour éviter la 2e instance (drawer).
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'https://staging.operioz.com';
const EMAIL = process.env.E2E_EMAIL || 'dev@operioz.com';
const PASS = process.env.E2E_PASS || '';

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await browser.newContext({ baseURL: BASE, ignoreHTTPSErrors: true });
const login = await ctx.request.post('/api/trpc/auth.signin?batch=1', {
  headers: { 'content-type': 'application/json' },
  data: { '0': { json: { email: EMAIL, password: PASS } } },
});
console.log('login HTTP', login.status());

const page = await ctx.newPage();
await page.goto('/assistant', { waitUntil: 'networkidle', timeout: 25000 });
await page.waitForTimeout(1000);
const main = page.getByRole('main');

const btn = main.getByRole('button', { name: 'Nouvelle conversation' });
console.log('bouton "+ Nouvelle conversation" présent:', (await btn.count()) ? '✅' : '❌');

// envoyer un message non-navigant
await main.locator('textarea').first().fill('réponds simplement par: bonjour');
await main.locator('button[type="submit"]').first().click();
await page.waitForTimeout(7000);

const emptyBefore = await main.getByText('Bonjour !', { exact: false }).count();
console.log('empty-state AVANT reset (attendu 0 = conv active):', emptyBefore);

// clic sur "+"
await btn.click();
await page.waitForTimeout(1200);

const emptyAfter = await main.getByText('Bonjour !', { exact: false }).count();
const taVal = await main.locator('textarea').first().inputValue();
console.log('empty-state APRÈS reset (attendu >=1):', emptyAfter);
console.log('textarea vidé:', taVal === '' ? '✅' : `❌ ("${taVal}")`);

const ok = emptyBefore === 0 && emptyAfter >= 1;
console.log('RÉSULTAT BOUTON + :', ok ? '✅ MARCHE (la conversation se vide)' : '❌ KO');
await browser.close();
process.exit(ok ? 0 : 1);
