/** RLS défense-en-profondeur sur les tables enfant sans artisanId direct.
 * Chaque policy vérifie le tenant via EXISTS sur la table parente.
 * Idempotent : DROP POLICY IF EXISTS avant chaque CREATE.
 */

-- devis_lignes → devis.artisanId
alter table "devis_lignes" enable row level security;
alter table "devis_lignes" force row level security;
drop policy if exists tenant_isolation on "devis_lignes";
create policy tenant_isolation on "devis_lignes"
  using (exists (
    select 1 from "devis" d
    where d.id = "devis_lignes"."devisId"
      and d."artisanId" = nullif(current_setting('app.tenant', true), '')::int
  ))
  with check (exists (
    select 1 from "devis" d
    where d.id = "devis_lignes"."devisId"
      and d."artisanId" = nullif(current_setting('app.tenant', true), '')::int
  ));

-- devis_options → devis.artisanId
alter table "devis_options" enable row level security;
alter table "devis_options" force row level security;
drop policy if exists tenant_isolation on "devis_options";
create policy tenant_isolation on "devis_options"
  using (exists (
    select 1 from "devis" d
    where d.id = "devis_options"."devisId"
      and d."artisanId" = nullif(current_setting('app.tenant', true), '')::int
  ))
  with check (exists (
    select 1 from "devis" d
    where d.id = "devis_options"."devisId"
      and d."artisanId" = nullif(current_setting('app.tenant', true), '')::int
  ));

-- devis_options_lignes → devis_options.devisId → devis.artisanId (2 hops)
alter table "devis_options_lignes" enable row level security;
alter table "devis_options_lignes" force row level security;
drop policy if exists tenant_isolation on "devis_options_lignes";
create policy tenant_isolation on "devis_options_lignes"
  using (exists (
    select 1 from "devis_options" o
    join "devis" d on d.id = o."devisId"
    where o.id = "devis_options_lignes"."optionId"
      and d."artisanId" = nullif(current_setting('app.tenant', true), '')::int
  ))
  with check (exists (
    select 1 from "devis_options" o
    join "devis" d on d.id = o."devisId"
    where o.id = "devis_options_lignes"."optionId"
      and d."artisanId" = nullif(current_setting('app.tenant', true), '')::int
  ));

-- factures_lignes → factures.artisanId
alter table "factures_lignes" enable row level security;
alter table "factures_lignes" force row level security;
drop policy if exists tenant_isolation on "factures_lignes";
create policy tenant_isolation on "factures_lignes"
  using (exists (
    select 1 from "factures" f
    where f.id = "factures_lignes"."factureId"
      and f."artisanId" = nullif(current_setting('app.tenant', true), '')::int
  ))
  with check (exists (
    select 1 from "factures" f
    where f.id = "factures_lignes"."factureId"
      and f."artisanId" = nullif(current_setting('app.tenant', true), '')::int
  ));

-- messages → conversations.artisanId
alter table "messages" enable row level security;
alter table "messages" force row level security;
drop policy if exists tenant_isolation on "messages";
create policy tenant_isolation on "messages"
  using (exists (
    select 1 from "conversations" c
    where c.id = "messages"."conversationId"
      and c."artisanId" = nullif(current_setting('app.tenant', true), '')::int
  ))
  with check (exists (
    select 1 from "conversations" c
    where c.id = "messages"."conversationId"
      and c."artisanId" = nullif(current_setting('app.tenant', true), '')::int
  ));

-- client_portal_sessions → clients.artisanId
alter table "client_portal_sessions" enable row level security;
alter table "client_portal_sessions" force row level security;
drop policy if exists tenant_isolation on "client_portal_sessions";
create policy tenant_isolation on "client_portal_sessions"
  using (exists (
    select 1 from "clients" cl
    where cl.id = "client_portal_sessions"."clientId"
      and cl."artisanId" = nullif(current_setting('app.tenant', true), '')::int
  ))
  with check (exists (
    select 1 from "clients" cl
    where cl.id = "client_portal_sessions"."clientId"
      and cl."artisanId" = nullif(current_setting('app.tenant', true), '')::int
  ));

-- permissions_utilisateur → users.artisanId (nullable : admins platform exclus)
alter table "permissions_utilisateur" enable row level security;
alter table "permissions_utilisateur" force row level security;
drop policy if exists tenant_isolation on "permissions_utilisateur";
create policy tenant_isolation on "permissions_utilisateur"
  using (exists (
    select 1 from "users" u
    where u.id = "permissions_utilisateur"."userId"
      and u."artisanId" = nullif(current_setting('app.tenant', true), '')::int
  ))
  with check (exists (
    select 1 from "users" u
    where u.id = "permissions_utilisateur"."userId"
      and u."artisanId" = nullif(current_setting('app.tenant', true), '')::int
  ));