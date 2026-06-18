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

// MODE PAR ROUTE (OPE-403, accélération post-deploy) : si `ROUTE=/<chemin>` est fourni (legacy OU v2,
// ex. `ROUTE=/v2/dashboard`), on ne valide QUE l'entrée PARITE_PAGES correspondante (les 2 côtés) et on
// SAUTE tout le reste (démo socle, recherche clients, ClientDetail, bascule, signature, sidebar mobile).
// → check ciblé ~10-15 s au lieu de ~3 min. Sweep GLOBAL = `ROUTE` non défini (cron + recette finale).
const ONLY = process.env.ROUTE || '';

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
  // 404 ATTENDU : token de signature de test invalide → `signature.getDevisForSignature` renvoie 404.
  if (/signature\.getDevisForSignature/.test(r.url())) return;
  // 401 ATTENDU : token portail de test invalide → les procédures `clientPortal.*` (gated par token)
  // renvoient Unauthorized (sécurité par design). Le legacy les déclenche même token invalide.
  if (r.status() === 401 && /clientPortal\./.test(r.url())) return;
  add({ route: current, type: 'http', status: r.status(), url: r.url().replace(BASE, '').slice(0, 160) });
});

// (route, sélecteur de texte qui prouve le rendu du socle)
const cases = [
  { route: '/v2/ping', expect: 'pong' },
  { route: '/v2/clients', expect: 'Clients' },
];

if (!ONLY) for (const c of cases) {
  current = c.route;
  await page.goto(c.route, { waitUntil: 'networkidle', timeout: 25000 });
  await page.waitForTimeout(1500);
  const body = (await page.textContent('body')) || '';
  if (!body.includes(c.expect)) {
    add({ route: c.route, type: 'missing-content', text: `attendu "${c.expect}" absent` });
  }
  await page.screenshot({ path: `/tmp/v2-socle-${c.route.replace(/\//g, '_')}.png`, fullPage: true });
}

