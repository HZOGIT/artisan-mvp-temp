import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../db";
import { DrizzleTenantResolver } from "./drizzle-tenant-resolver";

// Résolution du tenant à partir du userId du token. OWNER (`artisans.userId`) ∪ COLLABORATEUR
// (`users.artisanId`). Régression OPE-264 : un collaborateur/technicien (sans ligne `artisans`)
// doit être résolu via `users.artisanId` — sinon 401 sur le new-stack (seul backend).
const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 9942001;
const B = 9942002;
const OWNER_A = 9942003;
const COLLAB_A = 9942004;
const OWNER_B = 9942005;
const ORPHAN = 9942006; // user sans tenant

describe.skipIf(!URL)("DrizzleTenantResolver — OWNER ∪ COLLABORATEUR (OPE-264)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const resolver = new DrizzleTenantResolver(app.db);

  const cleanup = async () => {
    await admin.query("delete from artisans where id in ($1,$2)", [A, B]);
    await admin.query("delete from users where id in ($1,$2,$3,$4)", [OWNER_A, COLLAB_A, OWNER_B, ORPHAN]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [OWNER_A, `o${OWNER_A}@t.fr`]);
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [OWNER_B, `o${OWNER_B}@t.fr`]);
    await admin.query('insert into artisans (id, "userId") values ($1,$2)', [A, OWNER_A]);
    await admin.query('insert into artisans (id, "userId") values ($1,$2)', [B, OWNER_B]);
    // Collaborateur (secrétaire) rattaché au tenant A via users.artisanId, SANS ligne artisans.
    await admin.query('insert into users (id, email, password, role, "artisanId") values ($1,$2,\'x\',\'secretaire\',$3)', [COLLAB_A, `c${COLLAB_A}@t.fr`, A]);
    // Orphelin : ni owner, ni users.artisanId.
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','technicien')", [ORPHAN, `x${ORPHAN}@t.fr`]);
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("OWNER → tenant de son artisan + rôle", async () => {
    const ctx = await resolver.resolve({ userId: OWNER_A });
    expect(ctx).toEqual({ artisanId: A, userId: OWNER_A, role: "artisan", isOwner: true });
  });

  it("COLLABORATEUR (users.artisanId, pas de ligne artisans) → tenant rattaché + rôle (régression OPE-264)", async () => {
    const ctx = await resolver.resolve({ userId: COLLAB_A });
    expect(ctx).toEqual({ artisanId: A, userId: COLLAB_A, role: "secretaire", isOwner: false });
  });

  it("isolation : le collaborateur de A n'est JAMAIS résolu vers le tenant B", async () => {
    const ctx = await resolver.resolve({ userId: COLLAB_A });
    expect(ctx?.artisanId).toBe(A);
    expect(ctx?.artisanId).not.toBe(B);
  });

  it("utilisateur sans tenant (ni owner ni users.artisanId) → null (401)", async () => {
    expect(await resolver.resolve({ userId: ORPHAN })).toBeNull();
  });

  it("userId inconnu → null", async () => {
    expect(await resolver.resolve({ userId: 99499999 })).toBeNull();
  });
});
