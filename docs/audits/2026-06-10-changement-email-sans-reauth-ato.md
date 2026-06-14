# Audit — Changement d'email sans ré-authentification → prise de compte permanente

**Date** : 2026-06-10 · **Projet** : Lancement 30 juin · **Sévérité : 🟠 HIGH**

> Périmètre : `auth.updateEmail` (`routers.ts:9029-9038`) vs `auth.updatePassword`
> (`:9041-9063`), enchaînement avec `forgotPassword`.

---

## 🟠 HIGH — `updateEmail` ne demande PAS le mot de passe actuel → chaîne d'ATO

### Asymétrie de protection

```typescript
// updatePassword (:9047) — EXIGE l'ancien mot de passe (ré-auth) ✅
const ok = await verifyPassword(input.currentPassword, user.password);
if (!ok) throw new TRPCError({ code: 'UNAUTHORIZED', ... });

// updateEmail (:9029) — AUCUNE ré-auth ❌
.input(z.object({ newEmail: z.string().email() }))   // pas de currentPassword
...
await db.updateUser(ctx.user.id, { email: input.newEmail });
```

`updatePassword` protège le changement de mot de passe par ré-authentification, **mais
`updateEmail` ne protège rien** : une session authentifiée suffit à changer l'email.

### La chaîne de prise de compte (ATO) + verrouillage du propriétaire

Précondition : **une session compromise** (XSS *in-session* — la **CSP est désactivée** et
des vecteurs XSS sont filés ; ou appareil partagé/laissé ouvert).

1. `updateEmail({ newEmail: "attaquant@evil.com" })` → email du compte **changé**, **sans
   ré-auth**.
2. `forgotPassword("attaquant@evil.com")` → le lien de reset part chez **l'attaquant**.
3. L'attaquant choisit un nouveau mot de passe → **contrôle permanent** du compte, et le
   propriétaire est **verrouillé dehors** (son email ne matche plus).

→ Une compromission **temporaire** de session devient une **prise de compte permanente** +
**lockout**. Le contrôle de ré-auth de `updatePassword` est ainsi **contourné** (on n'a
jamais eu besoin de l'ancien mot de passe).

### Aggravants

- **Pas de vérification du nouvel email** (aucun lien de confirmation) → l'email est
  basculé immédiatement vers une adresse non prouvée.
- **Pas de notification** à l'ancienne adresse (« votre email a été modifié ») → le
  propriétaire ne peut pas réagir.
- Compte = données financières + PII clients + IBAN → impact élevé.

---

## Distinction (anti-doublon)

- **OPE-76** (reset poisoning via header Origin) = falsifier le **lien** de reset. Ici, le
  flow de reset est **légitime** ; c'est `updateEmail` **sans ré-auth** qui amorce l'ATO.
- **OPE-32** (sessions JWT non révocables) = les tokens existants ne sont pas invalidés
  après reset. Complémentaire, mais ne traite pas l'**absence de ré-auth sur le changement
  d'email**.
- Aucune issue ne couvre `updateEmail` sans ré-authentification. → **Pas de doublon.**

---

## Fix proposé

1. **Exiger `currentPassword`** sur `updateEmail` (miroir d'`updatePassword`) :
   `verifyPassword(input.currentPassword, user.password)` avant tout changement.
2. **Vérifier le nouvel email** : envoyer un lien de confirmation à `newEmail` et ne
   basculer qu'après clic (token hashé + expiry, comme le reset).
3. **Notifier l'ancienne adresse** du changement (avec lien de révocation).
4. (Lié) Invalider les sessions après changement d'email (cf. OPE-32).

---

## Verdict

`auth.updateEmail` change l'email d'un compte **sans ré-authentification ni vérification**,
ce qui transforme une session compromise en **prise de compte permanente + verrouillage du
propriétaire** et **contourne** la ré-auth de `updatePassword`. Distinct d'OPE-76/OPE-32.
**🟠 HIGH → issue Linear créée.**
