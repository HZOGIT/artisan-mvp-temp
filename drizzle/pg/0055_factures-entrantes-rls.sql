alter table "factures_entrantes" enable row level security;
alter table "factures_entrantes" force row level security;
drop policy if exists tenant_isolation on "factures_entrantes";
create policy tenant_isolation on "factures_entrantes" using ("artisanId" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisanId" = nullif(current_setting('app.tenant', true), '')::int);
