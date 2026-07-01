/**
 * Setup global des tests API. Le runtime se connecte sous le rôle applicatif `app_tenant`
 * (non-superuser, soumis à la RLS) via APP_DATABASE_URL. On reproduit fidèlement cette config
 * en test : si seul DATABASE_URL (owner) est fourni, on dérive APP_DATABASE_URL sur app_tenant
 * — même règle que les tests L2/L3 — pour que le client par défaut (getDbHandle) exerce la RLS,
 * comme en production. Les opérations owner (seed/setup) passent par un pool DATABASE_URL dédié.
 */
import { hydrateSecrets } from "./apps/api/shared/config/secrets";

if (!process.env.APP_DATABASE_URL && process.env.DATABASE_URL) {
  process.env.APP_DATABASE_URL = process.env.DATABASE_URL.replace(
    /:\/\/[^@]+@/,
    "://app_tenant:app_tenant_pw@",
  );
}

/**
 * Réchauffe le cache secrets comme au boot prod : sans provider vault, ProcessDotEnv.load()
 * snapshot process.env → les lectures synchrones (getSecretSync : getDbHandle, etc.) trouvent
 * DATABASE_URL / APP_DATABASE_URL dans le cache, sans que le résolveur lise process.env.
 */
await hydrateSecrets();