// --- Parité Vague 1 : `/v2/<page>` (port conforme) vs `/<page>` (legacy) ---
// On vérifie que les marqueurs structurants de l'UI sont présents des DEUX côtés (même page, même
// markup copié à l'identique). Preuve de non-régression visuelle au niveau du contenu.
let pariteCount = 0;
// { legacy, v2, markers: [textes attendus des deux côtés] }
const PARITE_PAGES = [
  { legacy: '/clients', v2: '/v2/clients', markers: ['Gérez votre base de clients', 'Exporter (CSV)', 'Nouveau client'] },
  { legacy: '/notifications', v2: '/v2/notifications', markers: ['Toutes', 'Non lues'] },
  { legacy: '/techniciens', v2: '/v2/techniciens', markers: ["Gestion de l'équipe", 'Nouveau technicien', 'Statistiques'] },
  { legacy: '/fournisseurs', v2: '/v2/fournisseurs', markers: ['Gérez vos fournisseurs et leurs articles associés', 'Nouveau fournisseur', 'Liste des fournisseurs'] },
  { legacy: '/articles', v2: '/v2/articles', markers: ["Bibliothèque d'articles", 'Nouvel article', 'Importer CSV'] },
  { legacy: '/devis', v2: '/v2/devis', markers: ['Gérez vos devis clients', 'Nouveau devis'] },
  { legacy: '/factures', v2: '/v2/factures', markers: ['Gérez vos factures et avoirs clients', 'Nouvelle facture'] },
  { legacy: '/interventions', v2: '/v2/interventions', markers: ['Planifiez et suivez vos interventions', 'Nouvelle intervention'] },
  { legacy: '/commandes', v2: '/v2/commandes', markers: ['Bons de commande fournisseurs', 'Nouvelle commande'] },
  { legacy: '/stocks', v2: '/v2/stocks', markers: ['Gestion des Stocks', 'Ajouter un article', 'Stock bas'] },
  { legacy: '/depenses', v2: '/v2/depenses', markers: ['Total du mois', 'À rembourser', 'Export FEC'] },
  { legacy: '/comptabilite', v2: '/v2/comptabilite', markers: ['Exportez vos données comptables', 'Balance', 'Grand Livre'] },
  { legacy: '/portail-gestion', v2: '/v2/portail-gestion', markers: ['Portail Client', "Gérez l'accès en ligne de vos clients à leurs documents"] },
  { legacy: '/budgets-depenses', v2: '/v2/budgets-depenses', markers: ['Budgets', 'Totaux du mois', 'Par catégorie'] },
  { legacy: '/regles-depenses', v2: '/v2/regles-depenses', markers: ['Règles de catégorisation auto', 'Nouvelle règle'] },
  { legacy: '/historique-emails', v2: '/v2/historique-emails', markers: ['Historique des emails', 'Derniers envois'] },
  { legacy: '/support', v2: '/v2/support', markers: ["Centre d'aide Operioz", 'Questions fréquentes', 'Nous contacter'] },
  { legacy: '/avis', v2: '/v2/avis', markers: ['Avis clients', 'Note moyenne', 'Distribution'] },
  { legacy: '/chat', v2: '/v2/chat', markers: ['Conversations', 'Nouveau'] },
  { legacy: '/badges', v2: '/v2/badges', markers: ['Badges & Gamification', 'Classement', 'Objectifs'] },
  { legacy: '/classement', v2: '/v2/classement', markers: ['Classement', 'Gamification et performances des techniciens'] },
  { legacy: '/modeles-email', v2: '/v2/modeles-email', markers: ["Modèles d'emails", 'Variables disponibles', 'Nouveau modèle'] },
  { legacy: '/modeles-email-transactionnels', v2: '/v2/modeles-email-transactionnels', markers: ["Modèles d'E-mails Transactionnels", 'Modèles par défaut', 'Variables disponibles'] },
  { legacy: '/assistant/conversations', v2: '/v2/assistant/conversations', markers: ['Mes conversations'] },
  { legacy: '/vehicules', v2: '/v2/vehicules', markers: ['Gestion des Véhicules', 'Total véhicules', 'Ajouter un véhicule'] },
  { legacy: '/rapport-commande', v2: '/v2/rapport-commande', markers: ['Rapport de Commande', 'Articles à commander'] },
  { legacy: '/rapports', v2: '/v2/rapports', markers: ['Rapports Personnalisables', 'Mes rapports', 'Nouveau rapport'] },
  { legacy: '/documentation', v2: '/v2/documentation', markers: ["Guide d'utilisation", 'Sommaire'] },
  { legacy: '/ma-vitrine', v2: '/v2/ma-vitrine', markers: ['Ma Vitrine', 'Lien public', 'Personnalisation'] },
  { legacy: '/rdv-en-ligne', v2: '/v2/rdv-en-ligne', markers: ['RDV en ligne', 'Gérez les demandes de rendez-vous'] },
  { legacy: '/alertes-previsions', v2: '/v2/alertes-previsions', markers: ['Alertes Prévisions CA', 'Configuration', 'Historique des alertes'] },
  { legacy: '/previsions', v2: '/v2/previsions', markers: ['Prévisions de CA', 'CA Prévisionnel', 'Confiance'] },
  { legacy: '/performances-fournisseurs', v2: '/v2/performances-fournisseurs', markers: ['Performances Fournisseurs', 'Taux de Fiabilité', 'Performance par Fournisseur'] },
  { legacy: '/tableau-bord-depenses', v2: '/v2/tableau-bord-depenses', markers: ['Tableau de bord dépenses', 'Total du mois', 'Budget consommé'] },
  { legacy: '/import-releve', v2: '/v2/import-releve', markers: ['Import relevé bancaire', 'Choisir le fichier CSV'] },
  { legacy: '/tableau-bord-sync-comptable', v2: '/v2/tableau-bord-sync-comptable', markers: ['Tableau de Bord Synchronisations', 'Taux de Réussite'] },
  { legacy: '/geolocalisation', v2: '/v2/geolocalisation', markers: ['Géolocalisation', 'Carte en temps réel', 'Légende'] },
  { legacy: '/planification', v2: '/v2/planification', markers: ['Planification Intelligente', 'Techniciens suggérés', 'Carte des techniciens'] },
  { legacy: '/depenses/nouvelle', v2: '/v2/nouvelle-depense', markers: ['Nouvelle dépense', 'Scanner un justificatif', 'Total TTC'] },
  { legacy: '/integrations-comptables', v2: '/v2/integrations-comptables', markers: ['Intégrations Comptables', 'Export Manuel', 'Configuration'] },
  { legacy: '/analyses-photos', v2: '/v2/analyses-photos', markers: ['Analyse photos IA', 'Nouvelle analyse', 'Historique des analyses'] },
  { legacy: '/import', v2: '/v2/import', markers: ['Migrez vos données', 'Source', 'Assistance incluse'] },
  { legacy: '/devis-ia', v2: '/v2/devis-ia', markers: ['Devis Automatique IA', 'Mes analyses'] },
  { legacy: '/chantiers', v2: '/v2/chantiers', markers: ['Chantiers', 'projets multi-interventions'] },
  { legacy: '/assistant', v2: '/v2/assistant', markers: ['MonAssistant', 'Actions rapides'] },
  { legacy: '/calendrier-chantiers', v2: '/v2/calendrier-chantiers', markers: ['Calendrier des Chantiers', 'Aujourd'] },
  { legacy: '/signin', v2: '/v2/signin', markers: ['Connexion', 'Se connecter'] },
  { legacy: '/clients/nouveau', v2: '/v2/clients/nouveau', markers: ['Nouveau client', 'Type de client', 'Créer le client'] },
  { legacy: '/clients/import', v2: '/v2/clients/import', markers: ['Import de Clients', 'Modèle de fichier'] },
  { legacy: '/mobile', v2: '/v2/mobile', markers: ['Interventions du jour'] },
  { legacy: '/profil', v2: '/v2/profil', markers: ['Mon profil', 'Informations entreprise', 'Zone de danger'] },
  { legacy: '/devis/nouveau', v2: '/v2/devis/nouveau', markers: ['Nouveau devis', 'Lignes du devis', 'Générer avec'] },
  { legacy: '/commandes/nouvelle', v2: '/v2/commandes/nouvelle', markers: ['Nouveau bon de commande', 'Lignes de commande'] },
  { legacy: '/v2/cgv', v2: '/v2/cgv', markers: ['Conditions générales de vente', 'Période d'] }, // legacy /cgv (auth-wrapped, footer-only) rend vide → on valide la page /v2 réelle (la seule servie aux users)
  { legacy: '/flotte', v2: '/v2/flotte', markers: ['Flotte', "Vue d'ensemble de vos véhicules", 'Véhicules'] },
  { legacy: '/statistiques', v2: '/v2/statistiques', markers: ['Statistiques Devis', 'Analysez les performances de vos devis'] },
  { legacy: '/modules', v2: '/v2/modules', markers: ['Mes modules', 'modules actifs'] },
  { legacy: '/conges', v2: '/v2/conges', markers: ['Gestion des Congés', 'Nouvelle demande'] },
  { legacy: '/contrats', v2: '/v2/contrats', markers: ['Contrats de maintenance', 'Nouveau contrat'] },
  { legacy: '/relances', v2: '/v2/relances-devis', markers: ['Relances Devis', 'Configuration auto'] },
  { legacy: '/calendrier', v2: '/v2/calendrier', markers: ['Calendrier', 'glissez-déposez pour replanifier'] },
  { legacy: '/devis-options', v2: '/v2/devis-options', markers: ['Variantes de devis', 'Où trouver les variantes'] },
  { legacy: '/parametres', v2: '/v2/parametres', markers: ['Paramètres', 'Numérotation des documents', 'Ma page vitrine', 'Synchroniser mon agenda'] },
  { legacy: '/dashboard', v2: '/v2/dashboard', markers: ['CA du mois', 'Personnaliser le dashboard'] },
  { legacy: '/notes-de-frais', v2: '/v2/notes-frais', markers: ['Notes de frais', 'Nouvelle note'] },
  // Pages PUBLIQUES (montage `/v2` hors auth) — vérifie que le socle public rend la page.
  // NB : le PORTAIL (token) n'est PAS testé par marqueurs ici (le gate verifyAccess est timing-dépendant,
  // comme la signature) → test déterministe « montage déclenche verifyAccess » dans la section signature/portail.
  { legacy: '/paiement/succes', v2: '/v2/paiement/succes', markers: ['Paiement réussi', "Retour à l'accueil"] },
  { legacy: '/paiement/annule', v2: '/v2/paiement/annule', markers: ['Paiement annulé', 'Réessayer le paiement'] },
];
const paritePages = ONLY ? PARITE_PAGES.filter((p) => p.legacy === ONLY || p.v2 === ONLY) : PARITE_PAGES;
if (ONLY && paritePages.length === 0) {
  add({ route: ONLY, type: 'config', text: `ROUTE="${ONLY}" ne correspond à aucune entrée PARITE_PAGES (ajouter l'entrée d'abord)` });
}
for (const p of paritePages) {
  for (const route of [p.legacy, p.v2]) {
    pariteCount++;
    current = `parité ${route}`;
    await page.goto(route, { waitUntil: 'networkidle', timeout: 25000 });
    await page.waitForTimeout(1500);
    const body = (await page.textContent('body')) || '';
    for (const m of p.markers) {
      if (!body.includes(m)) add({ route, type: 'parité', text: `marqueur absent: "${m}"` });
    }
    await page.screenshot({ path: `/tmp/parite-${route.replace(/\//g, '_')}.png`, fullPage: true });
  }
}
// Barre de recherche Clients (placeholder = attribut, hors textContent).
if (!ONLY) for (const route of ['/clients', '/v2/clients']) {
  await page.goto(route, { waitUntil: 'networkidle', timeout: 25000 });
  await page.waitForTimeout(800);
  if (await page.locator('input[placeholder="Rechercher un client..."]').count() === 0) {
    add({ route, type: 'parité', text: 'barre de recherche absente' });
  }
}

