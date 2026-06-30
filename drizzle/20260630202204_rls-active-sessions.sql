alter table "active_sessions" enable row level security;
alter table "active_sessions" force row level security;
drop policy if exists tenant_isolation on "active_sessions";
create policy tenant_isolation on "active_sessions"
  using ("artisan_id" = nullif(current_setting('app.tenant', true), '')::int)
  with check ("artisan_id" = nullif(current_setting('app.tenant', true), '')::int);
