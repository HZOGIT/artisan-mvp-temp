ALTER TABLE "factures" ALTER COLUMN "nombreRelances" SET DEFAULT 0;

CREATE TABLE IF NOT EXISTS email_outbox (
  id SERIAL PRIMARY KEY,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  html TEXT NOT NULL,
  from_name TEXT,
  reply_to TEXT,
  attachments JSONB,
  tentatives INTEGER NOT NULL DEFAULT 0,
  statut TEXT NOT NULL DEFAULT 'pending',
  derniere_erreur TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  traitee_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS email_outbox_pending_idx ON email_outbox (statut, created_at) WHERE statut = 'pending';