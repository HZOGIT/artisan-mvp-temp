/**
 * Setup global des tests API. Le runtime se connecte sous le rôle applicatif `app_tenant`
 * (non-superuser, soumis à la RLS) via APP_DATABASE_URL. On reproduit fidèlement cette config
 * en test : si seul DATABASE_URL (owner) est fourni, on dérive APP_DATABASE_URL sur app_tenant
 * — même règle que les tests L2/L3 — pour que le client par défaut (getDbHandle) exerce la RLS,
 * comme en production. Les opérations owner (seed/setup) passent par un pool DATABASE_URL dédié.
 */
if (!process.env.APP_DATABASE_URL && process.env.DATABASE_URL) {
  process.env.APP_DATABASE_URL = process.env.DATABASE_URL.replace(
    /:\/\/[^@]+@/,
    "://app_tenant:app_tenant_pw@",
  );
}
