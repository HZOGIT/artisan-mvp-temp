-- Custom SQL migration file, put your code below! --

-- billing_cycles.status : valeurs légales du state machine
ALTER TABLE billing_cycles
  ADD CONSTRAINT billing_cycles_status_check
  CHECK (status IN ('pending', 'charging', 'requires_action', 'processing', 'paid', 'failed', 'skipped'))
  NOT VALID;

ALTER TABLE billing_cycles VALIDATE CONSTRAINT billing_cycles_status_check;

-- billing_subscriptions.status : valeurs légales du state machine
ALTER TABLE billing_subscriptions
  ADD CONSTRAINT billing_subscriptions_status_check
  CHECK (status IN ('trialing', 'active', 'past_due', 'canceled'))
  NOT VALID;

ALTER TABLE billing_subscriptions VALIDATE CONSTRAINT billing_subscriptions_status_check;

-- billing_subscriptions.billing_interval : valeurs supportées
ALTER TABLE billing_subscriptions
  ADD CONSTRAINT billing_subscriptions_billing_interval_check
  CHECK (billing_interval IN ('monthly', 'yearly'))
  NOT VALID;

ALTER TABLE billing_subscriptions VALIDATE CONSTRAINT billing_subscriptions_billing_interval_check;

-- billing_subscriptions.billing_mode : valeurs supportées
ALTER TABLE billing_subscriptions
  ADD CONSTRAINT billing_subscriptions_billing_mode_check
  CHECK (billing_mode IN ('maison', 'stripe'))
  NOT VALID;

ALTER TABLE billing_subscriptions VALIDATE CONSTRAINT billing_subscriptions_billing_mode_check;

-- billing_charge_attempts.status : valeurs légales
ALTER TABLE billing_charge_attempts
  ADD CONSTRAINT billing_charge_attempts_status_check
  CHECK (status IN ('initiated', 'succeeded', 'failed', 'requires_action', 'processing'))
  NOT VALID;

ALTER TABLE billing_charge_attempts VALIDATE CONSTRAINT billing_charge_attempts_status_check;
