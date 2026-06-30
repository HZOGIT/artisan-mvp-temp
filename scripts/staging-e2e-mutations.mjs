// Sweep e2e MUTATIONS staging : exerce de VRAIES actions front -> tRPC (pas seulement le chargement
// des pages, cf. staging-e2e-sweep.mjs) et vérifie que l'effet PERSISTE côté serveur (refetch).
// But : attraper les régressions de contrat front<->backend (ex. P1 « le statut ne change pas » :
// le front appelait <module>.update({statut}) alors que le backend a des mutations de transition
// dédiées et ignore silencieusement `statut`).
//
// Chaque cas : (1) état de départ via API, (2) action pilotée dans le VRAI navigateur (UI réelle),
// (3) assertion de persistance via API. Sortie : « cas testés: N | issues: M » + JSON détaillé.
//
// ➜ AJOUTER UN CAS ICI À CHAQUE FOIS QU'ON CORRIGE UN BUG D'INTÉGRATION FRONT↔tRPC (cf. CLAUDE.md).
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'https://staging.operioz.com';
/* Front et backend sont sur deux domaines : les appels /api/* visent le backend DIRECT (plus de proxy
 * same-origin). Les pages (page.goto) restent sur BASE (le domaine front). Cf. shared/backend-url.ts. */
const BACKEND = process.env.BACKEND || 'https://staging-backend.operioz.com';
const EMAIL = process.env.E2E_EMAIL || 'dev@operioz.com';
const PASS = process.env.E2E_PASS || '';
const issues = [];

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await browser.newContext({ baseURL: BASE, ignoreHTTPSErrors: true });
const signin = await ctx.request.post(`${BACKEND}/api/trpc/auth.signin?batch=1`, {
  headers: { 'content-type': 'application/json' }, data: { '0': { json: { email: EMAIL, password: PASS } } },
});
if (!signin.ok()) { console.log(JSON.stringify({ fatal: `login failed HTTP ${signin.status()}` })); await browser.close(); process.exit(2); }

const trpcGet = async (path, input) => {
  const r = await ctx.request.get(`${BACKEND}/api/trpc/${path}?batch=1&input=` + encodeURIComponent(JSON.stringify({ 0: { json: input } })));
  return (await r.json())[0]?.result?.data?.json;
};

let casesRun = 0;

