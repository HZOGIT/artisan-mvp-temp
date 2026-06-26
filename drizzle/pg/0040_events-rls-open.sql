/* events = journal global, pas de scoping tenant : drop la policy héritée de audit_log */
drop policy if exists tenant_isolation on events;
alter table events disable row level security;
