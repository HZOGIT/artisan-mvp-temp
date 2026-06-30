-- Backfill billing_subscriptions pour les artisans créés pendant la fenêtre RLS (OPE-992)
-- et pour tout artisan legacy sans abonnement (ex. userId=11, artisanId=7).
-- billing_subscriptions a FORCE RLS mais ce script tourne sous artisan_user (owner) → bypass.
-- Idempotent via ON CONFLICT DO NOTHING.

INSERT INTO billing_subscriptions (artisan_id, plan_id, billing_interval, billing_mode, status, trial_ends_at)
SELECT
  a.id,
  'starter',
  'monthly',
  'maison',
  'trialing',
  NOW() + INTERVAL '14 days'
FROM artisans a
WHERE NOT EXISTS (
  SELECT 1 FROM billing_subscriptions bs WHERE bs.artisan_id = a.id
)
ON CONFLICT (artisan_id) DO NOTHING;