// ── CAS 1 — Changement de statut d'un DEVIS depuis l'UI (P1 2026-06-16) ────────────────────────────
// Régression : le front appelait devis.update({statut}) -> ignoré. Doit router vers devis.envoyer/
// accepter/refuser. On vérifie que le statut PERSISTE après l'action UI.
// Fix OPE-764 : le test crée son propre devis jetable (brouillon→envoye via API, envoye→refuse
// via UI) et le supprime au teardown. Ne consomme plus le pool réel. `refuse` est choisie car
// terminal suppressible (contrairement à `accepte` qui est terminal non-suppressible).
async function casDevisStatut() {
  casesRun++;
  const tag = 'devis.statut-change';
  const trpcPost = async (proc, input) => ctx.request.post(`${BACKEND}/api/trpc/${proc}?batch=1`, {
    headers: { 'content-type': 'application/json' },
    data: { '0': { json: input } },
  });

  const clients = (await trpcGet('clients.list', null)) ?? [];
  if (clients.length === 0) { issues.push({ tag, skipped: 'aucun client disponible pour créer le devis de test' }); return; }
  const clientId = clients[0].id;

  let devisId = null;
  const page = await ctx.newPage();
  const apiErrors = [];
  page.on('response', (r) => { if (/\/api\//.test(r.url()) && r.status() >= 400) apiErrors.push(`${r.status()} ${r.url().split('?')[0]}`); });
  try {
    const rc = await trpcPost('devis.create', { clientId, objet: `E2E-test-statut-${Date.now()}` });
    if (!rc.ok()) { issues.push({ tag, step: 'create', error: `HTTP ${rc.status()}` }); return; }
    const created = (await rc.json())[0]?.result?.data?.json;
    if (!created?.id) { issues.push({ tag, step: 'create-id', error: 'id absent dans la réponse' }); return; }
    devisId = created.id;

    // OPE-831 — devis.envoyer requiert au moins une ligne (garde ajoutée post fix)
    const rl = await trpcPost('devis.addLigne', { devisId, designation: 'E2E-ligne', prixUnitaireHT: '100.00' });
    if (!rl.ok()) { issues.push({ tag, step: 'addLigne', error: `HTTP ${rl.status()}` }); return; }

    const re = await trpcPost('devis.envoyer', { id: devisId });
    if (!re.ok()) { issues.push({ tag, step: 'envoyer', error: `HTTP ${re.status()}` }); return; }

    await page.goto(`/devis/${devisId}`, { waitUntil: 'networkidle' });
    await page.getByRole('combobox').first().click();
    await page.getByRole('option', { name: 'Refusé', exact: true }).click();
    await page.waitForTimeout(2500);

    const after = await trpcGet('devis.getById', { id: devisId });
    if (after?.statut !== 'refuse') {
      issues.push({ tag, id: devisId, from: 'envoye', expected: 'refuse', got: after?.statut, apiErrors });
    }
  } catch (e) {
    issues.push({ tag, id: devisId, error: String(e).slice(0, 200), apiErrors });
  } finally {
    await page.close();
    if (devisId !== null) {
      try { await trpcPost('devis.delete', { id: devisId }); } catch { /* best-effort */ }
    }
  }
}

await casDevisStatut();

// ── CAS 2 — billing.getBillingInfo : shape valide (BillingMaisonSection peut se rendre) ──────────
// Anti-régression : si getBillingInfo renvoie une shape cassée, BillingMaisonSection plante en silencieux.
async function casBillingGetInfo() {
  casesRun++;
  const tag = 'billing.getBillingInfo-shape';
  try {
    const data = await trpcGet('billing.getBillingInfo', null);
    if (!Array.isArray(data?.paymentMethods)) {
      issues.push({ tag, error: 'paymentMethods absent ou non-array', got: JSON.stringify(data)?.slice(0, 200) });
      return;
    }
    if (!Array.isArray(data?.recentInvoices)) {
      issues.push({ tag, error: 'recentInvoices absent ou non-array', got: JSON.stringify(data)?.slice(0, 200) });
    }
  } catch (e) {
    issues.push({ tag, error: String(e).slice(0, 200) });
  }
}

// ── CAS 3 — Page /abonnement : section billing visible + dialog "Ajouter" s'ouvre ──
// Anti-régression : vérifie que BillingMaisonSection est monté et que le bouton "Ajouter" ouvre bien
// AddCardDialog (bug possible : dialog ne s'ouvre pas si state addCardOpen mal propagé).
async function casBillingRender() {
  casesRun++;
  const tag = 'billing.section-render+dialog';
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e).slice(0, 200)));
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200)); });
  try {
    await page.goto('/abonnement', { waitUntil: 'networkidle' });
    const btn = page.getByRole('button', { name: /Ajouter/i }).first();
    const btnVisible = await btn.isVisible({ timeout: 4000 }).catch(() => false);
    if (!btnVisible) {
      issues.push({ tag, error: 'Bouton "Ajouter" non visible sur /abonnement', consoleErrors });
      return;
    }
    await btn.click();
    await page.waitForTimeout(700);
    const dialog = page.getByRole('dialog');
    const dialogVisible = await dialog.isVisible({ timeout: 2000 }).catch(() => false);
    if (!dialogVisible) {
      issues.push({ tag, error: 'Dialog "Ajouter une carte" non ouvert après clic', consoleErrors });
      return;
    }
    if (consoleErrors.length > 0) {
      issues.push({ tag, warning: 'erreurs console/page', consoleErrors });
    }
  } catch (e) {
    issues.push({ tag, error: String(e).slice(0, 200) });
  } finally {
    await page.close();
  }
}

