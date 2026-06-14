import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { DemandeAvisRepositoryDrizzle } from "./demande-avis-repository-drizzle";
import { expectCrossTenantDenied } from "../../../shared/testing";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

// Plage d'ids UNIQUE à ce fichier (anti-collision run parallèle — cf. hygiène des tests PG).
const A = 9946301;
const B = 9946302;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe.skipIf(!URL)("DemandeAvisRepositoryDrizzle (PG, RLS + token serveur + anti-IDOR 2 FK)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new DemandeAvisRepositoryDrizzle(app.db);
  let clientA = 0;
  let clientB = 0;
  let interA = 0;
  let interB = 0;

  const cleanup = async () => {
    await admin.query('delete from demandes_avis where "artisanId" in ($1,$2)', [A, B]);
    await admin.query('delete from interventions where "artisanId" in ($1,$2)', [A, B]);
    await admin.query('delete from clients where "artisanId" in ($1,$2)', [A, B]);
  };
  const seedInter = async (artisanId: number, clientId: number) =>
    (
      await admin.query(
        'insert into interventions ("artisanId", "clientId", titre, "dateDebut") values ($1,$2,$3, now()) returning id',
        [artisanId, clientId, "Inter"],
      )
    ).rows[0].id as number;

  beforeAll(async () => {
    await cleanup();
    clientA = (await admin.query('insert into clients ("artisanId", nom) values ($1,$2) returning id', [A, "CA"])).rows[0].id;
    clientB = (await admin.query('insert into clients ("artisanId", nom) values ($1,$2) returning id', [B, "CB"])).rows[0].id;
    interA = await seedInter(A, clientA);
    interB = await seedInter(B, clientB);
  });
  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("create force artisanId + statut envoyee + token 64 hex unique ; expiresAt défaut", async () => {
    const d = await repo.create(ctx(A), { clientId: clientA, interventionId: interA });
    expect(d.artisanId).toBe(A);
    expect(d.statut).toBe("envoyee");
    expect(d.avisRecuAt).toBeNull();
    expect(d.tokenDemande).toMatch(/^[0-9a-f]{64}$/);
    expect(d.expiresAt.getTime()).toBeGreaterThan(Date.now());
    const d2 = await repo.create(ctx(A), { clientId: clientA, interventionId: interA });
    expect(d2.tokenDemande).not.toBe(d.tokenDemande); // token unique
    expect((await repo.getById(ctx(A), d.id))?.clientId).toBe(clientA);
    expect((await repo.listByStatut(ctx(A), "envoyee")).some((x) => x.id === d.id)).toBe(true);
  });

  it("isolation cross-tenant : B ne lit/transitionne/supprime pas la demande de A", async () => {
    const d = await repo.create(ctx(A), { clientId: clientA, interventionId: interA });
    await expectCrossTenantDenied(() => repo.getById(ctx(B), d.id));
    expect(await repo.setStatut(ctx(B), d.id, "ouverte")).toBeNull();
    expect(await repo.delete(ctx(B), d.id)).toBe(false);
    expect((await repo.getById(ctx(A), d.id))?.id).toBe(d.id);
  });

  it("setStatut applique ouverte puis completee (+ avisRecuAt)", async () => {
    const d = await repo.create(ctx(A), { clientId: clientA, interventionId: interA });
    expect((await repo.setStatut(ctx(A), d.id, "ouverte"))?.statut).toBe("ouverte");
    const complete = await repo.setStatut(ctx(A), d.id, "completee");
    expect(complete?.statut).toBe("completee");
    expect(complete?.avisRecuAt).not.toBeNull();
  });

  it("ownsClient / ownsIntervention : true pour le tenant, false pour un autre (anti-IDOR 2 FK)", async () => {
    expect(await repo.ownsClient(ctx(A), clientA)).toBe(true);
    expect(await repo.ownsClient(ctx(A), clientB)).toBe(false);
    expect(await repo.ownsIntervention(ctx(A), interA)).toBe(true);
    expect(await repo.ownsIntervention(ctx(A), interB)).toBe(false);
    expect(await repo.ownsIntervention(ctx(A), 999999999)).toBe(false);
  });

  it("delete : supprime la demande, scopé", async () => {
    const d = await repo.create(ctx(A), { clientId: clientA, interventionId: interA });
    expect(await repo.delete(ctx(A), d.id)).toBe(true);
    expect(await repo.getById(ctx(A), d.id)).toBeNull();
  });
});
