import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { ArtisanRepositoryDrizzle } from "./artisan-repository-drizzle";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const UA = 994401;
const UB = 994402;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe.skipIf(!URL)("ArtisanRepositoryDrizzle (PG, table d'identité hors RLS)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new ArtisanRepositoryDrizzle(app.db);
  let aId = 0;
  let bId = 0;

  const cleanup = async () => {
    await admin.query('delete from artisans where "userId" in ($1,$2)', [UA, UB]);
    await admin.query("delete from users where id in ($1,$2)", [UA, UB]);
  };
  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UA, `u${UA}@t.fr`]);
    await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [UB, `u${UB}@t.fr`]);
    aId = (await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UA, "Plomberie A"])).rows[0].id;
    bId = (await admin.query('insert into artisans ("userId","nomEntreprise","slug") values ($1,$2,$3) returning id', [UB, "Élec B", "elec-b"])).rows[0].id;
  });
  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("getProfile : profil du tenant courant (par id)", async () => {
    expect((await repo.getProfile(ctx(aId)))?.nomEntreprise).toBe("Plomberie A");
    expect((await repo.getProfile(ctx(bId)))?.nomEntreprise).toBe("Élec B");
  });

  it("update : modifie le profil du tenant (par id), champs non fournis préservés", async () => {
    const maj = await repo.update(ctx(aId), { ville: "Lyon", iban: "FR7630006000011234567890189", metier: "Plombier" });
    expect(maj?.ville).toBe("Lyon");
    expect(maj?.iban).toBe("FR7630006000011234567890189");
    expect(maj?.metier).toBe("Plombier");
    expect(maj?.nomEntreprise).toBe("Plomberie A"); // préservé
    // l'update de A ne touche pas B
    expect((await repo.getProfile(ctx(bId)))?.ville).toBeNull();
  });

  it("isSlugAvailable : libre si non pris (ou déjà le sien)", async () => {
    expect(await repo.isSlugAvailable(ctx(aId), "nouveau-slug")).toBe(true);
    expect(await repo.isSlugAvailable(ctx(aId), "elec-b")).toBe(false); // pris par B
    // si A prend "elec-b" comme son propre slug, il est "disponible" pour lui (exclusion par id)
    await repo.update(ctx(aId), { slug: "slug-a" });
    expect(await repo.isSlugAvailable(ctx(aId), "slug-a")).toBe(true);
  });
});
