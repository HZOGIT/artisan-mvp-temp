import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { TechnicienRepositoryDrizzle } from "./technicien-repository-drizzle";
import { expectCrossTenantDenied } from "../../../shared/testing";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 994001;
const B = 994002;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe.skipIf(!URL)("TechnicienRepositoryDrizzle (PG, RLS + scope tenant)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new TechnicienRepositoryDrizzle(app.db);

  const cleanup = async () => {
    await admin.query(
      'delete from positions_techniciens where "technicienId" in (select id from techniciens where "artisanId" in ($1,$2))',
      [A, B],
    );
    await admin.query(
      'delete from disponibilites_techniciens where "technicienId" in (select id from techniciens where "artisanId" in ($1,$2))',
      [A, B],
    );
    await admin.query('delete from techniciens where "artisanId" in ($1,$2)', [A, B]);
  };

  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("create + getById + list scopés au tenant", async () => {
    const t = await repo.create(ctx(A), { nom: "Martin", prenom: "Léa", coutHoraire: "35.00" });
    expect(t.id).toBeGreaterThan(0);
    expect(t.artisanId).toBe(A);
    expect((await repo.getById(ctx(A), t.id))?.nom).toBe("Martin");
    expect((await repo.list(ctx(A))).some((x) => x.id === t.id)).toBe(true);
  });

  it("isolation cross-tenant : B ne lit/modifie/supprime pas le technicien de A", async () => {
    const t = await repo.create(ctx(A), { nom: "Secret" });
    await expectCrossTenantDenied(() => repo.getById(ctx(B), t.id));
    expect((await repo.list(ctx(B))).some((x) => x.id === t.id)).toBe(false);
    expect(await repo.update(ctx(B), t.id, { nom: "hack" })).toBeNull();
    expect(await repo.delete(ctx(B), t.id)).toBe(false);
    expect((await repo.getById(ctx(A), t.id))?.nom).toBe("Secret");
  });

  it("update : modifie les champs scopés au tenant", async () => {
    const t = await repo.create(ctx(A), { nom: "AvantMaj", statut: "actif" });
    const maj = await repo.update(ctx(A), t.id, { statut: "conge", specialite: "Plomberie" });
    expect(maj?.statut).toBe("conge");
    expect(maj?.specialite).toBe("Plomberie");
  });

  it("delete : purge le technicien + ses sous-ressources (cascade), scopé tenant", async () => {
    const t = await repo.create(ctx(A), { nom: "ASupprimer" });
    await admin.query(
      'insert into disponibilites_techniciens ("technicienId","jourSemaine","heureDebut","heureFin") values ($1,$2,$3,$4)',
      [t.id, 1, "08:00", "17:00"],
    );
    await admin.query(
      'insert into positions_techniciens ("technicienId", latitude, longitude) values ($1,$2,$3)',
      [t.id, "48.85", "2.35"],
    );
    expect(await repo.delete(ctx(A), t.id)).toBe(true);
    expect(await repo.getById(ctx(A), t.id)).toBeNull();
    const dispos = await admin.query('select count(*)::int as n from disponibilites_techniciens where "technicienId"=$1', [t.id]);
    const pos = await admin.query('select count(*)::int as n from positions_techniciens where "technicienId"=$1', [t.id]);
    expect(dispos.rows[0].n).toBe(0);
    expect(pos.rows[0].n).toBe(0);
  });
});
