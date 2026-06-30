ALTER TABLE billing_invoices
  ADD COLUMN IF NOT EXISTS seller_name       varchar(255),
  ADD COLUMN IF NOT EXISTS seller_address    text,
  ADD COLUMN IF NOT EXISTS seller_siret      varchar(14),
  ADD COLUMN IF NOT EXISTS seller_tva_intracom varchar(20),
  ADD COLUMN IF NOT EXISTS buyer_name        varchar(255),
  ADD COLUMN IF NOT EXISTS buyer_address     text,
  ADD COLUMN IF NOT EXISTS buyer_siret       varchar(14);
