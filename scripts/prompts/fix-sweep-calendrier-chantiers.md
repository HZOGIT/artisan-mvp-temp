# Fix — /calendrier-chantiers ERR_FAILED

## Contexte

Le sweep e2e staging (`scripts/staging-e2e-sweep.mjs`) tourne contre
`https://staging.operioz.com` et remonte une issue sur `/calendrier-chantiers` :

```
[/calendrier-chantiers] 1 issue(s):
  - console: Failed to load resource: net::ERR_FAILED
```

`ERR_FAILED` dans la console browser = une ressource chargée par cette page
échoue côté réseau (pas un 4xx/5xx HTTP — la connexion ne s'établit pas du tout).

## Ce que tu dois faire

### 1. Reproduire avec Playwright

```bash
E2E_PASS='Azerqsdf1234!' ./scripts/pw-run.sh scripts/staging-e2e-sweep.mjs 2>&1
```

Confirme que `/calendrier-chantiers` est toujours en erreur.

### 2. Identifier la ressource qui échoue

Lance un script Playwright ciblé sur cette route uniquement pour capturer l'URL
exacte de la ressource qui échoue. Crée un script temporaire `/tmp/debug-calendrier.mjs` :

```js
import { chromium } from 'playwright';
const BACKEND = 'https://staging-backend.operioz.com';
const BASE = 'https://staging.operioz.com';
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await browser.newContext({ baseURL: BASE, ignoreHTTPSErrors: true });
// login
const signin = await ctx.request.post(`${BACKEND}/api/trpc/auth.signin?batch=1`, {
  headers: { 'content-type': 'application/json' },
  data: { '0': { json: { email: 'dev@operioz.com', password: 'Azerqsdf1234!' } } },
});
if (!signin.ok()) { console.error('login failed', signin.status()); process.exit(1); }
const page = await ctx.newPage();
page.on('requestfailed', r => console.log('FAILED:', r.url(), r.failure()?.errorText));
page.on('response', r => { if (r.status() >= 400) console.log('HTTP ERR:', r.status(), r.url()); });
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE ERR:', m.text()); });
await page.goto('/calendrier-chantiers', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(3000);
await browser.close();
```

```bash
./scripts/pw-run.sh /tmp/debug-calendrier.mjs
```

### 3. Diagnostiquer

Selon la ressource qui échoue :
- **API tRPC** → vérifier que le router expose bien la procédure, tester via curl sur
  `staging-backend.operioz.com`
- **Ressource externe** (CDN, carte, lib) → vérifier si c'est un blocage réseau dans
  le conteneur Playwright (normal pour certains CDN) ou une URL incorrecte dans le code
- **Chunk JS** (import dynamique stale) → forcer un rechargement

### 4. Corriger

- Si c'est un bug dans `src/` : corriger, `pnpm check`, commit chirurgical sur `staging`,
  `./scripts/deploy-backend.sh`
- Si c'est un faux positif réseau (CDN injoignable depuis Docker) : ajouter un filtre
  dans le sweep (`scripts/staging-e2e-sweep.mjs`) pour ignorer cette URL spécifique
  avec un commentaire expliquant pourquoi

### 5. Valider

Relancer le sweep complet et confirmer que l'issue `/calendrier-chantiers` a disparu :

```bash
E2E_PASS='Azerqsdf1234!' ./scripts/pw-run.sh scripts/staging-e2e-sweep.mjs 2>&1
```

### 6. Commit + push

Commit chirurgical : `git add <fichiers touchés>` — jamais `git add -A`.

### 7. Notifier

```bash
./scripts/agents/notify.sh human TASK_DONE "fix /calendrier-chantiers ERR_FAILED : <résumé cause + solution>"
```

## Règles

- Lire le code AVANT d'écrire quoi que ce soit
- Ne toucher QUE les fichiers liés à ce bug
- Commits chirurgicaux, jamais `git add -A`
- Ne pas réinitialiser la branche (`reset --hard`, `push --force` interdits)
