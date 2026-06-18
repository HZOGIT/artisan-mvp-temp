import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { ArticleRepositoryDrizzle } from "./article-repository-drizzle";
import { expectCrossTenantDenied } from "../../../shared/testing";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

// Plage d'ids UNIQUE à ce fichier (anti-collision run parallèle — cf. hygiène des tests PG).
const A = 9943001;
const B = 9943002;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
let seq = 0;
const ref = () => `ART-${A}-${++seq}`;

describe.skipIf(!URL)("ArticleRepositoryDrizzle (PG, RLS + scope tenant)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new ArticleRepositoryDrizzle(app.db);

  const cleanup = async () => {
    await admin.query('delete from articles_artisan where "artisanId" in ($1,$2)', [A, B]);
  };
  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  const base = (over = {}) => ({ reference: ref(), designation: "Tuyau PVC", prixUnitaireHT: "12.50", ...over });

  it("create + getById + list scopés au tenant ; défauts PG (unite/tauxTVA)", async () => {
    const a = await repo.create(ctx(A), base({ categorie: "plomberie" }));
    expect(a.artisanId).toBe(A);
    expect(a.unite).toBe("unité"); // défaut PG
    expect(a.tauxTVA).toBe("20.00"); // défaut PG
    expect(a.prixUnitaireHT).toBe("12.50");
    expect((await repo.getById(ctx(A), a.id))?.designation).toBe("Tuyau PVC");
    expect((await repo.list(ctx(A))).some((x) => x.id === a.id)).toBe(true);
  });

  it("isolation cross-tenant : B ne lit/modifie/supprime pas l'article de A", async () => {
    const a = await repo.create(ctx(A), base({ designation: "Secret" }));
    await expectCrossTenantDenied(() => repo.getById(ctx(B), a.id));
    expect((await repo.list(ctx(B))).some((x) => x.id === a.id)).toBe(false);
    expect(await repo.update(ctx(B), a.id, { designation: "hack" })).toBeNull();
    expect(await repo.delete(ctx(B), a.id)).toBe(false);
    expect((await repo.getById(ctx(A), a.id))?.designation).toBe("Secret");
  });

  it("update : seuls les champs fournis changent ; les autres préservés", async () => {
    const a = await repo.create(ctx(A), base({ designation: "Avant", categorie: "elec", prixUnitaireHT: "5.00" }));
    const maj = await repo.update(ctx(A), a.id, { designation: "Après" });
    expect(maj?.designation).toBe("Après");
    expect(maj?.categorie).toBe("elec"); // préservé
    expect(maj?.prixUnitaireHT).toBe("5.00"); // préservé
  });

  it("delete : supprime l'article, scopé", async () => {
    const a = await repo.create(ctx(A), base());
    expect(await repo.delete(ctx(A), a.id)).toBe(true);
    expect(await repo.getById(ctx(A), a.id)).toBeNull();
  });
});