// ── CAS 4 — setDefaultPaymentMethod + revokePaymentMethod persistent en DB (skip si 0 PM) ─────────
// Anti-régression : vérifie que les mutations billing non-Stripe (setDefault, revoke) écrivent bien
// en DB et sont reflétées dans un refetch getBillingInfo.
// Revoke : seulement si >= 2 PM (ne pas laisser le compte sans carte).
async function casBillingMutations() {
  casesRun++;
  const tag = 'billing.mutations-persist';
  const trpcPost = async (proc, input) => ctx.request.post(`${BACKEND}/api/trpc/${proc}?batch=1`, {
    headers: { 'content-type': 'application/json' },
    data: { '0': { json: input } },
  });
  try {
    const info = await trpcGet('billing.getBillingInfo', null);
    const pms = info?.paymentMethods ?? [];
    if (pms.length === 0) { issues.push({ tag, skipped: 'aucune PM disponible pour le compte e2e' }); return; }

    // setDefault : PM non-default → doit devenir is_default=true après refetch
    const nonDefault = pms.find((p) => !p.is_default);
    if (nonDefault) {
      const r = await trpcPost('billing.setDefaultPaymentMethod', { paymentMethodId: nonDefault.id });
      if (!r.ok()) {
        issues.push({ tag, step: 'setDefault', error: `HTTP ${r.status()}`, pmId: nonDefault.id });
      } else {
        const after = await trpcGet('billing.getBillingInfo', null);
        const updated = (after?.paymentMethods ?? []).find((p) => p.id === nonDefault.id);
        if (!updated?.is_default) {
          issues.push({ tag, step: 'setDefault-persist', pmId: nonDefault.id, got: updated?.is_default });
        }
      }
    }

    // revoke : PM non-default uniquement, seulement si >= 2 PM (garder au moins 1 carte)
    const info2 = await trpcGet('billing.getBillingInfo', null);
    const pms2 = info2?.paymentMethods ?? [];
    const toRevoke = pms2.length >= 2 ? pms2.find((p) => !p.is_default) : null;
    if (toRevoke) {
      const r = await trpcPost('billing.revokePaymentMethod', { paymentMethodId: toRevoke.id });
      if (!r.ok()) {
        issues.push({ tag, step: 'revoke', error: `HTTP ${r.status()}`, pmId: toRevoke.id });
      } else {
        const after = await trpcGet('billing.getBillingInfo', null);
        const stillExists = (after?.paymentMethods ?? []).some((p) => p.id === toRevoke.id);
        if (stillExists) {
          issues.push({ tag, step: 'revoke-persist', pmId: toRevoke.id, error: 'PM encore présente après revoke' });
        }
      }
    }
  } catch (e) {
    issues.push({ tag, error: String(e).slice(0, 200) });
  }
}

// ── CAS 5 — billing.changePlan persiste en DB (skip si aucune subscription) ──────────────────────────
// Anti-régression : vérifie que changePlan met bien à jour plan_id dans billing_subscriptions.
// Restaure le plan initial en fin de test pour ne pas polluer l'état du compte e2e.
async function casBillingChangePlan() {
  casesRun++;
  const tag = 'billing.changePlan-persist';
  const trpcPost = async (proc, input) => ctx.request.post(`${BACKEND}/api/trpc/${proc}?batch=1`, {
    headers: { 'content-type': 'application/json' },
    data: { '0': { json: input } },
  });
  try {
    const info = await trpcGet('billing.getBillingInfo', null);
    if (!info?.subscription) { issues.push({ tag, skipped: 'aucune subscription active sur le compte e2e' }); return; }
    const originalPlan = info.subscription.plan_id;
    const target = originalPlan === 'starter' ? 'pro' : 'starter';

    const r = await trpcPost('billing.changePlan', { planId: target });
    if (!r.ok()) { issues.push({ tag, step: 'changePlan', error: `HTTP ${r.status()}` }); return; }

    const after = await trpcGet('billing.getBillingInfo', null);
    if (after?.subscription?.plan_id !== target) {
      issues.push({ tag, step: 'persist', expected: target, got: after?.subscription?.plan_id });
    }

    // Restaure le plan initial
    await trpcPost('billing.changePlan', { planId: originalPlan });
  } catch (e) {
    issues.push({ tag, error: String(e).slice(0, 200) });
  }
}

