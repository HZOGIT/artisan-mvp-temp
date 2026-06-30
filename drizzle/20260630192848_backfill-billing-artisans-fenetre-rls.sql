-- Backfill billing_subscriptions pour les artisans créés PENDANT la fenêtre RLS buggée.
-- Fenêtre : 2026-06-29 21:41:35 – 22:29:42 UTC = 23:41:35 – 00:29:42 heure Paris
-- (colonnes createdAt sont timestamp SANS timezone, stockées en heure Paris via pool).
-- Validation humaine obtenue (décision AHV : scope fenêtre RLS uniquement, legacy exclu).
-- Idempotent : filtre artisans SANS billing_subscription + ON CONFLICT DO NOTHING.
-- Tourne sous artisan_user (owner) → bypass RLS billing_subscriptions.

INSERT INTO billing_subscriptions (artisan_id, plan_id, billing_interval, billing_mode, status, trial_ends_at)
SELECT
  a.id,
  'starter',
  'monthly',
  'maison',
  'trialing',
  NOW() + INTERVAL '14 days'
FROM artisans a
WHERE a."createdAt" >= TIMESTAMP '2026-06-29 23:41:35'
  AND a."createdAt" <= TIMESTAMP '2026-06-30 00:29:42'
  AND NOT EXISTS (
    SELECT 1 FROM billing_subscriptions bs WHERE bs.artisan_id = a.id
  )
ON CONFLICT (artisan_id) DO NOTHING;
