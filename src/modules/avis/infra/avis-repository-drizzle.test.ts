import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { AvisRepositoryDrizzle } from "./avis-repository-drizzle";
import { expectCrossTenantDenied } from "../../../shared/testing";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 992001;
const B = 992002;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe.skipIf(!URL)("AvisRepositoryDrizzle (PG, RLS + scope tenant)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new AvisRepositoryDrizzle(app.db);

  const cleanup = async () => {
    await admin.query('delete from avis_clients where "artisanId" in ($1,$2)', [A, B]);
  };

  // Insère un avis (le repo n'a pas de create : seeding admin, hors RLS).
  const seed = async (
    artisanId: number,
    note: number,
    statut: "en_attente" | "publie" | "masque" = "publie",
    clientId = 1,
  ): Promise<number> => {
    const { rows } = await admin.query(
      'insert into avis_clients ("artisanId","clientId",note,statut,"createdAt","updatedAt") values ($1,$2,$3,$4,now(),now()) returning id',
      [artisanId, clientId, note, statut],
    );
    return rows[0].id as number;
  };

  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("list + getById scopés au tenant", async () => {
    const id = await seed(A, 5);
    const got = await repo.getById(ctx(A), id);
    expect(got?.note).toBe(5);
    expect((await repo.list(ctx(A))).some((x) => x.id === id)).toBe(true);
  });

  it("isolation cross-tenant : B ne lit ni ne modifie l'avis de A", async () => {
    const id = await seed(A, 4);
    await expectCrossTenantDenied(() => repo.getById(ctx(B), id));
    expect((await repo.list(ctx(B))).some((x) => x.id === id)).toBe(false);
    // repondre/changerStatut cross-tenant → no-op (null)
    expect(await repo.repondre(ctx(B), id, "hack")).toBeNull();
    expect(await repo.changerStatut(ctx(B), id, "masque")).toBeNull();
    // l'avis de A est intact
    const apres = await repo.getById(ctx(A), id);
    expect(apres?.reponseArtisan ?? null).toBeNull();
    expect(apres?.statut).toBe("publie");
  });

  it("repondre + changerStatut scopés", async () => {
    const id = await seed(A, 3, "en_attente");
    const rep = await repo.repondre(ctx(A), id, "Merci pour votre retour");
    expect(rep?.reponseArtisan).toBe("Merci pour votre retour");
    expect(rep?.reponseAt).toBeInstanceOf(Date);

    const maj = await repo.changerStatut(ctx(A), id, "publie");
    expect(maj?.statut).toBe("publie");
  });

  it("getStats : agrégats moyenne/total/distribution scopés (avis publiés)", async () => {
    await cleanup();
    await seed(A, 5);
    await seed(A, 5);
    await seed(A, 3);
    await seed(A, 1, "masque"); // exclu (non publié)
    await seed(B, 2); // autre tenant → ne compte pas pour A

    const stats = await repo.getStats(ctx(A));
    expect(stats.total).toBe(3);
    expect(stats.distribution[5]).toBe(2);
    expect(stats.distribution[3]).toBe(1);
    expect(stats.distribution[1]).toBe(0);
    expect(stats.moyenne).toBe(Math.round(((5 + 5 + 3) / 3) * 10) / 10);
  });
});
