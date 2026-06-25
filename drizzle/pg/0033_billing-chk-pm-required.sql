ALTER TABLE billing_subscriptions
  DROP CONSTRAINT IF EXISTS chk_pm_required;

ALTER TABLE billing_subscriptions
  ADD CONSTRAINT chk_pm_required
  CHECK (status != 'active' OR payment_method_id IS NOT NULL);