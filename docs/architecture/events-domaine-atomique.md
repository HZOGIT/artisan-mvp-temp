# Events de domaine — règle atomique et template fan-out

## Règle DURE

**Les events de domaine / outbox sont TOUJOURS émis atomiquement via `withOutbox` dans la MÊME transaction que le changement d'état.**

Interdit :
- `this.db` hors-tx pour émettre un event après la mutation
- `.catch(() => {})` ou `.catch(console.error)` qui avale l'échec d'émission
- `emitEvent(...)` asynchrone découplé (fire-and-forget)
- `SCREAMING_SNAKE_CASE` pour les noms d'actions

Best-effort toléré **uniquement** pour les side-effects non-métier **explicitement optionnels** : email transactionnel, stats, compteurs anti-flood. Jamais pour un event qu'un consommateur (billing, notifications, relances, audit) attend.

> Self-healing (`ope-879-self-healing-proposal.md`) = filet de sécurité quand l'outbox n'a pas été utilisé sur un vieux chemin. Ce n'est **pas** une excuse pour émettre en best-effort sur du code nouveau. Un healing event récurrent sur le même invariant = bug à corriger à la source.

## Helper

```typescript
/* apps/api/shared/events/with-outbox.ts */
withOutbox(db, repo, async (r, tx) => {
  /* mutation métier */
  await useCaseOuRepository(r, ...args);
  /* event atomique */
  if (tx) await outboxEvent(tx, ctx.tenant, {
    action: "module.verbe",          /* FR minuscule, ex. "facture.envoyée" */
    entityType: "nom-entité",
    entityId: id,
    payload: { /* champs pertinents */ },
  });
  return result;
});
```

`db.transaction()` garantit : si `fn` lance, tout est rollbacké — ni la mutation, ni l'event ne persistent.

Si `db` est absent (tests unitaires sans BDD) : `fn` reçoit le repo original et `tx = undefined` → le bloc `if (tx)` est sauté proprement.

## Conventions nommage actions

| Domaine | Exemples d'actions |
|---|---|
| notifications | `notification.lue`, `notification.archivée` |
| factures | `facture.envoyée`, `facture.payée` |
| devis | `devis.signé`, `devis.refusé` |
| contrats | `contrat.résilié`, `contrat.renouvelé` |
| abonnements | `abonnement.activé`, `abonnement.suspendu` |

Toujours : `<module>.<verbe-passé>`, FR, minuscule, sans underscore.

## Test d'atomicité L2 obligatoire

Chaque mutation eventée a un fichier `*.outbox.test.ts` (ou équivalent) qui vérifie la co-écriture
dans `event_outbox` :

```typescript
it("outbox atomicité — mutation → event co-écrit (L2 Drizzle + PG local)", async () => {
  await callMutation(server, "module.action", input, tok);

  const rows = await admin.query(
    'select action, payload from event_outbox where "artisanId"=$1 order by id desc limit 1',
    [artisanA],
  );
  expect(rows.rows[0]?.action).toBe("module.verbe");
  expect(rows.rows[0]?.payload).toMatchObject({ /* champs clés */ });
});
```

Le test doit être rouge avant l'implémentation, vert après. Un `skipIf(!DATABASE_URL)` silencieux = test invalide.

## Exemples réels

- `apps/api/modules/notifications/interface/trpc/notifications.router.ts` — `markAsRead`, `markAllRead`, `archive`
- `apps/api/modules/factures/interface/trpc/factures.router.ts`
- `apps/api/modules/contrats-maintenance/interface/trpc/contrats-maintenance.router.ts`

Tests correspondants : `*.outbox.test.ts` dans les mêmes répertoires.
