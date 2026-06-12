# Fix (MODE A) — `support.contact` : aucun rate-limit → flood possible de support@operioz.com

**Date** : 2026-06-12 · **Projet** : Lancement 30 juin · **Sévérité : 🟢 LOW** (anti-abus, authentifié)

> `supportRouter.contact` (`server/routers.ts:8938`). Classe « rate-limit manquant »
> (même famille qu'OPE-24 / `submitContact` / SMS).

---

## Constat

`support.contact` (authentifié) envoie un email à `support@operioz.com` (`:8965`) **à chaque
appel**, **sans aucune limite de fréquence**. Les autres envois d'emails déclenchés par
formulaire sont throttlés (vitrine `submitContact` → `checkPublicContactRate`, SMS →
`checkSmsSendRate`, portail → `checkPortalActionRate`), **pas** celui-ci.

→ Un compte authentifié (ou un script avec un cookie valide) peut **inonder** la boîte support
et **gonfler les coûts Resend** en boucle. Borné à un compte (authentifié) donc severity faible,
mais c'est le même pattern que les autres anti-flood déjà en place.

L'input est par ailleurs **correctement borné** (`nom` max 120, `message` max 5000) et les
champs user sont **échappés** (`safeHtml` nom/email, échappement `<>` du message) — donc rien à
ajouter côté injection ; il manquait **uniquement** le throttle.

## Fix appliqué (`server/routers.ts`)

- Nouveau helper `checkSupportContactRate(key)` (in-memory, **5 envois / 15 min par user**),
  calqué sur `checkPublicContactRate`.
- `support.contact` rejette en **`TOO_MANY_REQUESTS`** au-delà, clé = `ctx.user.id`.
- **Behavior-preserving** : un usage légitime (1-2 demandes) passe à l'identique ; seul l'abus
  répété depuis un même compte est borné. Faible blast radius (un endpoint), pas de décision
  produit.

## Vérif & déploiement

`pnpm build:server` (esbuild) ✅. Fix **serveur** → `task staging:deploy`. Santé staging **200**.

## Linear / anti-doublon

Classe « rate-limit manquant » → **rattachée à OPE-24** (vecteurs DoS/abus). **Pas d'issue
Linear** ; documenté ici.