// ── CAS 6 — cancelAtPeriodEnd + reactivate round-trip (skip si aucune subscription) ─────────────────
// Anti-régression : vérifie que cancel_at est positionné puis effacé. Les 2 mutations sont testées
// ensemble pour restaurer l'état (ne pas laisser le compte e2e en état "en attente d'annulation").
async function casBillingCancelReactivate() {
  casesRun++;
  const tag = 'billing.cancelAtPeriodEnd+reactivate';
  const trpcPost = async (proc, input) => ctx.request.post(`${BACKEND}/api/trpc/${proc}?batch=1`, {
    headers: { 'content-type': 'application/json' },
    data: { '0': { json: input } },
  });
  try {
    const info = await trpcGet('billing.getBillingInfo', null);
    if (!info?.subscription) { issues.push({ tag, skipped: 'aucune subscription active sur le compte e2e' }); return; }

    // Si déjà annulée, réactive d'abord pour avoir un état propre
    if (info.subscription.cancel_at !== null) {
      await trpcPost('billing.reactivate', {});
    }

    // Cancel
    const rc = await trpcPost('billing.cancelAtPeriodEnd', {});
    if (!rc.ok()) { issues.push({ tag, step: 'cancel', error: `HTTP ${rc.status()}` }); return; }
    const afterCancel = await trpcGet('billing.getBillingInfo', null);
    if (afterCancel?.subscription?.cancel_at === null) {
      issues.push({ tag, step: 'cancel-persist', error: 'cancel_at reste null après cancelAtPeriodEnd' });
    }

    // Reactivate (restaure l'état)
    const rr = await trpcPost('billing.reactivate', {});
    if (!rr.ok()) { issues.push({ tag, step: 'reactivate', error: `HTTP ${rr.status()}` }); return; }
    const afterReactivate = await trpcGet('billing.getBillingInfo', null);
    if (afterReactivate?.subscription?.cancel_at !== null) {
      issues.push({ tag, step: 'reactivate-persist', error: 'cancel_at non-null après reactivate' });
    }
  } catch (e) {
    issues.push({ tag, error: String(e).slice(0, 200) });
  }
}

await casBillingGetInfo();
await casBillingRender();
await casBillingMutations();
await casBillingChangePlan();
await casBillingCancelReactivate();

// ── CAS 7 — Anti-régression OPE-606 : routing /dashboard stable + /signin accessible ────────────────
// Bug corrigé : gate onboarding utilisait navigate() custom (pushState + popstate synthétique) → conflit
// TanStack Router → 24+ transitions /dashboard↔/onboarding. Fix : useNavigate de @tanstack/react-router.
// Bug corrigé : 401 UNAUTHORIZED redirectait vers /login (inexistant). Fix : redirige vers /signin.
// Ce cas vérifie : (1) /dashboard se charge sans boucle (< 5 navigations), (2) /signin répond 200.
async function casSignupRoutingStable() {
  casesRun++;
  const tag = 'routing.signup-no-loop';
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e).slice(0, 200)));
  try {
    let navCount = 0;
    page.on('framenavigated', () => { navCount++; });
    await page.goto('/dashboard', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);
    if (navCount > 5) {
      issues.push({ tag, error: `boucle de navigation détectée : ${navCount} transitions sur /dashboard`, consoleErrors });
      return;
    }
    const finalUrl = new URL(page.url()).pathname;
    if (finalUrl !== '/dashboard' && finalUrl !== '/onboarding') {
      issues.push({ tag, error: `URL finale inattendue : ${finalUrl}`, navCount, consoleErrors });
      return;
    }
    // Vérifier que /signin répond 200 (cible du redirect 401 — était /login avant fix)
    const signinRes = await ctx.request.get('/signin');
    if (!signinRes.ok()) {
      issues.push({ tag, step: '/signin-accessible', error: `HTTP ${signinRes.status()}` });
    }
    if (consoleErrors.length > 0) {
      issues.push({ tag, warning: 'erreurs console/pageerror', consoleErrors });
    }
  } catch (e) {
    issues.push({ tag, error: String(e).slice(0, 200) });
  } finally {
    await page.close();
  }
}

