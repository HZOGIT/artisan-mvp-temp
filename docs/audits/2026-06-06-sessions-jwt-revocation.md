# Audit — Sessions / JWT / révocation

**Date** : 2026-06-06 · **Projet** : Lancement 30 juin

> Périmètre : cycle de vie des sessions (`auth-simple.ts`, `subscriptionGuard.ts`),
> révocation des tokens, limites appareils/sessions du plan.

---

## Ce qui fonctionne correctement

- JWT signé HS256, `JWT_SECRET` requis (min 32), expiration **7 j**.
- Cookie : `httpOnly`, `secure` en production, `sameSite: lax`, `path: /`. ✓
- `getUserFromRequest` rejette les comptes **`actif === false`** → la
  **suppression de compte** (`deleteAccount` met `actif=false`) coupe bien
  l'accès immédiatement. ✓
- La limite d'**appareils** (`device_limit_reached`, 403) est bien appliquée
  avant l'enregistrement d'un nouveau fingerprint (`subscriptionGuard.ts:136`).

---

## 🟠 HIGH — Aucune révocation de session sur reset / changement de mot de passe (ni au logout côté serveur)

### Problème

L'authentification est un **JWT stateless de 7 jours** sans `jti` ni version, et
`getUserFromRequest` (`auth-simple.ts:77`) ne valide le token **que** par
signature + expiration — il ne consulte **jamais** la table `active_sessions`
(grep `active_sessions` dans le chemin d'auth → absent). Il n'existe pas de
colonne `passwordChangedAt` / `tokenVersion` sur `users`.

Conséquences, aucune des opérations suivantes n'invalide les JWT déjà émis :

- **`resetPassword`** (`routers.ts:9123`) — ne met à jour que le hash :
  ```typescript
  await db.updateUser(user.id, { password: hashed, resetToken: null, resetTokenExpiry: null });
  // ← aucune invalidation des sessions existantes
  ```
- **`updatePassword`** (`routers.ts:9032`) — idem, change le hash seulement.
- **`logout`** (`routers.ts:9014`) — `clearAuthCookie` efface le cookie **côté
  client** uniquement ; le JWT capturé reste valide jusqu'à 7 j.

### Impact

Scénario classique : le compte d'un artisan est compromis (cookie volé,
session sur un poste public). L'artisan « sécurise » en **réinitialisant son mot
de passe** (flow OPE-8) — mais **la session de l'attaquant reste active jusqu'à
7 jours**. Le contrôle de sécurité le plus attendu (reset = couper les accès)
n'a aucun effet. Vaut aussi pour le logout depuis un poste partagé.

### Fix proposé (sans store de session, via `iat`)

Le JWT (jose) contient déjà `iat`. Ajouter `passwordChangedAt` sur `users`, le
positionner à `now()` dans `resetPassword` / `updatePassword`, et rejeter dans
`getUserFromRequest` tout token dont `iat < passwordChangedAt` :

```typescript
// migration : ALTER TABLE users ADD passwordChangedAt TIMESTAMP NULL;
// resetPassword / updatePassword :
await db.updateUser(user.id, { password: hashed, passwordChangedAt: new Date() });

// auth-simple.ts getUserFromRequest, après jwtVerify (payload.iat en secondes) :
if (user.passwordChangedAt &&
    payload.iat && payload.iat * 1000 < new Date(user.passwordChangedAt).getTime()) {
  return null; // token émis avant le dernier changement de mot de passe
}
```

Pour un vrai « logout partout » : exposer aussi un bouton qui bump
`passwordChangedAt` (ou un `tokenVersion`) sans changer le mot de passe.

### Estimation

~2 h — migration + set sur reset/change + check `iat` + test.

---

## Points secondaires (sévérité < HIGH — documentés, pas d'issue séparée)

### a) La limite « sessions simultanées » du plan est cosmétique

`subscriptionGuard.ts:160-173` compte les `active_sessions`, évince la plus
ancienne (`deleteOldestSession`) puis crée la nouvelle. Mais `deleteOldestSession`
(`db.ts`) **supprime juste une ligne DB** — comme l'auth ne valide pas le token
contre `active_sessions`, **la session évincée continue de fonctionner**. La
limite « X sessions simultanées » (différenciateur Pro=3 / Entreprise=4) ne
restreint donc pas réellement l'usage concurrent ni le partage de compte.
→ Se résout « gratuitement » si le fix HIGH ci-dessus est étendu pour valider le
token contre `active_sessions` (révocation réelle).

### b) Fingerprint appareil basé uniquement sur le User-Agent

`generateFingerprint(ua)` (`subscriptionGuard.ts:127`) ne dérive le fingerprint
que du User-Agent → deux appareils physiques avec le même navigateur/OS comptent
pour **un seul** device, et un attaquant qui fait varier l'UA contourne la limite.
Limite « appareils » donc approximative (mais non bloquante).

### c) Token stocké en clair (tronqué) dans `active_sessions`

`createSession` stocke `token: String(cookieToken).slice(0, 200)` — un préfixe du
JWT en clair. Préférer un hash SHA-256 du token (cohérent avec le pattern
`resetToken` déjà en place).

---

## Estimation totale

- HIGH (révocation sessions sur reset/change/logout) : ~2 h
  (le fix résout aussi le point secondaire (a) si étendu à la validation contre `active_sessions`)
