alter table "message_files" enable row level security;
alter table "message_files" force row level security;
drop policy if exists tenant_isolation on "message_files";
create policy tenant_isolation on "message_files" using ("artisan_id" = nullif(current_setting('app.tenant', true), '')::int) with check ("artisan_id" = nullif(current_setting('app.tenant', true), '')::int);
