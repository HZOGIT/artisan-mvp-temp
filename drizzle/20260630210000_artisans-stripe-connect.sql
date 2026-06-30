ALTER TABLE artisans
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id    varchar(255),
  ADD COLUMN IF NOT EXISTS stripe_connect_charges_enabled   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_connect_payouts_enabled   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_connect_details_submitted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_connect_requirements      jsonb,
  ADD COLUMN IF NOT EXISTS stripe_connect_status            varchar(20) NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS stripe_connect_connected_at      timestamp,
  ADD COLUMN IF NOT EXISTS stripe_connect_updated_at        timestamp;

CREATE UNIQUE INDEX IF NOT EXISTS uidx_artisans_stripe_connect_account_id
  ON artisans (stripe_connect_account_id)
  WHERE stripe_connect_account_id IS NOT NULL;

ALTER TABLE artisans
  ADD CONSTRAINT chk_artisans_stripe_connect_status
    CHECK (stripe_connect_status IN ('none', 'pending', 'active', 'restricted', 'deauthorized'));
