import { RuleTester } from "eslint";
import eventsOutboxConvention from "../events-outbox-convention.mjs";

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2020,
    sourceType: "module",
    parser: require("@typescript-eslint/parser"),
  },
});

ruleTester.run("events-outbox-convention", eventsOutboxConvention, {
  valid: [
    {
      code: `outboxEvent(tx, 'devis.cree', { devisId })`,
      filename: "/app/apps/api/modules/devis/interface/trpc/create.ts",
    },
    {
      code: `outboxEvent(tx, 'facture.payee', { factureId })`,
      filename: "/app/apps/api/modules/billing/interface/trpc/pay.ts",
    },
    {
      code: `outboxEvent(tx, 'commande.validee', { commandeId })`,
      filename: "/app/apps/api/modules/orders/interface/trpc/validate.ts",
    },
    {
      code: `emitEvent('user.created', { userId })`,
      filename: "/app/apps/api/modules/users/application/use-create-user.ts",
    },
  ],
  invalid: [
    {
      code: `outboxEvent(tx, 'created', { id })`,
      filename: "/app/apps/api/modules/devis/interface/trpc/create.ts",
      errors: [
        {
          message: "Type d'événement doit être au format 'module.action' (ex. 'devis.cree'), pas 'created'.",
        },
      ],
    },
    {
      code: `outboxEvent(tx, 'FACTURE_PAYEE', { id })`,
      filename: "/app/apps/api/modules/billing/interface/trpc/pay.ts",
      errors: [
        {
          message: "Type d'événement doit être au format 'module.action' (ex. 'devis.cree'), pas 'FACTURE_PAYEE'.",
        },
      ],
    },
    {
      code: `outboxEvent(tx, 'status_changed', { id })`,
      filename: "/app/apps/api/modules/orders/interface/trpc/update.ts",
      errors: [
        {
          message: "Type d'événement doit être au format 'module.action' (ex. 'devis.cree'), pas 'status_changed'.",
        },
      ],
    },
    {
      code: `emitEvent('devis.cree', { id })`,
      filename: "/app/apps/api/modules/devis/interface/trpc/create.ts",
      errors: [
        {
          message:
            "Utiliser outboxEvent dans un withOutbox (atomicité ACID) — cf. pilote #126. emitEvent est fire-and-forget non transactionnel.",
        },
      ],
    },
    {
      code: `outboxEvent(db, 'devis.cree', { id })`,
      filename: "/app/apps/api/modules/devis/interface/trpc/create.ts",
      errors: [
        {
          message:
            "outboxEvent doit recevoir tx en premier argument pour l'atomicité ACID — cf. PR #126.",
        },
      ],
    },
    {
      code: `outboxEvent(getDb(), 'devis.cree', { id })`,
      filename: "/app/apps/api/modules/devis/interface/trpc/create.ts",
      errors: [
        {
          message:
            "outboxEvent doit recevoir tx en premier argument pour l'atomicité ACID — cf. PR #126.",
        },
      ],
    },
    {
      code: `outboxEvent(this.db, 'devis.cree', { id })`,
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
