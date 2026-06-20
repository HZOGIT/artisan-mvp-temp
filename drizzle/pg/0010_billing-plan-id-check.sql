-- Custom SQL migration file, put your code below! --

-- billing_subscriptions.plan_id : valeurs légales des plans définis dans domain/plan.ts
ALTER TABLE billing_subscriptions
  ADD CONSTRAINT billing_subscriptions_plan_id_check
  CHECK (plan_id IN ('starter', 'pro', 'enterprise'))
  NOT VALID;

ALTER TABLE billing_subscriptions VALIDATE CONSTRAINT billing_subscriptions_plan_id_check;