/** permissions_utilisateur est lue hors-tenant (par userId seul, sans app.tenant posé) en création
 * de contexte (DrizzlePermissionsReader). FORCE RLS bloque app_tenant → 0 ligne → 403 collaborateurs.
 * La table est RLS-exempt par design (comme events) : isolation par userId suffit.
 */
drop policy if exists tenant_isolation on "permissions_utilisateur";
alter table "permissions_utilisateur" no force row level security;
alter table "permissions_utilisateur" disable row level security;
