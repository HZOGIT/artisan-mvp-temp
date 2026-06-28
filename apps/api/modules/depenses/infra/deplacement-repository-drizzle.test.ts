import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { DeplacementRepositoryDrizzle } from "./deplacement-repository-drizzle";
import { DepenseRepositoryDrizzle } from "./depense-repository-drizzle";
import { convertirTrajetEnIndemnite } from "../application/write-use-cases";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const ART_A = 993001;
const ART_B = 993002;
const USR_A = 993101;
const TECH_A = 993201;
const TECH_B = 993202;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: USR_A });

describe.skipIf(!URL)("DeplacementRepositoryDrizzle (PG, isolation tenant)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const deplRepo = new DeplacementRepositoryDrizzle(app.db);
  const depRepo = new DepenseRepositoryDrizzle(app.db);

  let trajetIdA: number;
  let trajetIdB: number;

  const cleanup = async () => {
    await admin.query("delete from historique_deplacements where id in ($1,$2)", [trajetIdA ?? 0, trajetIdB ?? 0]);
    await admin.query("delete from depenses where artisan_id in ($1,$2)", [ART_A, ART_B]);
    await admin.query("delete from techniciens where id in ($1,$2)", [TECH_A, TECH_B]);
    await admin.query("delete from users where id = $1", [USR_A]);
  };

  beforeAll(async () => {
    await cleanup();
    await admin.query("insert into users (id, email, password, role) values ($1,'dep-test-a@t.fr','x','artisan')", [USR_A]);
    await admin.query("insert into techniciens (id, \"artisanId\", nom) values ($1,$2,'Tech A')", [TECH_A, ART_A]);
    await admin.query("insert into techniciens (id, \"artisanId\", nom) values ($1,$2,'Tech B')", [TECH_B, ART_B]);

    const rA = await admin.query<{ id: number }>(
      `insert into historique_deplacements ("technicienId", "dateDebut", "distanceKm")
       values ($1, now(), '25.0') returning id`,
      [TECH_A],
    );
    trajetIdA = rA.rows[0].id;

    const rB = await admin.query<{ id: number }>(
      `insert into historique_deplacements ("technicienId", "dateDebut", "distanceKm")
       values ($1, now(), '10.0') returning id`,
      [TECH_B],
    );
    trajetIdB = rB.rows[0].id;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("L2 — listParTenant filtre par tenant (technicien artisan A ne voit pas B)", async () => {
    const trajetsA = await deplRepo.listParTenant(ctx(ART_A));
    const idsA = trajetsA.map((t) => t.id);
    expect(idsA).toContain(trajetIdA);
    expect(idsA).not.toContain(trajetIdB);
  });

  it("L2 — getParTenant : hors tenant → null", async () => {
    const result = await deplRepo.getParTenant(ctx(ART_B), trajetIdA);
    expect(result).toBeNull();
  });

  it("L2 — conversion idempotente (2 appels → 1 seule dépense, dépenseId persistent)", async () => {
    const d1 = await convertirTrajetEnIndemnite(depRepo, deplRepo, ctx(ART_A), {
      deplacementId: trajetIdA,
      tarifKm: 0.5,
    });
    expect(d1.montantHt).toBe("12.50"); // 25 × 0.5

    const d2 = await convertirTrajetEnIndemnite(depRepo, deplRepo, ctx(ART_A), {
      deplacementId: trajetIdA,
      tarifKm: 0.5,
    });
    expect(d2.id).toBe(d1.id);

    const trajetApres = await deplRepo.getParTenant(ctx(ART_A), trajetIdA);
    expect(trajetApres?.depenseId).toBe(d1.id);
  });
});
