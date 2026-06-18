import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { InterventionRepositoryDrizzle } from "./intervention-repository-drizzle";
import { expectCrossTenantDenied } from "../../../shared/testing";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 9960011;
const B = 9960012;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe.skipIf(!URL)("InterventionRepositoryDrizzle (PG, RLS + scope tenant)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new InterventionRepositoryDrizzle(app.db);
  let clientA = 0;
  let clientB = 0;

  let techA = 0;

  const cleanup = async () => {
    await admin.query('delete from couleurs_interventions where "artisanId" in ($1,$2)', [A, B]);
    await admin.query('delete from interventions_techniciens where "artisanId" in ($1,$2)', [A, B]);
    await admin.query('delete from interventions where "artisanId" in ($1,$2)', [A, B]);
    await admin.query('delete from techniciens where "artisanId" in ($1,$2)', [A, B]);
    await admin.query('delete from clients where "artisanId" in ($1,$2)', [A, B]);
  };

  beforeAll(async () => {
    await cleanup();
    // clientId est NOT NULL : on seed un client réel par tenant pour respecter la FK.
    clientA = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [A, "Client A"])).rows[0].id;
    clientB = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [B, "Client B"])).rows[0].id;
    techA = (await admin.query('insert into techniciens ("artisanId",nom,prenom) values ($1,$2,$3) returning id', [A, "Martin", "Léa"])).rows[0].id;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("create + getById + list scopés au tenant", async () => {
    const i = await repo.create(ctx(A), { clientId: clientA, titre: "Pose chaudière", dateDebut: new Date("2026-06-10T08:00:00Z") });
    expect(i.id).toBeGreaterThan(0);
    expect(i.artisanId).toBe(A);
    expect(i.statut).toBe("planifiee"); // défaut PG
    expect((await repo.getById(ctx(A), i.id))?.titre).toBe("Pose chaudière");
    expect((await repo.list(ctx(A))).some((x) => x.id === i.id)).toBe(true);
  });

  it("isolation cross-tenant : B ne lit/modifie/supprime pas l'intervention de A", async () => {
    const i = await repo.create(ctx(A), { clientId: clientA, titre: "Secret", dateDebut: new Date("2026-06-11T09:00:00Z") });
    await expectCrossTenantDenied(() => repo.getById(ctx(B), i.id));
    expect((await repo.list(ctx(B))).some((x) => x.id === i.id)).toBe(false);
    expect(await repo.update(ctx(B), i.id, { titre: "hack" })).toBeNull();
    expect(await repo.delete(ctx(B), i.id)).toBe(false);
    expect((await repo.getById(ctx(A), i.id))?.titre).toBe("Secret");
  });

  it("update : modifie les champs fournis, préserve les autres, scopé", async () => {
    const i = await repo.create(ctx(A), { clientId: clientA, titre: "Avant", dateDebut: new Date("2026-06-12T10:00:00Z"), adresse: "1 rue A" });
    const maj = await repo.update(ctx(A), i.id, { titre: "Après", statut: "en_cours" });
    expect(maj?.titre).toBe("Après");
    expect(maj?.statut).toBe("en_cours");
    expect(maj?.adresse).toBe("1 rue A"); // champ non fourni préservé
  });

  it("delete : supprime l'intervention, scopé", async () => {
    const i = await repo.create(ctx(A), { clientId: clientA, titre: "ASupprimer", dateDebut: new Date("2026-06-13T11:00:00Z") });
    expect(await repo.delete(ctx(A), i.id)).toBe(true);
    expect(await repo.getById(ctx(A), i.id)).toBeNull();
  });

  it("ownsRef (anti-IDOR-FK) : un client est reconnu pour son tenant, pas pour un autre", async () => {
    // clientA appartient à A ; depuis B il ne doit pas être « possédé »
    expect(await repo.ownsRef(ctx(A), "client", clientA)).toBe(true);
    expect(await repo.ownsRef(ctx(B), "client", clientA)).toBe(false);
    // un id inexistant → false
    expect(await repo.ownsRef(ctx(A), "client", 987654321)).toBe(false);
  });

  it("findTechnicienIdForUser + listByTechnicien : scope technicien (minimisation RGPD)", async () => {
    // fiche technicien de A liée à un userId dédié
    const userTech = 996777;
    const techId = (await admin.query('insert into techniciens ("artisanId",nom,"userId") values ($1,$2,$3) returning id', [A, "Tech RGPD", userTech])).rows[0].id as number;
    const ctxTech: TenantContext = { artisanId: A, userId: userTech };
    expect(await repo.findTechnicienIdForUser(ctxTech)).toBe(techId);
    // user d'un autre tenant non lié → null
    expect(await repo.findTechnicienIdForUser(ctx(B))).toBeNull();
    // 2 interventions de A : une assignée au technicien, une non
    const iMine = await repo.create(ctx(A), { clientId: clientA, titre: "À moi", dateDebut: new Date("2026-06-14T08:00:00Z"), technicienId: techId });
    await repo.create(ctx(A), { clientId: clientA, titre: "Pas à moi", dateDebut: new Date("2026-06-14T09:00:00Z") });
    const mine = await repo.listByTechnicien(ctx(A), techId);
    expect(mine.map((x) => x.id)).toEqual([iMine.id]);
    await admin.query('delete from interventions where "technicienId"=$1', [techId]);
    await admin.query('delete from techniciens where id=$1', [techId]);
  });

  it("équipe : add (idempotent + nom joint) / list / remove scopés tenant", async () => {
    const i = await repo.create(ctx(A), { clientId: clientA, titre: "Chantier équipe", dateDebut: new Date("2026-06-15T08:00:00Z") });
    const m = await repo.addMembreEquipe(ctx(A), { interventionId: i.id, technicienId: techA, role: "aide" });
    expect(m.technicienId).toBe(techA);
    expect(m.role).toBe("aide");
    expect(m.nom).toBe("Martin"); // jointure technicien
    expect(m.prenom).toBe("Léa");
    // idempotent : (intervention, technicien) déjà présent → même liaison
    const again = await repo.addMembreEquipe(ctx(A), { interventionId: i.id, technicienId: techA });
    expect(again.id).toBe(m.id);
    expect(await repo.listEquipe(ctx(A), i.id)).toHaveLength(1);
    // isolation : B ne voit pas l'équipe de A
    expect(await repo.listEquipe(ctx(B), i.id)).toEqual([]);
    expect((await repo.listEquipesArtisan(ctx(B))).some((x) => x.interventionId === i.id)).toBe(false);
    // remove cross-tenant = no-op ; remove tenant = effectif
    await repo.removeMembreEquipe(ctx(B), m.id);
    expect(await repo.listEquipe(ctx(A), i.id)).toHaveLength(1);
    await repo.removeMembreEquipe(ctx(A), m.id);
    expect(await repo.listEquipe(ctx(A), i.id)).toHaveLength(0);
  });

  it("couleurs : setCouleur upsert (PK artisanId+interventionId) + listCouleurs scopé tenant", async () => {
    const i = await repo.create(ctx(A), { clientId: clientA, titre: "Coloré", dateDebut: new Date("2026-09-01T08:00:00Z") });
    await repo.setCouleur(ctx(A), i.id, "bg-blue-500");
    await repo.setCouleur(ctx(A), i.id, "bg-green-500"); // upsert → remplace (pas de violation PK)
    const rows = await repo.listCouleurs(ctx(A));
    expect(rows.filter((r) => r.interventionId === i.id)).toEqual([{ interventionId: i.id, couleur: "bg-green-500" }]);
    // isolation : B ne voit pas la couleur de A
    expect((await repo.listCouleurs(ctx(B))).some((r) => r.interventionId === i.id)).toBe(false);
  });
});
