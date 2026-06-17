import { chromium } from 'playwright';

// e2e MUTATIONS du FRONT NEUF (/v2) — exerce de VRAIES actions UI → tRPC (client partagé) puis vérifie
// la PERSISTANCE côté serveur (refetch API). Non destructif : on modifie puis on REVIENT à l'état initial.
// Usage : ./scripts/pw-run.sh scripts/e2e/v2-mutations.mjs E2E_PASS='...'

const BASE = process.env.BASE || 'https://staging.operioz.com';
const EMAIL = process.env.E2E_EMAIL || 'dev@operioz.com';
const PASS = process.env.E2E_PASS || '';

const issues = [];
const add = (o) => issues.push(o);
let cas = 0;

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await browser.newContext({ baseURL: BASE, ignoreHTTPSErrors: true });

const signin = await ctx.request.post('/api/trpc/auth.signin?batch=1', {
  headers: { 'content-type': 'application/json' },
  data: { '0': { json: { email: EMAIL, password: PASS } } },
});
if (!signin.ok()) { console.log(JSON.stringify({ fatal: `login failed HTTP ${signin.status()}` })); await browser.close(); process.exit(2); }

const listClients = async () => {
  const r = await ctx.request.get('/api/trpc/clients.list?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%7D%7D');
  const j = await r.json();
  return j?.[0]?.result?.data?.json ?? [];
};

const page = await ctx.newPage();
page.on('pageerror', (e) => add({ type: 'pageerror', text: String(e?.message || e).slice(0, 200) }));

// --- Cas : Clients — éditer les Notes via la modale (/v2/clients), persistance, puis REVERT ---
cas++;
try {
  const before = await listClients();
  const target = before[0];
  if (!target) {
    add({ cas: 'clients.update', text: 'aucun client pour tester la mutation' });
  } else {
    const original = target.notes ?? '';
    const marker = `E2E-v2-mut-${Date.now()}`;

    const editNotes = async (value) => {
      await page.goto('/v2/clients', { waitUntil: 'networkidle', timeout: 25000 });
      await page.waitForTimeout(1200);
      // 1ʳᵉ carte = 1ᵉʳ client (ordre de clients.list). Scoper à la grille des cartes (.grid.gap-4)
      // pour ne PAS taper un menu de la sidebar. Trigger Radix = bouton aria-haspopup="menu".
      await page.locator('.grid.gap-4 button[aria-haspopup="menu"]').first().click();
      await page.getByRole('menuitem', { name: 'Éditer' }).click();
      const notes = page.locator('#edit-notes');
      await notes.waitFor({ state: 'visible', timeout: 5000 });
      await notes.fill(value);
      await page.getByRole('button', { name: 'Mettre à jour' }).click();
      await page.waitForTimeout(1800); // laisse la mutation + invalidation se faire
    };

    // Écrit le marqueur via l'UI
    await editNotes(marker);
    // Vérifie la persistance côté serveur
    let after = await listClients();
    let persisted = (after.find((c) => c.id === target.id)?.notes ?? '') === marker;
    if (!persisted) add({ cas: 'clients.update', text: `Notes non persistées (attendu "${marker}")` });

    // REVERT à l'état initial (via l'UI également)
    await editNotes(original);
    after = await listClients();
    const reverted = (after.find((c) => c.id === target.id)?.notes ?? '') === original;
    if (!reverted) add({ cas: 'clients.update', text: 'revert KO (état initial non restauré) — vérifier manuellement' });
  }
} catch (e) {
  add({ cas: 'clients.update', text: `exception: ${String(e?.message || e).slice(0, 200)}` });
}

await browser.close();
console.log(`cas testés: ${cas} | issues: ${issues.length}`);
if (issues.length) console.log(JSON.stringify(issues, null, 2));
process.exit(issues.length ? 1 : 0);
