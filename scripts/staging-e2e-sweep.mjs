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
const BACKEND = process.env.BACKEND || 'https://staging-backend.operioz.com';
const EMAIL = process.env.E2E_EMAIL || 'dev@operioz.com';
const PASS = process.env.E2E_PASS || '';

// Toutes les routes SPA authentifiées, NON paramétriques (cf. `grep path= client/src/App.tsx`).
// Exclues : les routes à paramètre (`:id`/`:token`/`:slug` — testées via repro ciblée) et les pages
// d'auth pure (/sign-in, /signin, /signup, /forgot-password, /reset-password — redirigent si connecté).
// But : ne plus rater une page basique (ex. /notes-de-frais cassée par un mismatch snake_case/camelCase).
const ROUTES = [
  '/dashboard', '/', '/aide', '/alertes-previsions', '/analyses-photos', '/articles',
  '/assistant', '/assistant/conversations', '/avis', '/badges', '/budgets-depenses',
  '/calendrier', '/calendrier-chantiers', '/cgu', '/cgv', '/chantiers', '/chat', '/classement',
  '/clients', '/clients/import', '/clients/nouveau', '/commandes', '/commandes/nouvelle',
  '/comptabilite', '/confidentialite', '/conges', '/contact', '/contrats', '/depenses',
  '/depenses/nouvelle', '/devis', '/devis-ia', '/devis-options', '/devis/nouveau', '/documentation',
  '/factures', '/flotte', '/fournisseurs', '/geolocalisation', '/guide', '/historique-emails',
  '/import', '/import-releve', '/integrations-comptables', '/interventions', '/ma-vitrine',
  '/mentions-legales', '/mobile', '/modeles-email', '/modeles-email-transactionnels', '/modules',
  '/notes-de-frais', '/notifications', '/parametres', '/performances-fournisseurs', '/planification',
  '/portail-gestion', '/previsions', '/profil', '/rapports', '/rdv-en-ligne', '/regles-depenses',
  '/relances', '/statistiques', '/stocks', '/support', '/tableau-bord-depenses',
  '/tableau-bord-sync-comptable', '/techniciens', '/utilisateurs', '/vehicules',
];

const issues = [];
const add = (o) => issues.push(o);

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await browser.newContext({ baseURL: BASE, ignoreHTTPSErrors: true });

// --- Auth par API (cookie partagé avec le contexte navigateur) ---
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
let navCount = 0;

page.on('console', (m) => {
  if (m.type() === 'error') {
    const t = m.text();
    /* Ignorer SEULEMENT le bruit tiers ; JAMAIS ignorer /api/ interne */
    if (/Download the React DevTools|preloaded using link preload|favicon|net::ERR_BLOCKED_BY_CLIENT|ERR_OICSP_|Uncaught SyntaxError|polyfill|extension/.test(t)) return;
    /* Scope "Failed to fetch/load" : ignore seulement si c'est tiers (CDN/analytics), pas /api/ interne */
    if (/^failed to (fetch|load)/i.test(t) && !/api\//.test(current)) return;
    add({ route: current, type: 'console', text: t.slice(0, 400) });
  }
});
page.on('pageerror', (e) => add({ route: current, type: 'pageerror', text: String(e?.message || e).slice(0, 400) }));
page.on('requestfailed', (r) => {
  const u = r.url();
  /* Ignorer SEULEMENT les hôtes tiers (CDN, analytics tiers, etc.) */
  /* JAMAIS ignorer /api/ interne */
  if (/^https?:\/\/(cdn\.|[^/]*cloudflare|fonts\.googleapis|google-analytics\.com|googletagmanager\.com|sentry\.io|segment\.com|gtag\.)/.test(u)) return;
  if (r.failure()?.errorText?.includes('ERR_BLOCKED_BY_CLIENT')) return;
  /* Capturer toutes les erreurs de requête (sauf les hôtes tiers strictement définis) */
  add({ route: current, type: 'request-failed', text: `${r.failure()?.errorText || 'unknown'}: ${u.replace(BASE, '').slice(0, 150)}` });
});
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
    // reload loop ? Exclure les redirects légitimes : si l'URL finale diffère de la route visitée
    // (ex. / → /dashboard quand authentifié, /utilisateurs → /dashboard si non-autorisé),
    // Playwright compte aussi les history.pushState/replaceState du SPA comme framenavigated,
    // ce qui gonfle le compteur sans qu'il y ait de vraie boucle.
    const finalPath = new URL(page.url()).pathname;
    const redirectedAway = finalPath !== route;
    if (navCount > 3 && !redirectedAway) add({ route, type: 'loop', text: `${navCount} navigations (reload loop suspecté)` });
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
