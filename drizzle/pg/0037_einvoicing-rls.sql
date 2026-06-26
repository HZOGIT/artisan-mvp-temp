alter table "pa_entites" enable row level security;
alter table "pa_entites" force row level security;
drop policy if exists tenant_isolation on "pa_entites";
create policy tenant_isolation on "pa_entites" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "factures_cycle_vie_events" enable row level security;
alter table "factures_cycle_vie_events" force row level security;
drop policy if exists tenant_isolation on "factures_cycle_vie_events";
create policy tenant_isolation on "factures_cycle_vie_events" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);

alter table "pa_outbox" enable row level security;
alter table "pa_outbox" force row level security;
drop policy if exists tenant_isolation on "pa_outbox";
create policy tenant_isolation on "pa_outbox" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);
