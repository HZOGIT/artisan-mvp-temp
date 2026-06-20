/*
 * FIX-CDK : DROP CONSTRAINT chk_pm_required (ajoutée en 0006).
 *
 * Cette contrainte CHECK ("status" = 'trialing' OR "payment_method_id" IS NOT NULL)
 * empêche activateExpiredTrials() de passer une sub de "trialing" à "active" quand
 * l'artisan n'a pas encore configuré de moyen de paiement.
 *
 * Résultat sans ce fix : sub reste "trialing" indéfiniment, cycle pending jamais
 * débité (scheduler filtre status IN ('active','past_due')), accès gratuit infini.
 *
 * Le cas "actif sans PM" est géré par NO_PM_RETRY_DELAY_MS du scheduler :
 * cycle.no_payment_method emis, retry 24h, jusqu'à ajout d'un PM par l'artisan.
 */
ALTER TABLE billing_subscriptions DROP CONSTRAINT IF EXISTS chk_pm_required;
