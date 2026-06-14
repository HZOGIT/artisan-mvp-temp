# Audit — Scheduler de bascule des essais expirés (billing) — OK

**Date** : 2026-06-10 · **Projet** : Lancement 30 juin

> Périmètre : bloc 2 du `runScheduler` (`index.ts:1347-1360`), mapping de statut du webhook
> (`webhookHandler.ts:216-245`).

---

## Conclusion : la bascule trial→expired ne verrouille pas les abonnés payants. Pas de BLOCKER/HIGH.

Enjeu : ce job tourne **toutes les heures** et passe des abonnements en `expired`. Une
requête trop large **verrouillerait des clients payants** (lockout → désastre revenu/UX).

### Requête correctement scopée

```sql
-- index.ts:1351
UPDATE subscriptions SET status='expired', plan='expired'
WHERE status='trialing' AND trial_ends_at < NOW()
```

- N'affecte **que** `status='trialing'` **et** `trial_ends_at < NOW()` → un abonnement
  **payant** (`status='active'`) ou `past_due` n'est **jamais** touché. ✅
- Un essai **non terminé** (`trial_ends_at >= NOW()`) n'est pas touché. ✅

### Interaction avec le trial **Stripe** : sûre

Le webhook `handleSubscriptionUpsert` pose pour un abonnement en essai Stripe :
`status='trialing'` **et** `trialEndsAt = sub.trial_end` (la **vraie** fin d'essai Stripe,
`:238`) — pas le `trial_ends_at` de 14 j du bootstrap.

- Pendant l'essai Stripe : `trial_ends_at` (fin Stripe) est **dans le futur** → le
  scheduler ne le touche pas. ✅
- À la fin de l'essai Stripe : Stripe débite + envoie `customer.subscription.updated`
  (status `active`) → le webhook repasse l'interne à `active` (`trialEndsAt=null`). Le
  scheduler ne le touche plus.
- **Edge-case race** : si le scheduler tombe dans la **fenêtre de quelques secondes** entre
  la fin d'essai et l'arrivée du webhook, il pourrait poser `expired` transitoirement →
  **auto-corrigé** par le webhook `active` qui **écrase** le statut quelques secondes après.
  Probabilité faible, impact transitoire (guard fail-open). Non bloquant.

### Essai in-app (bootstrap, 14 j, sans Stripe)

À expiration, le scheduler pose `expired` → le `subscriptionGuard` bloque (402) → l'artisan
doit s'abonner. Comportement attendu.

---

## Écarts connexes = déjà filés

- `past_due` mappé en interne mais le guard ne bloque pas `past_due`/`unpaid` → **OPE-64**.
- Entitlements dérivés de `metadata.plan` (pas du price ID) → **OPE-28**. Trial stacking →
  **OPE-66**. Tous **déjà filés**, hors périmètre de cette bascule.

---

## Verdict

La bascule horaire `trialing → expired` est **strictement scopée** (`status='trialing' AND
trial_ends_at < NOW()`) → **aucun abonné payant verrouillé** ; l'interaction avec le trial
Stripe est sûre (`trial_ends_at` = vraie fin Stripe, + webhook qui écrase). Edge-case race
**auto-corrigé**. **Pas de nouvelle issue Linear.**
