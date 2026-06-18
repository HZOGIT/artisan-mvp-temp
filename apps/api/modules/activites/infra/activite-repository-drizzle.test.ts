import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { ActiviteRepositoryDrizzle } from "./activite-repository-drizzle";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 9932001;
const B = 9932002;
const UA = 9932003;
const UB = 9932004;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe.skipIf(!URL)("ActiviteRepositoryDrizzle (PG, RLS + scope tenant + anti-IDOR FK)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new ActiviteRepositoryDrizzle(app.db);
  let clientA = 0;
  let clientB = 0;

  const cleanup = async () => {
    await admin.query('delete from activites where "artisanId" in ($1,$2)', [A, B]);
    await admin.query('delete from clients where "artisanId" in ($1,$2)', [A, B]);
    await admin.query("delete from users where id in ($1,$2)", [UA, UB]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UA, `u${UA}@t.fr`]);
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UB, `u${UB}@t.fr`]);
    clientA = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [A, "Client A"])).rows[0].id;
    clientB = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [B, "Client B"])).rows[0].id;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("create + list scopés tenant, tri à-faire/échéance ; toggleFait positionne faitAt", async () => {
    await repo.create(ctx(A), { type: "appel", titre: "Tard", echeance: "2026-03-01" });
    const tot = await repo.create(ctx(A), { type: "email", titre: "Tôt", echeance: "2026-02-01" });
    const list = await repo.list(ctx(A));
    expect(list.map((a) => a.titre)).toEqual(["Tôt", "Tard"]);
    expect(await repo.setFait(ctx(A), tot.id, true)).toBe(true);
    const after = await repo.list(ctx(A));
    // « Tôt » devient fait → passe en fin de tri.
    expect(after[after.length - 1].titre).toBe("Tôt");
    expect(after.find((a) => a.id === tot.id)?.faitAt).not.toBeNull();
  });

  it("ownsEntite : client du tenant → true ; client d'un autre tenant → false (anti-IDOR FK)", async () => {
    expect(await repo.ownsEntite(ctx(A), "client", clientA)).toBe(true);
    expect(await repo.ownsEntite(ctx(A), "client", clientB)).toBe(false);
    expect(await repo.ownsEntite(ctx(A), "aucun", clientA)).toBe(false);
  });

  it("isolation cross-tenant : B ne voit/toggle/supprime pas l'activité de A", async () => {
    const a = await repo.create(ctx(A), { type: "autre", titre: "Secret", echeance: "2026-06-14" });
    expect((await repo.list(ctx(B))).some((x) => x.id === a.id)).toBe(false);
    expect(await repo.setFait(ctx(B), a.id, true)).toBe(false);
    expect(await repo.remove(ctx(B), a.id)).toBe(false);
    // Intacte côté A.
    expect((await repo.list(ctx(A))).find((x) => x.id === a.id)?.fait).toBe(false);
    expect(await repo.remove(ctx(A), a.id)).toBe(true);
  });
});
