-- Immutabilité billing_webhook_events — symétrique avec 0007 (billing_events).
-- Empêche app_tenant de modifier/supprimer les entrées de déduplication des webhooks Stripe.
-- Rejouer un webhook déjà traité (via DELETE) contournerait la protection ON CONFLICT DO NOTHING.
REVOKE UPDATE, DELETE ON "billing_webhook_events" FROM app_tenant;