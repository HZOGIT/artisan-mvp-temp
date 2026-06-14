# Audit — Onboarding & activation des modules — OK (paywall plan → OPE-43)

**Date** : 2026-06-08 · **Projet** : Lancement 30 juin

> Périmètre : `modulesRouter` (`routers.ts:7707`) — `list`, `getMine`,
> `getOnboardingStatus`, `toggle`, `completeOnboarding`, `skipOnboarding`.

---

## Conclusion : routeur scopé. Pas de BLOCKER/HIGH nouveau.

### Isolation

Toutes les routes résolvent `getArtisanByUserId(ctx.user.id)` et agissent sur
`artisan.id` (`setArtisanModule`, `updateArtisanOnboarding`,
`getArtisanModulesActifs`…). **Pas d'IDOR.**

### Gating modules cohérent côté code

`toggle` refuse l'activation d'un module dont `plan_minimum > planArtisan`
(`isPlanInsuffisant`, `:7752`) ; `completeOnboarding` ne pré-active que les modules
compatibles avec le plan. La logique de gating est correcte **en soi**.

---

## Confirmation d'OPE-43 (paywall modules contournable) — vu côté onboarding

`completeOnboarding` (`:7762`) écrit le **plan directement depuis l'input client** :

```typescript
// routers.ts:7773-7777
await db.updateArtisanOnboarding(artisan.id, {
  onboardingCompleted: true,
  metier: input.metier,
  plan: input.plan,          // ← plan auto-déclaré par le client, jamais réconcilié avec l'abonnement payé
});
```

Comme tout le gating (`toggle`, `list.locked`) lit `getArtisanOnboardingStatus().plan`
(= `artisans.plan`), un client qui appelle `completeOnboarding({ plan: 'entreprise' })`
**débloque tous les modules gratuitement**. C'est exactement la **racine d'OPE-43**
— confirmée ici depuis le flux onboarding. Aggravations mineures à folder dans OPE-43 :

- **`plan` est `z.string().optional()`** (`:7766`) — **non contraint** à l'enum
  `essentiel|pro|entreprise`. Une valeur inconnue retombe au niveau `essentiel`
  via `PLAN_ORDER[plan] ?? 0`, donc l'abus utile reste `plan: 'entreprise'`, mais
  l'input devrait être un `z.enum`.
- **`completeOnboarding` est rejouable** sans garde : un artisan peut ré-appeler la
  mutation à tout moment pour **rehausser son plan** auto-déclaré.

→ Le fix d'OPE-43 (dériver le plan de l'abonnement Stripe payé, ne jamais faire
confiance à `input.plan`) couvre ces deux points.

---

## Verdict

Onboarding/modules **scopé et cohérent** ; la seule faille (plan auto-déclaré →
paywall modules contournable) est **OPE-43**, confirmée côté onboarding avec deux
précisions (input `plan` non typé + mutation rejouable). **Pas de nouvelle issue.**
