/* event_outbox = journal global inter-tenant, drainé par un worker cross-tenant.
   Pas de scoping RLS : le drainer lit toutes les lignes sans app.tenant.
   Même traitement que la table events (0040_events-rls-open.sql). */
drop policy if exists tenant_isolation on event_outbox;
alter table event_outbox disable row level security;
