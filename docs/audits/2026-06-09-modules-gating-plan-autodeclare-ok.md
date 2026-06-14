# Audit — Modules : gating par plan (toggle / completeOnboarding) — OK

**Date** : 2026-06-09 · **Projet** : Lancement 30 juin

> Périmètre : `modulesRouter` (`routers.ts:7716-7808`) — `list`, `getMine`,
> `getOnboardingStatus`, `toggle`, `completeOnboarding`, `skipOnboarding` ; source du
> `plan` de gating (`getArtisanOnboardingStatus` / `updateArtisanOnboarding`, `db.ts`) ;
> réconciliation webhook (`stripe/webhookHandler.ts`).

---

## Conclusion : module scopé tenant. Le contournement de gating est **déjà filé** (pas de doublon).

### Isolation multi-tenant correcte (aucun IDOR)

Toutes les procédures résolvent `getArtisanByUserId(ctx.user.id)` puis écrivent via
`setArtisanModule(artisan.id, …)` / `updateArtisanOnboarding(artisan.id, …)` — **scope
propre**, aucun `artisanId` d'entrée. Pas de fuite ni d'activation cross-tenant.

### 🔎 Mécanisme du contournement de paywall modules (confirmé, déjà filé)

Le gating compare `module.plan_minimum` au **`plan` du tenant** via `isPlanInsuffisant` :

- `toggle` (`:7759-7766`) lit `plan = status.plan` = `getArtisanOnboardingStatus()` →
  colonne **`artisans.plan`**.
- `completeOnboarding` (`:7785-7793`) **écrit** `artisans.plan = input.plan`
  (**client-supplied**, `z.string().optional()`) **et** active les modules sur la base de
  ce même `input.plan`.

**Deux sources « plan » déconnectées :**

| Source | Écrit par | Utilisé par |
| -- | -- | -- |
| `subscriptions.plan` / `.status` | **webhook Stripe** (réel, payé) | `subscriptionGuard` (402 si expiré) |
| `artisans.plan` | **`completeOnboarding(input.plan)`** (auto-déclaré) | **gating des modules** |

→ `grep onboarding|setArtisanModule|artisans.plan` sur `webhookHandler.ts` = **0** : le
webhook **ne réconcilie jamais** `artisans.plan` avec l'abonnement payé. Un tenant envoie
`completeOnboarding({ plan: "entreprise", moduleSlugs: [...modules premium] })` → unlock
de modules de tier supérieur **sans payer entreprise**. `toggle` hérite du même `plan`
empoisonné (pas un bypass distinct).

C'est **exactement** l'issue déjà ouverte : « **Paywall modules contournable : le plan de
gating est auto-déclaré par le client (completeOnboarding), jamais réconcilié avec
l'abonnement payé** » (+ connexe : « entitlements dérivés de metadata.plan »). → **Pas de
nouvelle issue.**

*Note de fix (rattachée par cet audit) : faire dériver le `plan` de gating de
`subscriptions.plan` (réel), ou réconcilier `artisans.plan` dans le webhook
`customer.subscription.updated`, plutôt que de faire confiance à `input.plan`.*

---

## Verdict

`modulesRouter` : **tenant-scopé** (pas d'IDOR), mais le gating repose sur `artisans.plan`
**auto-déclaré** et **jamais réconcilié** avec l'abonnement Stripe payé → contournement
de paywall **déjà filé** (`toggle` inclus, même source). **Pas de nouvelle issue Linear.**
