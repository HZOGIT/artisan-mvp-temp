// Mesure la latence de /api/assistant/stream (TTFT + total) via Playwright.
// Usage : ./scripts/pw-run.sh scripts/measure-assistant-latency.mjs
// Env    : BASE (défaut https://staging.operioz.com), E2E_PASS (requis)
import { chromium } from 'playwright';

const BASE   = process.env.BASE   || 'https://staging.operioz.com';
const EMAIL  = process.env.E2E_EMAIL || 'dev@operioz.com';
const PASS   = process.env.E2E_PASS  || '';

const SCENARIOS = [
  { label: 'simple (sans outil attendu)',   message: 'Bonjour' },
  { label: 'tool call (liste factures)',     message: 'Liste mes factures impayées' },
  { label: 'multi-info (stats dashboard)',  message: 'Donne-moi les statistiques de mon activité ce mois' },
];


async function measureScenario(ctx, scenario) {
  const page = await ctx.newPage();
  const results = { label: scenario.label, ttft: null, total: null, chunks: 0, error: null };

  try {
    // Naviguer vers le site pour avoir les cookies dans le contexte page
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});

    // Mesure depuis le navigateur (a les cookies d'auth)
    const result = await page.evaluate(async ({ base, message }) => {
      const t0 = performance.now();
      let ttft = null;
      let chunks = 0;
      let error = null;

      try {
        const resp = await fetch(`${base}/api/assistant/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ message, history: [] }),
        });

        if (!resp.ok) {
          return { ttft: null, total: null, chunks: 0, error: `HTTP ${resp.status}` };
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value, { stream: true });
          const lines = text.split('\n').filter(l => l.startsWith('data: '));
          for (const line of lines) {
            try {
              const ev = JSON.parse(line.slice(6));
              if (ev.content && ttft === null) {
                ttft = performance.now() - t0;
              }
              if (ev.content || ev.threadId || ev.toolStart || ev.toolEnd) {
                chunks++;
              }
            } catch { /* chunk partiel */ }
          }
        }
      } catch (e) {
        error = String(e);
      }

      const total = performance.now() - t0;
      return { ttft, total: Math.round(total), chunks, error };
    }, { base: BASE, message: scenario.message });

    results.ttft  = result.ttft  ? Math.round(result.ttft)  : null;
    results.total = result.total;
    results.chunks = result.chunks;
    results.error = result.error;
  } catch (e) {
    results.error = String(e);
  }

  await page.close();
  return results;
}

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const bCtx = await browser.newContext({ baseURL: BASE, ignoreHTTPSErrors: true });

console.log(`\n🔐 Connexion à ${BASE}...`);
// Auth via API (comme staging-e2e-mutations.mjs)
const signin = await bCtx.request.post('/api/trpc/auth.signin?batch=1', {
  headers: { 'content-type': 'application/json' },
  data: { '0': { json: { email: EMAIL, password: PASS } } },
});
if (!signin.ok()) {
  console.error(`❌ Login échoué HTTP ${signin.status()}`);
  await browser.close();
  process.exit(2);
}
console.log('✅ Connecté\n');

const all = [];
for (const scenario of SCENARIOS) {
  process.stdout.write(`⏱  Mesure : "${scenario.label}" ... `);
  const r = await measureScenario(bCtx, scenario);
  all.push(r);
  if (r.error) {
    console.log(`❌ Erreur : ${r.error}`);
  } else {
    console.log(`TTFT=${r.ttft}ms | total=${r.total}ms | chunks=${r.chunks}`);
  }
  // Pause entre scénarios pour éviter le rate-limit
  await new Promise(res => setTimeout(res, 3000));
}

await browser.close();

console.log('\n══════════════════════════════════════════');
console.log('Rapport latence assistant /api/assistant/stream');
console.log('══════════════════════════════════════════');
for (const r of all) {
  const status = r.error ? `ERROR: ${r.error}` : `TTFT=${r.ttft}ms | total=${r.total}ms | chunks=${r.chunks}`;
  console.log(`  ${r.label.padEnd(36)} → ${status}`);
}
console.log('══════════════════════════════════════════\n');
