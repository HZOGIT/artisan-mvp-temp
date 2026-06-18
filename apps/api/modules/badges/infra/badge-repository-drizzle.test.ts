import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { BadgeRepositoryDrizzle } from "./badge-repository-drizzle";
import { expectCrossTenantDenied } from "../../../shared/testing";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 993001;
const B = 993002;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe.skipIf(!URL)("BadgeRepositoryDrizzle (PG, RLS + scope tenant)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new BadgeRepositoryDrizzle(app.db);
  let techA = 0;
  let techB = 0;

  const cleanup = async () => {
    await admin.query(
      'delete from badges_techniciens where "technicienId" in (select id from techniciens where "artisanId" in ($1,$2))',
      [A, B],
    );
    await admin.query('delete from techniciens where "artisanId" in ($1,$2)', [A, B]);
    await admin.query('delete from badges where "artisanId" in ($1,$2)', [A, B]);
  };

  beforeAll(async () => {
    await cleanup();
    techA = (await admin.query('insert into techniciens ("artisanId", nom) values ($1,$2) returning id', [A, "Tech A"])).rows[0].id;
    techB = (await admin.query('insert into techniciens ("artisanId", nom) values ($1,$2) returning id', [B, "Tech B"])).rows[0].id;
  });
  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("create + getById + list scopés au tenant", async () => {
    const b = await repo.create(ctx(A), { code: "PRO", nom: "Pro", points: 50 });
    expect(b.id).toBeGreaterThan(0);
    expect(b.artisanId).toBe(A);
    expect((await repo.getById(ctx(A), b.id))?.nom).toBe("Pro");
    expect((await repo.list(ctx(A))).some((x) => x.id === b.id)).toBe(true);
  });

  it("isolation cross-tenant : B ne lit/modifie pas le badge de A", async () => {
    const b = await repo.create(ctx(A), { code: "SECRET", nom: "Secret" });
    await expectCrossTenantDenied(() => repo.getById(ctx(B), b.id));
    expect((await repo.list(ctx(B))).some((x) => x.id === b.id)).toBe(false);
    expect(await repo.update(ctx(B), b.id, { nom: "hack" })).toBeNull();
    expect(await repo.delete(ctx(B), b.id)).toBe(false);
    // le badge de A est intact
    expect((await repo.getById(ctx(A), b.id))?.nom).toBe("Secret");
  });

  it("attribuer : idempotent + scopé via ownership technicien/badge", async () => {
    const b = await repo.create(ctx(A), { code: "TOP", nom: "Top" });
    const at1 = await repo.attribuer(ctx(A), techA, b.id, 100);
    expect(at1?.technicienId).toBe(techA);
    // idempotent : 2e attribution renvoie la même ligne
    const at2 = await repo.attribuer(ctx(A), techA, b.id, 999);
    expect(at2?.id).toBe(at1?.id);
    expect((await repo.listBadgesTechnicien(ctx(A), techA)).length).toBe(1);
  });

  it("anti-IDOR attribution : technicien d'un autre tenant → null", async () => {
    const b = await repo.create(ctx(A), { code: "X", nom: "X" });
    // A tente d'attribuer sur le technicien de B
    expect(await repo.attribuer(ctx(A), techB, b.id, 1)).toBeNull();
    // B tente d'attribuer le badge de A sur son propre technicien (badge hors tenant) → null
    expect(await repo.attribuer(ctx(B), techB, b.id, 1)).toBeNull();
    // B ne lit pas les badges du technicien de A
    expect(await repo.listBadgesTechnicien(ctx(B), techA)).toEqual([]);
  });
});
