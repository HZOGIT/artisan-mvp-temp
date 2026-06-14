# Audit — Assistant vocal : routes brutes & exécution d'outils (isolation tenant) — OK

**Date** : 2026-06-08 · **Projet** : Lancement 30 juin

> Périmètre : routes Express brutes de l'assistant — `/api/voice/persist`
> (`index.ts:1212`), `/api/voice/tool` (`:1244`) — et la couche d'exécution
> `executeTool` / `assistantTools.ts`. Objectif : IDOR / fuite cross-tenant via
> l'API d'outils directement appelable.

---

## Conclusion : isolation tenant solide. Pas de BLOCKER/HIGH nouveau.

### `/api/voice/tool` = API directe vers `executeTool({name, args})` — mais scopée serveur

L'endpoint est **authentifié** (`getUserFromRequest` → 401 sinon) et résout
l'artisan **côté serveur** : `executeTool(name, args, { artisanId: artisan.id })`
(`:1258`). Le `artisanId` du contexte vient de la **session**, **jamais des
`args`** du client. Donc, bien que `{name, args}` soit librement contrôlable par
l'appelant, il ne peut pas cibler un autre tenant.

### Chaque outil vérifie l'appartenance (pas d'IDOR)

Revue de `assistantTools.ts` — tous les outils qui prennent un id d'entité
**comparent `entité.artisanId !== ctx.artisanId`** et lèvent une erreur :

- `creer_devis`/`creer_facture`/`creer_client`/`creer_commande` → écrivent sous
  `ctx.artisanId` (jamais un id externe).
- `envoyer_devis` (`:802`), `envoyer_facture` (`:989`), `creer_et_envoyer_*`
  (`:925`,`:1081`), `chercher_client`→`assertClientBelongs` (`:726`),
  `creer_devis`→`assertClientBelongs(args.clientId)` (`:740`),
  `chercher_fournisseur` (`:1282`), `envoyer_commande_fournisseur` (`:1353`),
  `modifier_intervention` (`:1582`) → **tous** gardent `!== ctx.artisanId`.
- Les lectures (`lister_*`, `get_statistiques`, `verifier_stocks`) passent
  `ctx.artisanId` aux helpers `getXByArtisanId`.

### Emails contraints aux clients du tenant

Les outils d'envoi (`envoyer_devis`/`facture`/`relance`, `envoyer_commande_*`)
résolvent le destinataire depuis la **DB du tenant** (client/fournisseur dont
l'`artisanId` est vérifié) — **pas** d'adresse arbitraire en `args` → pas de
vecteur de spam vers des tiers.

### `/api/voice/persist` — scopé

Vérifie `getAiThread(threadId, artisan.id)` avant d'insérer → un thread d'un autre
artisan renvoie 404. Transcripts insérés tels quels (stockage, pas de rendu HTML).

---

## Réserves (déjà tracées — pas de nouvelle issue)

1. **Bypass de permissions (rôle)** : `/api/voice/tool` et `/api/assistant/stream`
   résolvent `getArtisanByUserId` (qui **résout les collaborateurs**) et exécutent
   les outils **sans contrôle de permission** → un `technicien` peut exécuter
   `creer_facture`/`envoyer_facture`/`envoyer_relance`. **Déjà OPE-54** (cite
   explicitement `index.ts:1251` voice/tool).
2. **Hors `subscriptionGuard`** : ces routes brutes ne sont pas derrière le paywall
   (monté sur `/api/trpc` seulement) → un artisan expiré peut continuer à exécuter
   des outils (création de factures, envoi d'emails, burn IA). **Déjà OPE-64**
   (secondaire) + OPE-24 (rate limit `/api/voice/token`).
3. **Pas de rate limit propre sur `/api/voice/tool`** : exécute des écritures
   (factures) et des **envois d'emails** sans throttle (alors que `assistant.chat`
   et `generateDevis` côté tRPC ont `checkRateLimit`). Risque : un compte
   authentifié (ou un collaborateur via la faille OPE-54) script `envoyer_relance`
   en boucle → spam des **clients du tenant** + réputation d'envoi (recoupe OPE-24
   « rate limiting manquant » et OPE-37 délivrabilité). Vecteur essentiellement
   self-targeting (clients du tenant) → conservé en réserve sous OPE-24, pas
   d'issue séparée.

---

## Verdict

La couche d'outils de l'assistant (vocal et stream) est **tenant-safe** :
`artisanId` dérivé de la session, vérification d'appartenance sur **chaque**
entité, destinataires d'emails restreints aux clients du tenant. Les seuls écarts
(permissions de rôle, hors-paywall, rate limit) sont **déjà couverts** par
OPE-54 / OPE-64 / OPE-24. **Pas d'issue Linear créée.**
