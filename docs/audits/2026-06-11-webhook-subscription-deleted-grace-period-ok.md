# Audit — Webhook `customer.subscription.deleted` : pas de lockout du période payée — OK

**Date** : 2026-06-11 · **Projet** : Lancement 30 juin

> Périmètre : `handleSubscriptionDeleted` (`webhookHandler.ts:254-286`), interaction avec
> `subscriptionGuard` (`isExpired`).

---

## Conclusion : résiliation gérée sans couper l'accès payé. Pas de BLOCKER/HIGH.

Enjeu : une résiliation qui **bloquerait immédiatement** un abonné ayant payé jusqu'à la
fin de période = perte d'accès payé (litige).

### Le handler ne touche pas `currentPeriodEnd`

```typescript
// :259 — handleSubscriptionDeleted
await db.updateSubscription(artisanId, {
  plan: 'expired', status: 'canceled', cancelAtPeriodEnd: false,
});   // currentPeriodEnd inchangé
```

### Le guard ne bloque `canceled` qu'après la fin de période

```typescript
// subscriptionGuard.isExpired
status === "canceled" && currentPeriodEnd !== null && currentPeriodEnd < now
```

→ Tant que `currentPeriodEnd >= now`, un abonnement `canceled` **n'est pas bloqué** →
l'accès **continue jusqu'à la fin de la période payée**. Correct :

- **`cancel_at_period_end`** : Stripe émet `deleted` **à la fin de période** →
  `currentPeriodEnd ≈ now` → blocage peu après (normal).
- **Hard-cancel mi-période** : `deleted` immédiat mais `currentPeriodEnd` futur → accès
  conservé jusqu'au terme payé (raisonnable).

`currentPeriodEnd` est toujours peuplé pour un abonnement **Stripe** réel (via
`subscription.updated`) → pas de cas NULL → pas de lockout par valeur manquante.

Email de résiliation envoyé (best-effort), annonce **rétention 30 j** + CTA réabonnement.

---

## Réserve (déjà filée)

- L'email promet « données conservées 30 jours » : la **purge effective** à J+30 dépend
  d'un job d'effacement → le **droit à l'effacement RGPD non honoré** est **déjà filé**
  (RGPD). Promesse vs implémentation à réconcilier, hors périmètre de ce handler.

---

## Verdict

`subscription.deleted` pose `status='canceled'`/`plan='expired'` sans toucher
`currentPeriodEnd` → le guard **conserve l'accès jusqu'à la fin de période payée** (pas de
lockout immédiat de l'abonné). Comportement correct. La purge 30 j relève de la **RGPD
déjà filée**. **Pas de nouvelle issue Linear.**
