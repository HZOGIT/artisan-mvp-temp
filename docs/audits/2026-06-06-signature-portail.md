# Audit — Portail client / Signatures électroniques

**Date** : 2026-06-06 · **Projet** : Lancement 30 juin

---

## 🔴 BLOCKER 1 — `smsVerified` accepté sans vérification serveur → 2FA signature contournable

### Problème

`signature.signDevis` accepte `smsVerified: z.boolean().optional()` dans son input
Zod (ligne 2711) mais **ne vérifie jamais en base** que le code SMS a effectivement
été validé. Le handler appelle directement `db.signDevis(...)` sans aucun check SMS.

Un client peut appeler la mutation tRPC avec `smsVerified: true` directement, sans
avoir jamais demandé ni reçu de code SMS, et la signature est acceptée.

### Preuve

- `server/routers.ts:2711` — `smsVerified: z.boolean().optional()` dans l'input.
- `server/routers.ts:2729-2736` — `db.signDevis(token, signatureData, ...)` appelé
  sans aucune référence à `input.smsVerified` ni à `db.getSmsVerificationBySignature()`.
- `server/routers.ts:2678` — `verifySmsCode` marque la vérification en DB, mais
  `signDevis` ne consulte jamais cette table.

### Impact

Signature électronique sans preuve d'identité réelle → valeur légale contestable
(eIDAS / loi française sur la signature électronique). En cas de litige, l'artisan
ne peut pas prouver que c'est bien le client qui a signé.

### Fix

Dans `signDevis`, ajouter avant `db.signDevis()` :

```typescript
// Vérifier que le SMS a bien été validé en base
const smsVerification = await db.getSmsVerificationBySignature(existing.id);
if (!smsVerification?.verified) {
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: "Vérification SMS requise avant signature"
  });
}
```

Supprimer `smsVerified` du schema Zod input (c'est le serveur qui décide, pas le client).

---

## 🔴 BLOCKER 2 — `devCode` retourné en clair si Twilio non configuré

### Problème

`signature.requestSmsCode` retourne le code OTP **en clair** dans la réponse API
quand Twilio n'est pas configuré :

```typescript
// server/routers.ts:2661
devCode: !twilioConfigured ? code : undefined,
```

Twilio est absent de tous les environnements (`.env.local` et `.env.staging` ne
contiennent aucune variable `TWILIO_*`). En production, si les variables Twilio ne
sont pas renseignées au démarrage, n'importe qui possédant un token de signature
peut :
1. Appeler `requestSmsCode` avec n'importe quel numéro de téléphone.
2. Lire le `devCode` dans la réponse JSON.
3. Appeler `verifySmsCode` avec ce code.
4. Puis `signDevis` → signature sans téléphone physique.

### Preuve

- `server/routers.ts:2653-2662` — `isTwilioConfigured()` → false → `devCode = code`.
- Grep `TWILIO` dans `.env.local` et `.env.staging` → 0 résultat.

### Fix

1. **Court terme** : supprimer `devCode` de la réponse **inconditionnellement** :
   ```typescript
   // Retirer la ligne devCode du return
   return { success: true, message: "...", twilioConfigured };
   ```
2. **Moyen terme** : si Twilio non configuré en prod, bloquer la route ou simuler
   via un log serveur uniquement (jamais dans la réponse HTTP).
3. Configurer `TWILIO_*` dans `.env.staging` et `.env` (production) avant lancement.

---

## 🟠 HIGH — URL de signature hardcodée `www.operioz.com`

### Problème

L'email de signature (envoyé au client) contient un lien vers :

```typescript
// server/routers.ts:2514
const signatureUrl = `https://www.operioz.com/devis-public/${token}`;
```

Cette URL est hardcodée, contrairement au portail client qui utilise correctement
`ctx.req.headers.origin`. En dev et staging, les emails de signature renvoient vers
**la production** — le token n'existe pas sur cette instance, le client tombe sur
une page "lien invalide".

### Fix

```typescript
const appUrl = process.env.APP_URL
  || ctx.req.headers.origin
  || 'https://app.operioz.com';
const signatureUrl = `${appUrl}/devis-public/${token}`;
```

---

## Ce qui est bien en place

- **Token opaque solide** : `crypto.randomUUID() × 2` = 64 hex chars (256 bits
  d'entropie) — impossible à bruteforcer.
- **Expiration 30 jours** enforced en DB sur les tokens de signature.
- **Portail client** (`clientPortal.*`) — ownership vérifié (`client.artisanId ===
  artisan.id`), expiry enforced en DB (`gte(expiresAt, now)`).
- **IP + User-Agent** enregistrés à la signature (traçabilité).
- **Notification artisan** (in-app + email) à la signature et au refus.
- **URL portail client** dynamique via `ctx.req.headers.origin` — correct.
- **Refus de devis** : token vérifié, statut `en_attente` requis, IP/UA logués.

---

## Estimation

- BLOCKER 1 (smsVerified server-side) : ~30 min — ajouter le check DB dans
  `signDevis` + retirer le champ du schema input.
- BLOCKER 2 (devCode suppression) : ~5 min — retirer 1 ligne + configurer Twilio.
- HIGH (URL hardcodée) : ~5 min — 1 ligne à changer.
