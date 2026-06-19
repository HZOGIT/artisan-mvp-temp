import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { createDbClient } from "./client";
import { assertAppRoleExistsAndRestricted } from "./provision-database";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

describe.skipIf(!URL)("assertAppRoleExistsAndRestricted (garde-fou fail-closed)", () => {
  it("résout pour le rôle applicatif (non-superuser, non-bypassrls)", async () => {
    const app = createDbClient(APP_URL!);
    try {
      await expect(assertAppRoleExistsAndRestricted(app.db)).resolves.toBeUndefined();
    } finally {
      await app.close();
    }
  });

  it("refuse une connexion capable de contourner la RLS (superuser/bypassrls)", async () => {
    const owner = createDbClient(URL!);
    try {
      const res = await owner.db.execute(
        sql`select rolsuper, rolbypassrls from pg_roles where rolname = current_user`,
      );
      const role = res.rows[0] as { rolsuper: boolean; rolbypassrls: boolean };
      if (role.rolsuper || role.rolbypassrls) {
        await expect(assertAppRoleExistsAndRestricted(owner.db)).rejects.toThrow(/contourner la RLS/);
      } else {
        await expect(assertAppRoleExistsAndRestricted(owner.db)).resolves.toBeUndefined();
      }
    } finally {
      await owner.close();
    }
  });
});
