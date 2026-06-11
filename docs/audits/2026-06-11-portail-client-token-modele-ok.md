# Audit — Modèle de token d'accès portail client : robuste

**Date** : 2026-06-11 · **Projet** : Lancement 30 juin

> Périmètre : `clientPortal.generateAccess` (`routers.ts:3755`), `getClientPortalAccessByToken`
> / `createClientPortalAccess` (`db.ts:1839-1862`), schéma `client_portal_access`
> (`schema.ts:534`). Le token est l'**ancre de confiance** de toute la surface client-facing
> (PDF, RDV, paiement, modifications, chat).

---

## Conclusion : token crypto-sûr, expiré, rotaté, scopé. Aucun BLOCKER/HIGH.

### ✅ Entropie du token

`generateAccess` (`:3771`) génère `crypto.randomUUID()` — UUID v4 **cryptographiquement
sûr** (~122 bits), **pas** `Math.random`. Stocké en `varchar(64) unique`. **Non énumérable
/ non devinable** (≠ ids séquentiels).

### ✅ Expiration **appliquée**

- Posée à **90 jours** à la création (`:3772-3773`).
- **Enforced** au lookup : `getClientPortalAccessByToken` (`db.ts:1855`) filtre
  `isActive = true` **ET** `gte(expiresAt, new Date())` → un token expiré ne résout rien.

### ✅ Rotation / révocation

`createClientPortalAccess` (`db.ts:1842`) **désactive** tout accès actif préexistant pour le
même `(clientId, artisanId)` avant d'insérer le nouveau → régénérer un lien **invalide
l'ancien** (`isActive=false`). Révocation possible via ce flag.

### ✅ Cloisonnement

- `generateAccess` (`protectedProcedure`) : `client.artisanId !== artisan.id` → `FORBIDDEN`
  (un artisan ne génère un accès que pour **ses** clients).
- Le token mappe `(clientId, artisanId)` ; tous les endpoints portail auditifés (PDF, RDV,
  paiement, modifications) scopent par `access.clientId` / `access.artisanId` → pas de fuite
  cross-client.

### ✅ URL non poisonable

`portalUrl` = `process.env.APP_URL || ctx.req.headers.origin || 'https://www.operioz.com'`
(`:3783`) — **APP_URL prioritaire** sur le header `origin`. Contrairement au flow reset
(OPE-76, qui mettait `origin` en premier), le lien portail n'est **pas** poisonable par un
header client (si `APP_URL` est configuré).

### 🟢 Observations LOW (sous le seuil, pas d'issue)

1. **Expiration longue (90 j)** : un lien fuité (referrer, historique, transfert d'email)
   reste valide 3 mois. Atténué par la **révocabilité** (`isActive`) et la rotation. Décision
   produit/risque — pas un blocker. Reco éventuelle : durée plus courte + renouvellement.
2. **Pas d'idle-timeout** : `lastAccessAt` est tracké mais **non utilisé** pour expirer une
   session inactive. Mineur.
3. **Interpolations email non échappées** : `${artisanName}` / `${clientName}` dans le body
   (`:3800/3803`) — données DB (branding artisan + nom client), pas un input tiers brut →
   risque faible (même classe que le sweep email `safeHtml`).
4. **Table `client_portal_sessions` morte** (`schema.ts:552`) : définie mais **référencée
   nulle part** dans `server/` → schéma mort (cleanup, pas un risque). Cf. autres tables
   mortes déjà notées (stockage base64).

---

## Verdict

Le modèle de token portail est **solide** : `crypto.randomUUID()` (non devinable),
**expiration 90 j appliquée**, **rotation/révocation** via `isActive`, génération **scopée**
au client de l'artisan, URL bâtie sur **`APP_URL`** (non poisonable). L'auth portail repose
**uniquement** sur ce modèle (`client_portal_sessions` est mort). **Pas de BLOCKER/HIGH ;
pas de nouvelle issue Linear.** Réserves **LOW** (durée 90 j, pas d'idle-timeout, échappement
email, table morte).
