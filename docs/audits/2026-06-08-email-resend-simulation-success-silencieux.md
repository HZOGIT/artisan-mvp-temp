# Audit — Emails : simulation silencieuse renvoyant `success:true` si Resend non configuré

**Date** : 2026-06-08 · **Projet** : Lancement 30 juin

> Périmètre : `sendEmail` (`server/_core/emailService.ts`) + déclaration env
> `RESEND_API_KEY` (`env.ts`). Distinct des issues de **contenu** email
> (OPE-12/36/59 injection, OPE-51 modèles, OPE-29 dup, OPE-37 spam).

---

## Ce qui fonctionne correctement

- Provider **Resend** (SPF/DKIM/DMARC gérés après vérification du domaine).
- `from: EMAIL_FROM || "Operioz <noreply@operioz.com>"` (domaine propre, pas un
  gmail générique), `replyTo: support@operioz.com`. Bonne base de délivrabilité.
- `RESEND_API_KEY` / `EMAIL_FROM` sont **présents** dans `.env.local` et
  `.env.staging`.

---

## 🟠 HIGH — Si `RESEND_API_KEY` est absent, **tous** les emails sont silencieusement abandonnés en renvoyant `success:true`

### Problème

`RESEND_API_KEY` est **optionnel** au démarrage :

```typescript
// env.ts:37
RESEND_API_KEY: z.string().optional(),
```

et `sendEmail` bascule en **simulation qui retourne un succès** quand Resend n'est
pas configuré :

```typescript
// emailService.ts:36-40
if (!resend) {
  console.log(`[Email][SIM] → ${to} | ${subject}`);
  return { success: true, message: `Email simulé avec succès à ${to}` };   // ← FAUX SUCCÈS
}
```

→ Si un environnement (notamment **production**) démarre **sans**
`RESEND_API_KEY` (possible puisque la variable est `optional()`, l'app boote
normalement avec un simple `console.warn` au démarrage, vite noyé dans les logs),
**aucun email n'est envoyé** mais chaque appel renvoie `success: true`.

### Impact (catastrophique et invisible)

Tous les flux email échouent **silencieusement**, l'UI affichant « envoyé » :

- **Mot de passe oublié** (OPE-8) : l'utilisateur voit « email envoyé », ne reçoit
  rien → **verrouillé dehors**.
- **Factures / devis envoyés au client** : l'artisan croit avoir envoyé sa facture,
  le client ne reçoit rien → impayés, litiges.
- **Liens de signature**, **confirmations RDV**, **invitations collaborateur**,
  **emails fin d'essai J-3/J-1** (revenu) → perdus, sans alerte.

Aucune observabilité : `success:true` masque la panne pour les appelants **et** les
logs (un seul `warn` au boot).

### Fix proposé

1. **Échec bruyant en prod** : dans `sendEmail`, si `!resend` **et**
   `NODE_ENV === 'production'` → `return { success: false, message: 'Service
   email non configuré' }` (et/ou `throw`). Réserver la simulation `success:true`
   au dev/test (`NODE_ENV !== 'production'`).
2. **Garde au démarrage** : rendre `RESEND_API_KEY` **requis en production** dans
   `env.ts` (Zod `superRefine` : si `NODE_ENV==='production'` et clé absente →
   erreur de boot) → l'app **refuse de démarrer** sans email plutôt que de simuler.
3. (Souhaitable) Les flux critiques (reset, envoi facture) **vérifient
   `result.success`** et remontent l'échec à l'utilisateur.

### Estimation

~0,5 j — garde prod dans `sendEmail` + `superRefine` env + remontée d'erreur sur
reset/envoi facture + test (clé absente en prod → 500 explicite, pas faux succès).

---

## Estimation totale

- HIGH (faux succès email / clé optionnelle → panne silencieuse) : ~0,5 j
