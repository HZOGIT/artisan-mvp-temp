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
const EMAIL = process.env.E2E_EMAIL || 'dev@operioz.com';
const PASS = process.env.E2E_PASS || '';
const issues = [];

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await browser.newContext({ baseURL: BASE, ignoreHTTPSErrors: true });
const signin = await ctx.request.post('/api/trpc/auth.signin?batch=1', {
  headers: { 'content-type': 'application/json' }, data: { '0': { json: { email: EMAIL, password: PASS } } },
});
if (!signin.ok()) { console.log(JSON.stringify({ fatal: `login failed HTTP ${signin.status()}` })); await browser.close(); process.exit(2); }

const trpcGet = async (path, input) => {
  const r = await ctx.request.get(`/api/trpc/${path}?batch=1&input=` + encodeURIComponent(JSON.stringify({ 0: { json: input } })));
  return (await r.json())[0]?.result?.data?.json;
};

let casesRun = 0;

// ── CAS 1 — Changement de statut d'un DEVIS depuis l'UI (P1 2026-06-16) ────────────────────────────
// Régression : le front appelait devis.update({statut}) -> ignoré. Doit router vers devis.envoyer/
// accepter/refuser. On vérifie que le statut PERSISTE après l'action UI.
async function casDevisStatut() {
  casesRun++;
  const tag = 'devis.statut-change';
  const list = (await trpcGet('devis.list', null)) ?? [];
  const labelOf = { envoye: 'Envoyé', accepte: 'Accepté', refuse: 'Refusé' };
  let target = list.find((d) => d.statut === 'envoye'); let to = 'accepte';
  if (!target) { target = list.find((d) => d.statut === 'brouillon'); to = 'envoye'; }
  if (!target) { issues.push({ tag, skipped: 'aucun devis envoye/brouillon testable' }); return; }
  const { id, statut: from } = target;
  const page = await ctx.newPage();
  const apiErrors = [];
  page.on('response', (r) => { if (/\/api\//.test(r.url()) && r.status() >= 400) apiErrors.push(`${r.status()} ${r.url().split('?')[0]}`); });
  try {
    await page.goto(`/devis/${id}`, { waitUntil: 'networkidle' });
    await page.getByRole('combobox').first().click();
    await page.getByRole('option', { name: labelOf[to], exact: true }).click();
    await page.waitForTimeout(2500);
    const after = await trpcGet('devis.getById', { id });
    if (after?.statut !== to) issues.push({ tag, id, from, expected: to, got: after?.statut, apiErrors });
  } catch (e) {
    issues.push({ tag, id, error: String(e).slice(0, 200), apiErrors });
  } finally {
    await page.close();
  }
}

await casDevisStatut();
// ── (Ajouter ici les cas factures/contrats et tout futur bug d'intégration front↔tRPC) ─────────────

console.log('=== E2E MUTATIONS RESULT ===');
console.log(`cas testés: ${casesRun} | issues: ${issues.length}`);
console.log('\n=== JSON ===');
console.log(JSON.stringify(issues, null, 2));
await browser.close();
process.exit(issues.length === 0 ? 0 : 1);
