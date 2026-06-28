# Secrets Manager — Bitwarden Secrets Manager (coexistence .env)

## Contexte

Les secrets sensibles (Stripe, Gemini, Resend, OVH S3, DB) étaient lus directement via
`process.env` dans les adapters. Ce document décrit le mécanisme de résolution coexistant
introduit pour permettre la migration vers Bitwarden Secrets Manager sans big-bang.

## Architecture

```
                  ┌────────────────────────────────┐
                  │  server.ts (main)              │
                  │  await hydrateSecrets()         │  ← 1er appel avant tout
                  └────────────┬───────────────────┘
                               │
                  ┌────────────▼───────────────────┐
                  │  shared/config/secrets.ts       │
                  │  - cache mémoire BW (immuable)  │
                  │  - getSecret(key)               │
                  └────────────┬───────────────────┘
              ┌────────────────┼──────────────────────┐
              ▼                ▼                       ▼
     Bitwarden (cache)     process.env           throw si required
     (priorité)            (fallback)            (absent des deux)
```

## Ordre de résolution

1. Cache Bitwarden (hydraté au boot si `BWS_ACCESS_TOKEN` configuré)
2. `process.env[key]` (fallback — toujours actif)
3. `undefined` si absent des deux

## Variables d'auth Bitwarden

| Variable            | Rôle                                                  |
|---------------------|-------------------------------------------------------|
| `BWS_ACCESS_TOKEN`  | Token d'accès service account (machine account)       |
| `BWS_ORGANIZATION_ID` | UUID de l'organisation Bitwarden                   |

Si `BWS_ACCESS_TOKEN` est absent : mode `.env` pur, aucun appel Bitwarden, comportement inchangé.

## Secrets routés via le résolveur

| Secret              | Adapter                                     |
|---------------------|---------------------------------------------|
| `STRIPE_SECRET_KEY` | `stripe-adapter.ts`, `billing-adapter.ts`   |
| `RESEND_API_KEY`    | `resend-email-adapter.ts`                   |
| `EMAIL_FROM`        | `resend-email-adapter.ts`                   |
| `GEMINI_API_KEY`    | `ports/adapters.ts`                         |
| `GEMINI_TEXT_MODEL` | `ports/adapters.ts`                         |
| `APP_DATABASE_URL`  | `db/client.ts`                              |
| `OVH_S3_ACCESS_KEY` | `ovh-s3-adapter.ts`                         |
| `OVH_S3_SECRET_KEY` | `ovh-s3-adapter.ts`                         |
| `OVH_S3_BUCKET`     | `ovh-s3-adapter.ts`                         |
| `OVH_S3_ENDPOINT`   | `ovh-s3-adapter.ts`                         |
| `OVH_S3_PUBLIC_BASE_URL` | `ovh-s3-adapter.ts`                    |
| `DATABASE_URL`      | `server.ts` (pg-boss)                       |

**Hors périmètre BW runtime** : variables `VITE_*` (build-time Cloudflare Pages), variables
d'infrastructure statique (`NODE_ENV`, `HOST`, `PORT`) — gérées côté déploiement.

## Ajouter un secret dans Bitwarden

1. Dans l'interface Bitwarden Secrets Manager, créer un secret avec la **clé exacte** (ex. `STRIPE_SECRET_KEY`)
2. Assigner le secret au projet lié au service account utilisé pour `BWS_ACCESS_TOKEN`
3. Au prochain redémarrage du backend, le secret est chargé depuis BW
4. Retirer la variable du `.env` serveur uniquement après validation en staging

## Plan de migration secret par secret

La migration est **incrémentale et opérationnelle** — aucun secret n'est retiré du `.env` ce tour :

1. Configurer le service account BW (team ops)
2. Ajouter `BWS_ACCESS_TOKEN` et `BWS_ORGANIZATION_ID` dans le `.env` staging
3. Valider que les secrets BW sont bien prioritaires (logs `[secrets] N secret(s) chargé(s)`)
4. Secret par secret : ajouter dans BW → valider → retirer du `.env`
5. En production : même séquence après validation staging complète

## Impact déploiement

- **Backend Docker** : `hydrateSecrets()` est appelé au boot (`server.ts → main()`).
  Durée : ~500ms pour un appel réseau Bitwarden. Fail-closed si BW configuré mais injoignable.
- **Frontend Cloudflare Pages** : non concerné — les `VITE_*` sont build-time, pas runtime.
- **Rollback** : retirer `BWS_ACCESS_TOKEN` du `.env` → mode `.env` pur automatiquement.
