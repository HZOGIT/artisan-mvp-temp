-- Index : coût par tenant sur une période (requête analytique principale)
CREATE INDEX idx_llm_usage_artisan_date ON llm_usage (artisan_id, created_at DESC);
-- Index : analyse par feature
CREATE INDEX idx_llm_usage_usecase_date ON llm_usage (use_case, created_at DESC);
-- Index : retrouver les tokens d'un message de conversation
CREATE INDEX idx_llm_usage_message ON llm_usage (message_id) WHERE message_id IS NOT NULL;

-- RLS : isolation tenant standard (même pattern que les autres tables)
ALTER TABLE llm_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY llm_usage_tenant ON llm_usage
  USING (artisan_id = current_setting('app.artisan_id')::integer);