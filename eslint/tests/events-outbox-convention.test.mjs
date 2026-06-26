import { RuleTester } from "eslint";
import eventsOutboxConvention from "../events-outbox-convention.mjs";

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2020,
    sourceType: "module",
  },
});

ruleTester.run("events-outbox-convention", eventsOutboxConvention, {
  valid: [
    {
      code: `outboxEvent(tx, ctx, { action: 'devis.cree', entityType: 'devis', entityId: 1 })`,
      filename: "/app/apps/api/modules/devis/interface/trpc/create.ts",
    },
    {
      code: `outboxEvent(tx, ctx, { action: 'facture.payee', entityType: 'facture', entityId: 1 })`,
      filename: "/app/apps/api/modules/billing/interface/trpc/pay.ts",
    },
    {
      code: `outboxEvent(tx, ctx, { action: 'commande.validee', entityType: 'commande', entityId: 1 })`,
      filename: "/app/apps/api/modules/orders/interface/trpc/validate.ts",
    },
    {
      code: `emitEvent(eventBus, ctx, { type: 'user.created', entityType: 'user', entityId: 1 })`,
      filename: "/app/apps/api/modules/users/application/use-create-user.ts",
    },
  ],
  invalid: [
    {
      code: `outboxEvent(tx, ctx, { action: 'created', entityType: 'devis', entityId: 1 })`,
      filename: "/app/apps/api/modules/devis/interface/trpc/create.ts",
      errors: [
        {
          message: "Action d'événement doit être au format 'module.action' (ex. 'devis.cree'), pas 'created'.",
        },
      ],
    },
    {
      code: `outboxEvent(tx, ctx, { action: 'FACTURE_PAYEE', entityType: 'facture', entityId: 1 })`,
      filename: "/app/apps/api/modules/billing/interface/trpc/pay.ts",
      errors: [
        {
          message: "Action d'événement doit être au format 'module.action' (ex. 'devis.cree'), pas 'FACTURE_PAYEE'.",
        },
      ],
    },
    {
      code: `emitEvent(eventBus, ctx, { type: 'devis.cree', entityType: 'devis', entityId: 1 })`,
      filename: "/app/apps/api/modules/devis/interface/trpc/create.ts",
      errors: [
        {
          message:
            "Utiliser outboxEvent dans un withOutbox (atomicité ACID) — cf. pilote #126. emitEvent est fire-and-forget non transactionnel.",
        },
      ],
    },
    {
      code: `outboxEvent(db, ctx, { action: 'devis.cree', entityType: 'devis', entityId: 1 })`,
      filename: "/app/apps/api/modules/devis/interface/trpc/create.ts",
      errors: [
        {
          message:
            "outboxEvent doit recevoir tx en premier argument pour l'atomicité ACID — cf. PR #126.",
        },
      ],
    },
    {
      code: `outboxEvent(getDb(), ctx, { action: 'devis.cree', entityType: 'devis', entityId: 1 })`,
      filename: "/app/apps/api/modules/devis/interface/trpc/create.ts",
      errors: [
        {
          message:
            "outboxEvent doit recevoir tx en premier argument pour l'atomicité ACID — cf. PR #126.",
        },
      ],
    },
    {
      code: `outboxEvent(this.db, ctx, { action: 'devis.cree', entityType: 'devis', entityId: 1 })`,
      filename: "/app/apps/api/modules/devis/interface/trpc/create.ts",
      errors: [
        {
          message:
            "outboxEvent doit recevoir tx en premier argument pour l'atomicité ACID — cf. PR #126.",
        },
      ],
    },
  ],
});

console.log("✅ All tests passed!");