// ClientDetail : on récupère un id de client réel via tRPC puis on vérifie le rendu de `/v2/clients/:id`.
// NB : on n'exige PAS la parité avec le legacy `/clients/:id` — la page legacy est CASSÉE (elle appelle
// des hooks après des early-returns → React #310, elle plante via l'ErrorBoundary). Le port `/v2` CORRIGE
// ce bug (gate de chargement externe). On valide donc le rendu côté v2 (marqueurs structurants présents).
if (!ONLY) try {
  const listRes = await ctx.request.get('/api/trpc/clients.list?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%7D%7D');
  const listJson = await listRes.json();
  const first = listJson?.[0]?.result?.data?.json?.[0];
  if (first?.id) {
    const MARQUEURS_DETAIL = ['Fiche client complète', 'Total facturé', 'Informations', 'Historique'];
    const route = `/v2/clients/${first.id}`;
    pariteCount++;
    current = `rendu ${route}`;
    await page.goto(route, { waitUntil: 'networkidle', timeout: 25000 });
    await page.waitForTimeout(1500);
    const body = (await page.textContent('body')) || '';
    for (const m of MARQUEURS_DETAIL) {
      if (!body.includes(m)) add({ route, type: 'detail', text: `marqueur absent: "${m}"` });
    }
  } else {
    add({ route: 'detail', type: 'detail', text: 'aucun client pour tester ClientDetail' });
  }
} catch (e) {
  add({ route: 'detail', type: 'detail', text: `échec récup id client: ${String(e).slice(0, 120)}` });
}

