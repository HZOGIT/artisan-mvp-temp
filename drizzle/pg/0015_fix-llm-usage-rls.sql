-- Correction : la policy initiale (0014) utilisait 'app.artisan_id' au lieu de 'app.tenant'
-- et n'avait pas de clause WITH CHECK (inserts non scopés). On la remplace par le pattern standard.
DROP POLICY IF EXISTS llm_usage_tenant ON llm_usage;
CREATE POLICY llm_usage_tenant ON llm_usage
  USING      (artisan_id = nullif(current_setting('app.tenant', true), '')::int)
  WITH CHECK (artisan_id = nullif(current_setting('app.tenant', true), '')::int);