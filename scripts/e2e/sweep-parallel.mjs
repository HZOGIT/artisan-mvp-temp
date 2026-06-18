// Sweep PARALLÉLISÉ des liens de navigation (ce que l'utilisateur clique) — détecte 404/erreurs.
// Login 1× (cookies partagés par le contexte), puis navigation en parallèle par lots. Bien + rapide
// que le sweep séquentiel. Usage: ./scripts/pw-run.sh scripts/e2e/sweep-parallel.mjs [E2E_PASS=...]
import { chromium } from 'playwright';

const BASE = 'https://staging.operioz.com';
const PASS = process.env.E2E_PASS || 'Azerqsdf1234!';
const CONCURRENCY = 8;

// Liens cliquables de la sidebar (nav.ts) — la cible des 404 de routing.
const ROUTES = `/dashboard /clients /clients/nouveau /clients/import /devis /devis/nouveau /devis-options /factures
 /interventions /commandes /commandes/nouvelle /stocks /articles /fournisseurs /techniciens /contrats /comptabilite
 /depenses /budgets-depenses /regles-depenses /tableau-bord-depenses /notes-de-frais /import-releve /historique-emails
 /modeles-email /modeles-email-transactionnels /relances /rdv-en-ligne /calendrier /chantiers /calendrier-chantiers
 /portail-gestion /ma-vitrine /avis /statistiques /rapports /rapport-commande /previsions /alertes-previsions
 /performances-fournisseurs /flotte /vehicules /geolocalisation /planification /conges /badges /classement /chat
 /assistant /assistant/conversations /modules /parametres /profil /utilisateurs /support /documentation /aide
 /devis-ia /analyses-photos /import /integrations-comptables`.split(/\s+/).filter(Boolean);

const b = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await b.newContext({ baseURL: BASE, ignoreHTTPSErrors: true, viewport: { width: 1280, height: 800 } });
// login 1× → cookie host-only dans le jar du contexte (partagé par toutes les pages)
await ctx.request.post('/api/trpc/auth.signin?batch=1', { headers: { 'content-type': 'application/json' }, data: { '0': { json: { email: 'dev@operioz.com', password: PASS } } } });

async function check(route) {
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e.message).slice(0, 80)));
  p.on('console', m => { if (m.type() === 'error') errs.push('console:' + m.text().slice(0, 60)); });
  let issue = null;
  try {
    await p.goto(route, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await p.waitForTimeout(1400);
    const finalPath = new URL(p.url()).pathname;
    const body = (await p.textContent('body')) || '';
    if (/page introuvable|page non trouvée|\b404\b|n'existe pas/i.test(body)) issue = '404/NotFound';
    else if (finalPath === '/onboarding' && route !== '/onboarding') issue = 'redir→onboarding';
    else if (body.length < 250) issue = 'page quasi-vide(' + body.length + ')';
    else if (errs.length) issue = 'errs:' + errs.slice(0, 2).join('|');
  } catch (e) { issue = 'goto-fail:' + String(e.message).slice(0, 50); }
  await p.close();
  return { route, issue };
}

const results = [];
for (let i = 0; i < ROUTES.length; i += CONCURRENCY) {
  const batch = ROUTES.slice(i, i + CONCURRENCY);
  results.push(...await Promise.all(batch.map(check)));
}
await b.close();
const issues = results.filter(r => r.issue);
console.log(`\nroutes testées: ${results.length} | issues: ${issues.length}`);
for (const r of issues) console.log(`  ❌ ${r.route} → ${r.issue}`);
if (!issues.length) console.log('  ✅ tout vert');
