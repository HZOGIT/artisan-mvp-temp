// Sweep e2e staging : se connecte comme dev@operioz.com et parcourt les pages
// avec un vrai navigateur (Chromium/Playwright), en collectant par page :
//   - erreurs console (console.error)
//   - exceptions non catchées (pageerror)
//   - réponses HTTP /api 4xx/5xx
//   - boucle de navigation (reload loop) : trop de navigations sur une route
//   - page "vide"/spinner bloqué : peu de texte rendu après networkidle
// Sortie : JSON sur stdout (liste d'issues) + résumé lisible.
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'https://staging.operioz.com';
const EMAIL = process.env.E2E_EMAIL || 'dev@operioz.com';
const PASS = process.env.E2E_PASS || '';

const ROUTES = [
  '/dashboard', '/devis', '/factures', '/clients', '/interventions',
  '/parametres', '/modules', '/comptabilite', '/stocks', '/chat',
  '/contrats', '/calendrier', '/fournisseurs', '/depenses', '/statistiques',
  '/techniciens', '/vehicules', '/conges', '/avis', '/documents', '/assistant',
];

const issues = [];
const add = (o) => issues.push(o);

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await browser.newContext({ baseURL: BASE, ignoreHTTPSErrors: true });

// --- Auth par API (cookie partagé avec le contexte navigateur) ---
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
let navCount = 0;

page.on('console', (m) => {
  if (m.type() === 'error') {
    const t = m.text();
    // bruit connu inoffensif à ignorer
    if (/Download the React DevTools|preloaded using link preload|favicon/i.test(t)) return;
    add({ route: current, type: 'console', text: t.slice(0, 400) });
  }
});
page.on('pageerror', (e) => add({ route: current, type: 'pageerror', text: String(e?.message || e).slice(0, 400) }));
page.on('response', (r) => {
  const u = r.url();
  if (u.includes('/api/') && r.status() >= 400) {
    add({ route: current, type: 'http', status: r.status(), url: u.replace(BASE, '').slice(0, 160) });
  }
});
page.on('framenavigated', (f) => { if (f === page.mainFrame()) navCount++; });

for (const route of ROUTES) {
  current = route;
  navCount = 0;
  try {
    await page.goto(route, { waitUntil: 'networkidle', timeout: 25000 });
    await page.waitForTimeout(1500); // laisser les queries/render finir
    // reload loop ?
    if (navCount > 3) add({ route, type: 'loop', text: `${navCount} navigations (reload loop suspecté)` });
    // page vide / spinner bloqué ?
    const txtLen = (await page.evaluate(() => document.body?.innerText?.trim().length || 0));
    const onlySpinner = await page.evaluate(() =>
      !!document.querySelector('.animate-spin') && (document.body?.innerText?.trim().length || 0) < 40);
    if (txtLen < 20) add({ route, type: 'blank', text: `contenu quasi vide (len=${txtLen})` });
    else if (onlySpinner) add({ route, type: 'spinner', text: 'spinner bloqué (peu de contenu)' });
  } catch (e) {
    add({ route, type: 'nav-error', text: String(e?.message || e).slice(0, 300) });
  }
}

await browser.close();

// --- Sortie ---
const byRoute = {};
for (const i of issues) (byRoute[i.route] ||= []).push(i);
console.log('=== E2E SWEEP RESULT ===');
console.log(`routes testées: ${ROUTES.length} | issues: ${issues.length}`);
for (const [r, list] of Object.entries(byRoute)) {
  console.log(`\n[${r}] ${list.length} issue(s):`);
  for (const i of list) console.log(`   - ${i.type}${i.status ? ' ' + i.status : ''}: ${i.text || i.url || ''}`);
}
console.log('\n=== JSON ===');
console.log(JSON.stringify(issues));
process.exit(issues.length ? 1 : 0);