// ── CAS 7b — Anti-régression OPE-642 : COMPTE NEUF (onboardingCompleted=false) sans boucle ──────────
// Le vrai déclencheur du bug : un compte dont l'onboarding n'est PAS terminé. dev@operioz.com a
// onboardingCompleted=true → ne déclenche jamais la gate (CAS 7 ne couvrait donc pas la boucle).
// Cause racine : le gate (dashboard-layout-mount) redirigeait vers /onboarding via tsNavigate, or
// /onboarding vit HORS du sous-arbre du shell → la navigation in-router franchit deux arbres de routes
// et entre en collision avec la ré-assertion d'historique de TanStack → boucle /dashboard↔/onboarding
// (29-32 navigations sur compte neuf). Fix : navigation pleine page (window.location.replace), comme la
// redirection sœur /home→/dashboard. Ce cas reproduit le déclencheur réel (signup neuf + goto('/')) et
// vérifie qu'on atterrit sur /onboarding SANS boucle.
async function casSignupNeufNoLoop() {
  casesRun++;
  const tag = 'routing.signup-neuf-no-loop';
  const freshCtx = await browser.newContext({ baseURL: BASE, ignoreHTTPSErrors: true });
  const email = `e2e_onboarding_${Date.now()}@test.operioz.com`;
  const page = await freshCtx.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)));
  let signedUp = false;
  try {
    const res = await freshCtx.request.post(`${BACKEND}/api/trpc/auth.signup?batch=1`, {
      headers: { 'content-type': 'application/json' },
      data: { '0': { json: { email, password: PASS || 'Azerqsdf1234!', name: 'E2E Onboarding' } } },
    });
    if (!res.ok()) { issues.push({ tag, step: 'signup', error: `HTTP ${res.status()}` }); return; }
    signedUp = true;
    let navCount = 0;
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) navCount++; });
    await page.goto('/', { waitUntil: 'load', timeout: 20000 });
    await page.waitForTimeout(6000);
    const finalUrl = new URL(page.url()).pathname;
    if (navCount > 8) {
      issues.push({ tag, error: `boucle détectée sur compte neuf : ${navCount} navigations`, finalUrl, pageErrors });
      return;
    }
    if (finalUrl !== '/onboarding') {
      issues.push({ tag, error: `compte neuf devrait atterrir sur /onboarding, obtenu ${finalUrl}`, navCount, pageErrors });
      return;
    }
    if (pageErrors.length > 0) {
      issues.push({ tag, warning: 'erreurs pageerror', pageErrors });
    }
  } catch (e) {
    issues.push({ tag, error: String(e).slice(0, 200) });
  } finally {
    if (signedUp) {
      try {
        await freshCtx.request.post(`${BACKEND}/api/trpc/auth.deleteAccount?batch=1`, {
          headers: { 'content-type': 'application/json' }, data: { '0': { json: { confirmation: 'SUPPRIMER' } } },
        });
      } catch { /* nettoyage best-effort */ }
    }
    await page.close();
    await freshCtx.close();
  }
}

await casSignupRoutingStable();
await casSignupNeufNoLoop();

