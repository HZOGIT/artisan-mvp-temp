# Fix — Reload loops `/` et `/utilisateurs`

## Contexte

Le sweep e2e staging (`scripts/staging-e2e-sweep.mjs`) remonte deux issues "loop" :

```
[/] 1 issue(s):
  - loop: 5 navigations (reload loop suspecté)

[/utilisateurs] 1 issue(s):
  - loop: 4 navigations (reload loop suspecté)
```

Le sweep détecte un "loop" quand il compte trop de navigations sur une même route
après `goto`. Certaines sont de vrais bugs (page qui se recharge en boucle) ;
d'autres sont des faux positifs (redirects légitimes : landing → dashboard,
page admin → dashboard si non-autorisé).

## Ce que tu dois faire

### 1. Comprendre le mécanisme de détection du sweep

Lis le code de détection dans `scripts/staging-e2e-sweep.mjs` (cherche `navCount`,
`loop`, `framenavigated`). Comprends le seuil et ce qui incrémente le compteur.

### 2. Reproduire manuellement via Playwright

Crée `/tmp/debug-loops.mjs` pour tracer toutes les navigations sur `/` et `/utilisateurs` :

```js
import { chromium } from 'playwright';
const BACKEND = 'https://staging-backend.operioz.com';
const BASE = 'https://staging.operioz.com';
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await browser.newContext({ baseURL: BASE, ignoreHTTPSErrors: true });
const signin = await ctx.request.post(`${BACKEND}/api/trpc/auth.signin?batch=1`, {
  headers: { 'content-type': 'application/json' },
  data: { '0': { json: { email: 'dev@operioz.com', password: 'Azerqsdf1234!' } } },
});
if (!signin.ok()) { console.error('login failed', signin.status()); process.exit(1); }

for (const route of ['/', '/utilisateurs']) {
  console.log(`\n=== ${route} ===`);
  const page = await ctx.newPage();
  let count = 0;
  page.on('framenavigated', f => {
    if (f === page.mainFrame()) console.log(`  nav #${++count}: ${f.url()}`);
  });
  await page.goto(route, { waitUntil: 'networkidle', timeout: 20000 }).catch(e => console.log('goto err:', e.message));
  await page.waitForTimeout(2000);
  await page.close();
}
await browser.close();
```

```bash
./scripts/pw-run.sh /tmp/debug-loops.mjs
```

### 3. Classifier : vrai bug vs faux positif

**Cas A — Faux positif (redirects légitimes)** :
- `/` → redirige landing → `/dashboard` (normal si authentifié) : 2 navigations max
- `/utilisateurs` → redirige vers `/dashboard` si l'utilisateur n'a pas la permission
  `utilisateurs.gerer` (comportement attendu pour `dev@operioz.com`)
→ Solution : ajuster le seuil du sweep ou filtrer explicitement ces routes

**Cas B — Vrai reload loop** :
- La page revient sur elle-même plusieurs fois (même URL répétée dans les navs)
→ Solution : diagnostiquer la cause (guard auth, service worker, route guard) et corriger

### 4. Corriger selon le cas

**Si faux positif** : mettre à jour `scripts/staging-e2e-sweep.mjs` pour exclure
ces routes de la détection loop (ou augmenter le seuil uniquement pour elles) avec
un commentaire expliquant pourquoi.

**Si vrai bug** : corriger dans `src/` (route guard, auth redirect, SW), `pnpm check`,
commit chirurgical, `./scripts/deploy-backend.sh` si changement backend.

### 5. Valider

```bash
E2E_PASS='Azerqsdf1234!' ./scripts/pw-run.sh scripts/staging-e2e-sweep.mjs 2>&1
```

Le résultat attendu : `issues: 0` (ou seulement des issues légitimes documentées).

### 6. Commit + push

Commit chirurgical sur `staging`. Ne jamais `git add -A`.

### 7. Notifier

```bash
./scripts/agents/notify.sh human TASK_DONE "fix sweep reload loops / + /utilisateurs : <résumé>"
```

## Règles

- Lire le code AVANT d'écrire quoi que ce soit
- Ne toucher QUE les fichiers liés à ces issues
- Commits chirurgicaux, jamais `git add -A`
- Pas de `reset --hard`, `push --force`, `rebase` sur staging
