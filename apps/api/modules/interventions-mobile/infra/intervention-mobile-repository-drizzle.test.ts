import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { InterventionMobileRepositoryDrizzle } from "./intervention-mobile-repository-drizzle";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const UID_A = 9947181;
const UID_B = 9947182;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 0 });

// L2 RLS : repository des données mobiles d'intervention (`interventions_mobile`, SOUS RLS artisanId).
// Vérifie la création (arrivée), le round-trip getByIntervention/getMany, les mises à jour scopées
// (arrivée/départ + signature), et l'anti-IDOR cross-tenant (B ne voit/modifie pas la ligne de A).
describe.skipIf(!URL)("InterventionMobileRepositoryDrizzle (RLS)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new InterventionMobileRepositoryDrizzle(app.db);
  let artisanA = 0;
  let artisanB = 0;
  let interA1 = 0;
  let interA2 = 0;

  const cleanup = async () => {
    const uids = [UID_A, UID_B];
    const sub = 'in (select id from artisans where "userId" = any($1))';
    await admin.query(`delete from interventions_mobile where "artisanId" ${sub}`, [uids]);
    await admin.query(`delete from interventions where "artisanId" ${sub}`, [uids]);
    await admin.query(`delete from clients where "artisanId" ${sub}`, [uids]);
    await admin.query('delete from artisans where "userId" = any($1)', [uids]);
  };

  const seedInter = async (artisanId: number, clientId: number, titre: string) =>
    (await admin.query('insert into interventions ("artisanId","clientId",titre,"dateDebut") values ($1,$2,$3,$4) returning id', [artisanId, clientId, titre, "2026-06-01T08:00:00Z"])).rows[0].id;

  beforeAll(async () => {
    await cleanup();
    artisanA = (await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UID_A, "Mob A"])).rows[0].id;
    artisanB = (await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UID_B, "Mob B"])).rows[0].id;
    const clientA = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [artisanA, "C"])).rows[0].id;
    interA1 = await seedInter(artisanA, clientA, "I1");
    interA2 = await seedInter(artisanA, clientA, "I2");
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("createArrivee + getByIntervention : round-trip scopé artisan ; anti-IDOR (B → null)", async () => {
    const m = await repo.createArrivee(ctx(artisanA), { interventionId: interA1, heureArrivee: new Date("2026-06-01T09:00:00Z"), latitude: "45.75", longitude: "4.85" });
    expect(m.interventionId).toBe(interA1);
    expect(Number(m.latitude)).toBe(45.75);
    expect((await repo.getByIntervention(ctx(artisanA), interA1))?.id).toBe(m.id);
    expect(await repo.getByIntervention(ctx(artisanB), interA1)).toBeNull(); // anti-IDOR RLS
  });

  it("getManyByInterventions : map indexée par interventionId ; liste vide → map vide", async () => {
    await repo.createArrivee(ctx(artisanA), { interventionId: interA2, heureArrivee: new Date("2026-06-01T10:00:00Z") });
    const map = await repo.getManyByInterventions(ctx(artisanA), [interA1, interA2]);
    expect(map.size).toBe(2);
    expect(map.get(interA1)?.interventionId).toBe(interA1);
    expect((await repo.getManyByInterventions(ctx(artisanA), [])).size).toBe(0);
    expect((await repo.getManyByInterventions(ctx(artisanB), [interA1, interA2])).size).toBe(0); // anti-IDOR
  });

  it("updateArrivee : met à jour heure/coordonnées (scopé artisan)", async () => {
    const m = await repo.getByIntervention(ctx(artisanA), interA1);
    const updated = await repo.updateArrivee(ctx(artisanA), m!.id, { heureArrivee: new Date("2026-06-01T09:30:00Z"), latitude: "48.85", longitude: "2.35" });
    expect(Number(updated.latitude)).toBe(48.85);
    expect(Number(updated.longitude)).toBe(2.35);
  });

  it("updateDepart : pose départ + notes + signature ; anti-IDOR (B → no-op)", async () => {
    const m = await repo.getByIntervention(ctx(artisanA), interA1);
    // B tente la mise à jour → 0 ligne touchée (where artisanId = B)
    await repo.updateDepart(ctx(artisanB), m!.id, { heureDepart: new Date("2026-06-01T12:00:00Z"), notesIntervention: "intrus" });
    expect((await repo.getByIntervention(ctx(artisanA), interA1))?.heureDepart).toBeNull(); // inchangé
    // A met à jour → départ + signature persistés
    await repo.updateDepart(ctx(artisanA), m!.id, { heureDepart: new Date("2026-06-01T12:00:00Z"), notesIntervention: "RAS", signatureClient: "data:sig", signatureDate: new Date("2026-06-01T12:01:00Z") });
    const after = await repo.getByIntervention(ctx(artisanA), interA1);
    expect(after?.heureDepart).not.toBeNull();
    expect(after?.notesIntervention).toBe("RAS");
    expect(after?.signatureClient).toBe("data:sig");
  });
});
