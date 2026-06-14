# Audit — Configuration env & gardes de secrets — OK

**Date** : 2026-06-08 · **Projet** : Lancement 30 juin

> Périmètre : `env.ts` (schéma Zod + `ENV`), vérification de signature webhook
> Stripe (`stripeService.constructWebhookEvent`), connexion DB (`db.ts`),
> `validateSecretsNotExposed`. Suite du fil « footguns de config » (OPE-69).

---

## Conclusion : pas de BLOCKER/HIGH nouveau. Secrets correctement gardés.

### Points sains confirmés

- **`JWT_SECRET`** : **requis** au boot, `min(32)` (`env.ts:12`) → l'app **refuse
  de démarrer** sans secret de session fort. Pas de fallback faible.
- **Webhook Stripe — vérification de signature *fail-closed*** : `handleStripe
  Webhook` passe `ENV.stripeWebhookSecret || ''` à `constructEvent`
  (`webhookHandler.ts:51`). Avec un secret vide/incorrect, `constructEvent`
  **lève** → `catch` → **400** (`:56-58`). Un webhook **non signé / forgé est
  rejeté** : pas de moyen de forger un événement (marquer une facture payée,
  upgrader un abonnement). **Pas de faille de forgerie.**
- **`DATABASE_URL`** : bien que `optional()` dans le schéma, `db.ts:125` **lève
  `'DATABASE_URL is not defined'`** si absent → échec **bruyant** à la connexion
  (pas de mode dégradé silencieux). Injecté par la plateforme (absent des `.env`
  committés, normal).
- **Secrets Stripe configurés** : `STRIPE_SECRET_KEY` et `STRIPE_WEBHOOK_SECRET`
  **présents** dans `.env.local` et `.env.staging`.
- **Pas de secret au client** : cf. `2026-06-08-secrets-client-bundle-ok.md`
  (modèle Vite + 0 référence).

---

## Réserves (mineures)

1. **Pas de garde de production sur les variables critiques optionnelles**
   (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` : `z.string().optional()`, `env.ts:
   15,17`). Elles sont **configurées en staging** et leurs sites d'usage échouent
   proprement si absentes (checkout → `PRECONDITION_FAILED`/500 ; webhook → 400 ;
   visible côté Stripe). **Mais** un nouvel environnement prod oubliant
   `STRIPE_WEBHOOK_SECRET` aurait **tous ses webhooks en 400** → abonnements
   **jamais activés** (artisan paie, reste `expired`) — observable côté ops mais
   pas côté utilisateur. → Recommandation : **`superRefine` prod-required** (déjà
   proposé pour `RESEND_API_KEY` en **OPE-69**) **étendu** à
   `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`. Note ajoutée à OPE-69.

2. **`validateSecretsNotExposed` est du code mort** (`grep` callers → 0). Helper
   défensif (détection de secrets dans une réponse client) jamais branché. Sans
   impact (tRPC/superjson ne sérialise pas `process.env`), mais soit le câbler dans
   le formatter d'erreurs tRPC, soit le retirer.

---

## Verdict

Gestion des secrets/config **saine** : `JWT_SECRET` requis fort, webhook Stripe
**fail-closed** (pas de forgerie), `DATABASE_URL` enforce à l'usage, secrets
configurés en staging, rien au client. Réserves : généraliser la garde de prod
(OPE-69) aux secrets Stripe, et nettoyer `validateSecretsNotExposed` (mort).
**Pas de nouvelle issue Linear.**