// ── CAS ATTESTATION TVA — route de download (OPE-705) ───────────────────────────────────────────────
// Anti-régression : vérifie que GET /api/factures/attestations-tva/:id/download renvoie 200+PDF
// (et non 404 comme avant la correction). Trouve une attestation existante ou en génère une.
async function casAttestationTvaDownload() {
  casesRun++;
  const tag = 'attestation-tva.download-200';
  try {
    const factures = (await trpcGet('factures.list', null)) ?? [];
    let attId = null;
    for (const f of factures.slice(0, 10)) {
      const atts = (await trpcGet('factures.attestationTva.getByFacture', { factureId: f.id })) ?? [];
      if (atts.length > 0) { attId = atts[0].id; break; }
    }
    if (!attId) {
      issues.push({ tag, skipped: 'aucune attestation existante sur le compte e2e — générer manuellement pour tester' });
      return;
    }
    const resp = await ctx.request.get(`${BACKEND}/api/factures/attestations-tva/${attId}/download`);
    if (resp.status() !== 200) {
      issues.push({ tag, id: attId, error: `attendu 200 got ${resp.status()}` });
      return;
    }
    const ct = resp.headers()['content-type'] ?? '';
    if (!ct.includes('pdf')) {
      issues.push({ tag, id: attId, error: `content-type attendu pdf got "${ct}"` });
    }
  } catch (e) {
    issues.push({ tag, error: String(e).slice(0, 200) });
  }
}

await casAttestationTvaDownload();

// ── CAS 8 — clients.create + update + delete, teardown garanti (anti-régression OPE-735) ───────────
// Bug : les runs précédents créaient des clients E2E-<ts> sans cleanup → pollution liste /clients.
// Ce cas crée un client, vérifie la persistance, puis le supprime dans finally quelle que soit l'issue.
async function casClientsCreateUpdateDelete() {
  casesRun++;
  const tag = 'clients.create-update-delete';
  const trpcPost = async (proc, input) => ctx.request.post(`${BACKEND}/api/trpc/${proc}?batch=1`, {
    headers: { 'content-type': 'application/json' },
    data: { '0': { json: input } },
  });
  const ts = Date.now();
  let clientId = null;
  try {
    const rc = await trpcPost('clients.create', { nom: `E2E-${ts} Client`, email: `e2e+${ts}@example.com`, type: 'particulier' });
    if (!rc.ok()) { issues.push({ tag, step: 'create', error: `HTTP ${rc.status()}` }); return; }
    const created = (await rc.json())[0]?.result?.data?.json;
    if (!created?.id) { issues.push({ tag, step: 'create-id', error: 'id absent dans la réponse' }); return; }
    clientId = created.id;

    const fetched = await trpcGet('clients.getById', { id: clientId });
    if (fetched?.nom !== `E2E-${ts} Client`) {
      issues.push({ tag, step: 'getById', expected: `E2E-${ts} Client`, got: fetched?.nom });
    }

    const ru = await trpcPost('clients.update', { id: clientId, nom: `E2E-${ts} Updated` });
    if (!ru.ok()) { issues.push({ tag, step: 'update', error: `HTTP ${ru.status()}` }); }
    else {
      const afterUpdate = await trpcGet('clients.getById', { id: clientId });
      if (afterUpdate?.nom !== `E2E-${ts} Updated`) {
        issues.push({ tag, step: 'update-persist', expected: `E2E-${ts} Updated`, got: afterUpdate?.nom });
      }
    }
  } catch (e) {
    issues.push({ tag, error: String(e).slice(0, 200) });
  } finally {
    if (clientId !== null) {
      try { await trpcPost('clients.delete', { id: clientId }); } catch { /* best-effort */ }
    }
  }
}

await casClientsCreateUpdateDelete();
// ── (Ajouter ici les cas factures/contrats et tout futur bug d'intégration front↔tRPC) ─────────────

console.log('=== E2E MUTATIONS RESULT ===');
console.log(`cas testés: ${casesRun} | issues: ${issues.length}`);
console.log('\n=== JSON ===');
console.log(JSON.stringify(issues, null, 2));
await browser.close();
process.exit(issues.length === 0 ? 0 : 1);