// Sections GLOBALES (bascule + signature + sidebar mobile) — SAUTÉES en mode ROUTE ciblé (gain de temps).
let basculeCount = 0, signCount = 0, sidebarCount = 0;
if (!ONLY) {
// --- Bascule strangler-fig (OPE-403) : défaut ACTIVÉ + escape hatch `?v2=0` + util de bascule par route ---
// IMPORTANT : le flag est « collant » via localStorage. On teste donc dans l'ordre défaut → opt-out → opt-in,
// le storage étant vierge à ce stade (aucune route ?v2 visitée avant). Toutes les pages étant migrées,
// le DÉFAUT (sans paramètre) bascule désormais vers `/v2`.

// 1) Sans flag (défaut) → bascule vers `/v2/<route>` migrée (storage vierge).
basculeCount++;
current = '/clients (défaut)';
await page.goto('/clients', { waitUntil: 'networkidle', timeout: 25000 });
await page.waitForTimeout(1500);
if (new URL(page.url()).pathname !== '/v2/clients') {
  add({ route: '/clients', type: 'bascule', text: `défaut ON mais pas de bascule, URL=${page.url()}` });
}

// 2) Opt-out explicite `?v2=0` → la route legacy reste legacy (escape hatch / rollback).
basculeCount++;
current = '/clients?v2=0';
await page.goto('/clients?v2=0', { waitUntil: 'networkidle', timeout: 25000 });
await page.waitForTimeout(1200);
if (new URL(page.url()).pathname !== '/clients') {
  add({ route: '/clients?v2=0', type: 'bascule', text: `opt-out ?v2=0 mais redirigé vers ${page.url()}` });
}

// 3) Avec `?v2=1` → bascule vers `/v2/<route>` migrée (et réécrit la préférence).
basculeCount++;
current = '/clients?v2=1';
await page.goto('/clients?v2=1', { waitUntil: 'networkidle', timeout: 25000 });
await page.waitForTimeout(1500);
if (new URL(page.url()).pathname !== '/v2/clients') {
  add({ route: '/clients?v2=1', type: 'bascule', text: `flag ON mais pas de bascule, URL=${page.url()}` });
}

// --- Signature (publique, par token) : montage `/v2` hors auth ---
// Sans token valide, l'état d'erreur n'apparaît qu'après les retries react-query (timing instable).
// On vérifie de façon DÉTERMINISTE que la page MONTE et lit le token : elle déclenche la requête tRPC
// `signature.getDevisForSignature` (preuve : routeur public + extraction du param + bonne procédure).
for (const route of ['/signature/e2e-token', '/v2/signature/e2e-token']) {
  signCount++;
  current = `signature ${route}`;
  let sigCalled = false;
  const onReq = (r) => { if (r.url().includes('signature.getDevisForSignature')) sigCalled = true; };
  page.on('request', onReq);
  await page.goto(route, { waitUntil: 'networkidle', timeout: 25000 });
  await page.waitForTimeout(1500);
  page.off('request', onReq);
  if (!sigCalled) add({ route, type: 'signature', text: 'la page n’a pas appelé signature.getDevisForSignature (montage/param KO)' });
}

// --- Portail client (publique, par token) : montage `/v2` hors auth — DÉTERMINISTE (verifyAccess) ---
// Le gate d'accès (lien valide/invalide) dépend du retour réseau (timing) → on vérifie que le montage
// LIT le token et déclenche `clientPortal.verifyAccess` (preuve : route publique + param + bonne proc).
for (const route of ['/portail/e2e-token', '/v2/portail/e2e-token']) {
  signCount++;
  current = `portail ${route}`;
  let called = false;
  const onReq = (r) => { if (r.url().includes('clientPortal.verifyAccess')) called = true; };
  page.on('request', onReq);
  await page.goto(route, { waitUntil: 'networkidle', timeout: 25000 });
  await page.waitForTimeout(1500);
  page.off('request', onReq);
  if (!called) add({ route, type: 'portail', text: 'la page n’a pas appelé clientPortal.verifyAccess (montage/param KO)' });
}

// --- Sidebar → v2 : la nav redirige vers `/v2` quand la route est migrée (registre V2_ROUTES) ---
// On cible la nav MOBILE (boutons directs `handleNavigate`, faciles à cliquer de façon fiable).
await page.setViewportSize({ width: 390, height: 844 });
const navBtn = (label) => page.locator('nav[aria-label="Navigation mobile"] button', { hasText: label }).first();

// « Clients » (route migrée) → doit mener à /v2/clients.
sidebarCount++;
current = 'sidebar Clients';
await page.goto('/dashboard', { waitUntil: 'networkidle', timeout: 25000 });
await page.waitForTimeout(1000);
await navBtn('Clients').click();
await page.waitForTimeout(1200);
if (new URL(page.url()).pathname !== '/v2/clients') {
  add({ route: 'sidebar/clients', type: 'sidebar', text: `attendu /v2/clients, obtenu ${page.url()}` });
}

// « Accueil » (route MIGRÉE = dashboard) → bascule vers /v2/dashboard.
sidebarCount++;
current = 'sidebar Accueil';
await navBtn('Accueil').click();
await page.waitForTimeout(1000);
if (new URL(page.url()).pathname !== '/v2/dashboard') {
  add({ route: 'sidebar/dashboard', type: 'sidebar', text: `attendu /v2/dashboard (migré), obtenu ${page.url()}` });
}
} // fin sections globales (if !ONLY)

await browser.close();
const total = (ONLY ? 0 : cases.length) + pariteCount + basculeCount + sidebarCount + signCount;
console.log(`${ONLY ? `[ROUTE ${ONLY}] ` : ''}cas testés: ${total} | issues: ${issues.length}`);
if (issues.length) console.log(JSON.stringify(issues, null, 2));
process.exit(issues.length ? 1 : 0);
