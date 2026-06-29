import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../db";
import { DrizzlePermissionsReader } from "./permissions-reader";

/**
 * DrizzlePermissionsReader lit permissions_utilisateur par userId SANS tenant posé.
 * Régression OPE-762 : FORCE RLS bloquait app_tenant quand app.tenant = '' → 0 ligne → 403.
 */
const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const USER_ID = 9987001;

describe.skipIf(!URL)("DrizzlePermissionsReader — lecture sans tenant (OPE-762)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const reader = new DrizzlePermissionsReader(app.db);

  const cleanup = async () => {
    await admin.query(`delete from "permissions_utilisateur" where "userId" = $1`, [USER_ID]).catch(() => {});
    await admin.query(`delete from "users" where id = $1`, [USER_ID]).catch(() => {});
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query(`insert into "users" (id, email, password, role, "artisanId") values ($1,$2,'x','secretaire',99870)`, [USER_ID, `rls-perm-762@test.local`]);
    await admin.query(`insert into "permissions_utilisateur" ("userId", permission, autorise) values ($1,'test.permission.762',true)`, [USER_ID]);
  });

  afterAll(async () => {
    await cleanup();
    await app.close().catch(() => {});
    await admin.end();
  });

  it("lit les permissions d'un collaborateur as app_tenant SANS tenant posé", async () => {
    const perms = await reader.getPermissions(USER_ID);
    expect(perms).toContain("test.permission.762");
  });

  it("retourne [] pour un userId sans permissions", async () => {
    const perms = await reader.getPermissions(USER_ID + 9999);
    expect(perms).toEqual([]);
  });

  it("ignore les permissions avec autorise=false", async () => {
    await admin.query(`insert into "permissions_utilisateur" ("userId", permission, autorise) values ($1,'test.revoked.762',false)`, [USER_ID]);
    const perms = await reader.getPermissions(USER_ID);
    expect(perms).not.toContain("test.revoked.762");
    expect(perms).toContain("test.permission.762");
  });
});
