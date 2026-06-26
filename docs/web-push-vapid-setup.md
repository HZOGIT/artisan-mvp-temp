# Web Push (VAPID) — procédure de mise en place (staging & prod)

Les notifications push web (devis/facture créés, etc.) reposent sur le protocole **VAPID**.
Adapter backend : `apps/api/shared/push/web-push-adapter.ts` (lib `web-push`).
Hook front : `apps/web/src/shell/application/use-push-subscription.ts`.
Service worker : `apps/web/public/sw.js` (handler `push` → `showNotification`).

## TL;DR — ce qu'il faut configurer

| Côté | Variable | Secret ? | Où |
|---|---|---|---|
| **Backend** | `VAPID_PUBLIC_KEY` | non | env runtime du backend |
| **Backend** | `VAPID_PRIVATE_KEY` | **oui** | env runtime du backend |
| **Backend** | `VAPID_SUBJECT` *(optionnel)* | non | défaut `mailto:support@operioz.com` |
| **Frontend / Cloudflare Pages (wrangler)** | — | — | **RIEN** (voir §Wrangler) |

> ⚠️ La paire VAPID se génère **une fois par environnement** (staging ≠ prod) et ne change plus.
> La clé **privée** est un secret : jamais committée, jamais dans `.env.production`, jamais collée dans un chat/log.

## Wrangler / Cloudflare Pages : aucune étape VAPID

Contrairement à `VITE_STRIPE_PUBLISHABLE_KEY` / `VITE_SENTRY_DSN` / `VITE_BACKEND_URL` (qui, eux,
se posent en secrets CF Pages via `wrangler pages secret put …`), **VAPID n'a aucune variable front**.

Le front récupère la clé publique **au runtime depuis le backend** via
`trpc.notifications.getVapidPublicKey` (`getVapidPublicKey: publicProcedure.query(() => ({ key: push?.getPublicKey() }))`).
→ Source unique de vérité = l'env backend. **Ne pas créer de `VITE_VAPID_PUBLIC_KEY`** : ce serait
de la config morte (rien ne la lit).

## 1. Générer la paire (sans l'afficher)

`web-push` est déjà une dépendance. Génère et écris **directement** dans le fichier d'env du backend,
sans imprimer les valeurs :

```bash
node -e '
const w = require("web-push"), fs = require("fs");
const k = w.generateVAPIDKeys();
fs.appendFileSync("<FICHIER_ENV_BACKEND>", `\nVAPID_PUBLIC_KEY=${k.publicKey}\nVAPID_PRIVATE_KEY=${k.privateKey}\nVAPID_SUBJECT=mailto:support@operioz.com\n`);
console.log("VAPID écrit — public len:", k.publicKey.length, "| private len:", k.privateKey.length);
'
```

Longueurs attendues : **public ≈ 87**, **private ≈ 43** (base64url). Alternative interactive (affiche les
clés) : `npx web-push generate-vapid-keys`.

## 2. Poser les variables — par environnement

- **Staging** : `<FICHIER_ENV_BACKEND>` = **`.env.staging`** (racine repo, gitignoré).
  Injecté dans le conteneur par `infra/docker-compose.yml` (les slots `new-stack-blue|green` ont
  `env_file: ../.env.staging`).
- **Prod** : même principe — poser `VAPID_*` dans l'**env runtime du backend prod** (fichier `.env` du
  serveur prod ou variables d'env Docker du service). **Jamais** dans `.env.production` committé.

## 3. Redéployer le backend

`setVapidDetails` s'exécute au **chargement du module** → il faut recréer le conteneur pour charger l'env.

```bash
# staging
./scripts/deploy-backend.sh
# prod : équivalent de rebuild/recréation du conteneur backend prod
```

Tant que `VAPID_PUBLIC_KEY` **et** `VAPID_PRIVATE_KEY` sont absentes, l'adapter est un **no-op silencieux**
(aucun push envoyé, aucune erreur).

## 4. Vérifier

```bash
# Doit renvoyer "key":"B…" (et non "key":null)
curl -s 'https://<BACKEND_PUBLIC>/api/trpc/notifications.getVapidPublicKey' | grep -oE '"key":("[^"]*"|null)'
```
(staging : `https://staging-backend.operioz.com`)

## 5. Tester de bout en bout (navigateur)

1. **Chrome / Edge** (éviter Brave : push FCM désactivé par défaut ; Safari : quirks). Aller sur le front, se connecter.
2. **Autoriser les notifications** pour le domaine (prompt, ou Réglages du site → Notifications).
3. DevTools → *Application* : `sw.js` **activated** ; *Network* : la mutation `notifications.subscribe` → **200**.
4. **Déclencher un push** — actions qui appellent `push.sendToUser(...)` :
   - **Créer un devis** → « Operioz — Nouveau devis \<n°\> créé »
   - **Créer une facture** → « Operioz — Nouvelle facture créée (brouillon) »
5. La **notification OS** apparaît. 🎉

> Pas de route de test push dédiée : le déclencheur réel est la création devis/facture.

## Diagnostic si rien ne s'affiche

- `getVapidPublicKey` renvoie `null` → clés absentes/mal nommées dans l'env backend, ou backend pas redéployé.
- Permission ≠ « granted », ou `sw.js` pas `activated`, ou `notifications.subscribe` non parti → DevTools → Application/Network.
- Navigateur Brave → activer « Use Google services for push messaging », ou tester sous Chrome/Edge.
