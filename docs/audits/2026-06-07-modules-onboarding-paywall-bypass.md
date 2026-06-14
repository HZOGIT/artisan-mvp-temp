# Audit — Modules / onboarding : gating par plan

**Date** : 2026-06-07 · **Projet** : Lancement 30 juin

> Périmètre : `modulesRouter` (`routers.ts:7707`) — activation des modules
> premium et gating par plan (`isPlanInsuffisant`). Distinct d'OPE-6 (Stripe
> Connect) et OPE-11 (price IDs).

---

## Ce qui fonctionne correctement

- **`toggle`** (`routers.ts:7743`) applique bien `isPlanInsuffisant(module.
  plan_minimum, plan)` **côté serveur** → FORBIDDEN si le plan est insuffisant.
  Le paywall n'est donc pas qu'une affaire d'UI sur ce point précis. ✓
- Scope artisan correct (`getArtisanByUserId(ctx.user.id)`). ✓

---

## 🟠 HIGH — Paywall contournable : le plan qui débride les modules est auto-déclaré par le client (jamais réconcilié avec l'abonnement payé)

### Problème

Le gating des modules repose sur `getArtisanOnboardingStatus(artisanId).plan`,
qui lit la colonne **`artisans.plan`** :

```typescript
// db.ts getArtisanOnboardingStatus
'SELECT onboarding_completed, metier, plan FROM artisans WHERE id = ? LIMIT 1'
```

Or cette colonne est écrite **directement depuis l'input client** dans
`completeOnboarding` (`routers.ts:7762`) :

```typescript
// routers.ts:7770-7784
.mutation(async ({ ctx, input }) => {                 // input.plan = client
  await db.updateArtisanOnboarding(artisan.id, {
    onboardingCompleted: true, metier: input.metier,
    plan: input.plan,                                  // ← plan auto-déclaré, persisté
  });
  if (input.moduleSlugs) {
    const planArtisan = input.plan || "essentiel";
    for (const m of all) {
      if (isPlanInsuffisant(m.plan_minimum, planArtisan)) continue;
      await db.setArtisanModule(artisan.id, m.slug, input.moduleSlugs.includes(m.slug));
    }
  }
})
```

`updateArtisanOnboarding` fait un `UPDATE artisans SET plan = ?` avec cette valeur.
**Ce plan n'est jamais comparé au plan réellement payé** (`subscriptions.plan`,
géré par le webhook Stripe) : `grep getSubscription` en contexte module/onboarding
→ **0 résultat**. Le plan « de gating » et le plan « facturé » sont deux champs
indépendants, le premier étant contrôlé par le client.

### Exploitation

1. Appeler `completeOnboarding({ plan: "entreprise", moduleSlugs: [<tous les
   modules>] })` → `artisans.plan = 'entreprise'` + **tous les modules
   Entreprise activés**.
2. Tous les `toggle` ultérieurs lisent `status.plan = 'entreprise'` → activation
   de n'importe quel module autorisée.
3. L'abonnement Stripe réel (`subscriptions.plan`) reste **trial / essentiel** →
   l'utilisateur **accède aux fonctionnalités Entreprise en payant moins (ou
   rien)**.

`completeOnboarding` n'est pas verrouillé « une seule fois » → le plan peut être
ré-affirmé à volonté.

### Impact

**Contournement du paywall / fuite de revenu** : la segmentation Essentiel / Pro /
Entreprise (raison d'être de `plan_minimum` + `isPlanInsuffisant`) est
contournable par auto-déclaration. Les fonctionnalités premium (comptabilité,
géolocalisation, multi-utilisateurs, etc. selon `plan_minimum`) deviennent
gratuites.

### Fix proposé

Dériver le plan de gating de **l'abonnement réel**, pas de l'input :

```typescript
const sub = await db.getSubscription(artisan.id);
const planArtisan = sub?.plan || 'trial';        // source de vérité = Stripe
// utiliser planArtisan pour isPlanInsuffisant, ignorer input.plan pour le gating
```

- `completeOnboarding` : ne plus persister `input.plan` comme plan de gating (au
  mieux le garder comme simple préférence d'onboarding) ; activer/débrider les
  modules selon `subscriptions.plan`.
- `getArtisanOnboardingStatus` (ou le gating) doit lire le plan depuis
  `subscriptions`, ou synchroniser `artisans.plan` uniquement depuis le webhook
  Stripe (jamais depuis le client).

### Estimation

~2 h — basculer le gating sur `subscriptions.plan` + retirer la confiance à
`input.plan` + test (essentiel ne peut pas activer un module entreprise via
onboarding).

---

## Estimation totale

- HIGH (paywall modules contournable via plan auto-déclaré) : ~2 h
