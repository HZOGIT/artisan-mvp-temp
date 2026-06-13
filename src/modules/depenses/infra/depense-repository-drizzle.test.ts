import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { DepenseRepositoryDrizzle } from "./depense-repository-drizzle";
import { expectCrossTenantDenied } from "../../../shared/testing";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 992001;
const B = 992002;
const UA = 992101;
const UB = 992102;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
let seq = 0;
const numero = () => `DEP-${A}-${++seq}`;

describe.skipIf(!URL)("DepenseRepositoryDrizzle (PG, RLS + scope tenant)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new DepenseRepositoryDrizzle(app.db);

  const cleanup = async () => {
    await admin.query("delete from depenses where artisan_id in ($1,$2)", [A, B]);
    await admin.query("delete from users where id in ($1,$2)", [UA, UB]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UA, `u${UA}@t.fr`]);
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UB, `u${UB}@t.fr`]);
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  const base = (over = {}) => ({
    userId: UA,
    numero: numero(),
    dateDepense: "2026-06-15",
    categorie: "fournitures",
    montantHt: "100.00",
    montantTtc: "120.00",
    ...over,
  });

  it("create + getById + list scopés au tenant (mapping snake↔camel)", async () => {
    const d = await repo.create(ctx(A), base({ montantTva: "20.00", fournisseur: "ACME" }));
    expect(d.id).toBeGreaterThan(0);
    expect(d.artisanId).toBe(A);
    expect(d.statut).toBe("brouillon"); // défaut PG
    expect(d.montantHt).toBe("100.00");
    expect(d.montantTtc).toBe("120.00");
    expect(d.fournisseur).toBe("ACME");
    expect((await repo.getById(ctx(A), d.id))?.categorie).toBe("fournitures");
    expect((await repo.list(ctx(A))).some((x) => x.id === d.id)).toBe(true);
  });

  it("isolation cross-tenant : B ne lit/modifie/supprime pas la dépense de A", async () => {
    const d = await repo.create(ctx(A), base({ description: "Secret" }));
    await expectCrossTenantDenied(() => repo.getById(ctx(B), d.id));
    expect((await repo.list(ctx(B))).some((x) => x.id === d.id)).toBe(false);
    expect(await repo.update(ctx(B), d.id, { description: "hack" })).toBeNull();
    expect(await repo.delete(ctx(B), d.id)).toBe(false);
    expect((await repo.getById(ctx(A), d.id))?.description).toBe("Secret");
  });

  it("update : métadonnées seulement ; statut/rembourse inchangés, champs non fournis préservés", async () => {
    const d = await repo.create(ctx(A), base({ description: "Avant", montantHt: "50.00" }));
    const maj = await repo.update(ctx(A), d.id, { description: "Après" });
    expect(maj?.description).toBe("Après");
    expect(maj?.statut).toBe("brouillon"); // workflow non touché
    expect(maj?.rembourse).toBe(false);
    expect(maj?.montantHt).toBe("50.00"); // champ non fourni préservé
  });

  it("delete : supprime la dépense, scopé", async () => {
    const d = await repo.create(ctx(A), base());
    expect(await repo.delete(ctx(A), d.id)).toBe(true);
    expect(await repo.getById(ctx(A), d.id)).toBeNull();
  });
});
