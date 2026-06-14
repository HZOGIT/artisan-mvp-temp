# Audit — Fuite d'informations (erreurs / logs) — RAS bloquant

**Date** : 2026-06-07 · **Projet** : Lancement 30 juin

> Périmètre : divulgation de détails internes via les réponses d'erreur et les
> logs serveur ; exposition de données sensibles. **Aucun BLOCKER/HIGH** → pas
> d'issue. Quelques durcissements MEDIUM documentés.

---

## Ce qui fonctionne correctement (bonnes nouvelles)

- **Aucun secret/mot de passe/token loggué** : le balayage
  `console.log(... password|secret|jwt|token ...)` ne remonte que des logs
  bénins — `'[Stripe] STRIPE_SECRET_KEY: Set/Missing'` (jamais la valeur), des
  **noms** de variables d'env (pas leurs valeurs), « No token_paiement » (sans
  valeur), etc. Pas de fuite de secret en logs. ✓
- **Pas de hash de mot de passe dans les réponses** : `authenticateUser` /
  `createUserWithPassword` retournent uniquement `{ id, email, name }`
  (`auth.ts:65,112`). `auth.me` retourne `{ id, email, name, prenom, role,
  artisanId, actif, permissions }` — pas de `password`. ✓
- Validation `validateSecretsNotExposed` existante (`env.ts`) qui détecte un
  secret dans une réponse client. ✓
- Stacks **non exposées en production** (`NODE_ENV=production` → tRPC strip la
  stack de l'error shape).

---

## 🟡 MEDIUM (documentés, pas d'issue) — détails d'erreur internes renvoyés au client

### 1. `upload-logo` renvoie le message SQL brut
```typescript
// index.ts:263
res.status(500).json({
  error: 'Erreur serveur',
  detail: error?.sqlMessage || error?.message || String(error),  // ← SQL brut
  code: error?.code,
});
```
→ Expose des **détails de schéma DB** (noms de colonnes/contraintes, ex.
`ER_DATA_TOO_LONG for column 'logo'`) au client. Aide à la reconnaissance.
**Fix** : message générique côté client, détail uniquement dans les logs.

### 2. Route webhook renvoie `error.message`
```typescript
// index.ts:152
res.status(500).json({ error: 'Webhook route error', detail: error.message });
```
→ Destinataire = Stripe (serveur), impact faible, mais à généraliser.

### 3. Pas d'`errorFormatter` tRPC
`server/_core/trpc.ts` : `initTRPC...create({ transformer: superjson })` —
**aucun `errorFormatter`**. Les erreurs **inattendues** (ex. erreur SQL levée
dans un handler) voient leur `message` brut renvoyé au client sur **toutes** les
routes tRPC (la stack est strippée en prod, mais pas le message).
**Fix** : ajouter un `errorFormatter` qui, pour les `INTERNAL_SERVER_ERROR`,
remplace le message par un libellé générique (et logue le détail côté serveur).

---

## Conclusion

Pas de fuite de **secrets, mots de passe ou hash** (l'essentiel est correct).
Restent des **divulgations mineures de détails internes d'erreur** (SQL/message)
au client : à durcir (message générique + `errorFormatter` tRPC), mais
**sous le seuil HIGH**. Aucun BLOCKER.
