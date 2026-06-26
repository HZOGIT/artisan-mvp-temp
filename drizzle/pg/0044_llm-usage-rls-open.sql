/* llm_usage = journal global cross-tenant : drop policy tenant + disable RLS comme events */
DROP POLICY IF EXISTS llm_usage_tenant ON llm_usage;
ALTER TABLE llm_usage DISABLE ROW LEVEL SECURITY;
