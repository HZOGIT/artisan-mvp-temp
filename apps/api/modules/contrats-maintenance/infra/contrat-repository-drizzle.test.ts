import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { ContratRepositoryDrizzle } from "./contrat-repository-drizzle";
import { expectCrossTenantDenied } from "../../../shared/testing";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

// Plage d'ids UNIQUE à ce fichier (anti-collision run parallèle — cf. hygiène des tests PG).
const A = 9945501;
const B = 9945502;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe.skipIf(!URL)("ContratRepositoryDrizzle (PG, RLS + état machine + anti-IDOR + référence serveur)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new ContratRepositoryDrizzle(app.db);
  let clientA = 0;
  let clientB = 0;

  const cleanup = async () => {
    await admin.query('delete from interventions_contrat where "artisanId" in ($1,$2)', [A, B]);
    await admin.query('delete from contrats_maintenance where "artisanId" in ($1,$2)', [A, B]);
    await admin.query('delete from clients where "artisanId" in ($1,$2)', [A, B]);
  };
  beforeAll(async () => {
    await cleanup();
    clientA = (await admin.query('insert into clients ("artisanId", nom) values ($1,$2) returning id', [A, "CA"])).rows[0].id;
    clientB = (await admin.query('insert into clients ("artisanId", nom) values ($1,$2) returning id', [B, "CB"])).rows[0].id;
  });
  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  const base = () => ({ clientId: clientA, titre: "Entretien chaudière", montantHT: "300.00", periodicite: "annuel" as const, dateDebut: new Date("2026-07-01T00:00:00Z") });

  it("create force artisanId + statut actif + reference fournie ; défauts PG", async () => {
    const ref = await repo.nextReference(ctx(A));
    const c = await repo.create(ctx(A), base(), ref);
    expect(c.artisanId).toBe(A);
    expect(c.statut).toBe("actif");
    expect(c.reference).toBe(ref);
    expect(c.type).toBe("entretien");
    expect(c.tauxTVA).toBe("20.00");
    expect(c.reconduction).toBe(true);
    expect((await repo.getById(ctx(A), c.id))?.titre).toBe("Entretien chaudière");
    expect((await repo.list(ctx(A))).some((x) => x.id === c.id)).toBe(true);
  });

  it("nextReference incrémente (borne sur l'existant)", async () => {
    const r1 = await repo.nextReference(ctx(A));
    await repo.create(ctx(A), base(), r1);
    const r2 = await repo.nextReference(ctx(A));
    expect(parseInt(r2.match(/-(\d+)$/)![1], 10)).toBe(parseInt(r1.match(/-(\d+)$/)![1], 10) + 1);
  });

  it("isolation cross-tenant : B ne lit/modifie/transitionne/supprime pas le contrat de A", async () => {
    const c = await repo.create(ctx(A), base(), await repo.nextReference(ctx(A)));
    await expectCrossTenantDenied(() => repo.getById(ctx(B), c.id));
    expect(await repo.update(ctx(B), c.id, { titre: "hack" })).toBeNull();
    expect(await repo.setStatut(ctx(B), c.id, "annule")).toBeNull();
    expect(await repo.delete(ctx(B), c.id)).toBe(false);
    expect((await repo.getById(ctx(A), c.id))?.titre).toBe("Entretien chaudière");
  });

  it("update ne modifie pas le statut ; setStatut applique suspendu/termine", async () => {
    const c = await repo.create(ctx(A), base(), await repo.nextReference(ctx(A)));
    const maj = await repo.update(ctx(A), c.id, { titre: "Modifié", montantHT: "350.00" });
    expect(maj?.titre).toBe("Modifié");
    expect(maj?.montantHT).toBe("350.00");
    expect(maj?.statut).toBe("actif");
    expect((await repo.setStatut(ctx(A), c.id, "suspendu"))?.statut).toBe("suspendu");
    expect((await repo.setStatut(ctx(A), c.id, "termine"))?.statut).toBe("termine");
  });

  it("ownsClient : true pour client du tenant, false sinon (anti-IDOR)", async () => {
    expect(await repo.ownsClient(ctx(A), clientA)).toBe(true);
    expect(await repo.ownsClient(ctx(A), clientB)).toBe(false);
    expect(await repo.ownsClient(ctx(A), 999999999)).toBe(false);
  });

  it("interventions : create/list/getById scopés via contrat parent + isolation cross-tenant", async () => {
    const c = await repo.create(ctx(A), base(), await repo.nextReference(ctx(A)));
    const i = await repo.createIntervention(ctx(A), { contratId: c.id, titre: "Visite", dateIntervention: new Date("2026-08-01T09:00:00Z") });
    expect(i.artisanId).toBe(A);
    expect(i.statut).toBe("planifiee");
    expect((await repo.listInterventions(ctx(A), c.id)).some((x) => x.id === i.id)).toBe(true);
    // B ne voit pas les interventions du contrat de A
    expect(await repo.listInterventions(ctx(B), c.id)).toEqual([]);
    await expectCrossTenantDenied(() => repo.getInterventionById(ctx(B), i.id));
    const maj = await repo.updateIntervention(ctx(A), i.id, { statut: "effectuee", rapport: "OK" });
    expect(maj?.statut).toBe("effectuee");
    expect(await repo.updateIntervention(ctx(B), i.id, { statut: "annulee" })).toBeNull();
  });

  it("listAFacturer : actifs échus uniquement, avec nom client joint", async () => {
    // contrat échu (hier) → présent ; contrat futur → absent
    const echu = await repo.create(ctx(A), { ...base(), prochainFacturation: new Date(Date.now() - 86_400_000) }, await repo.nextReference(ctx(A)));
    await repo.create(ctx(A), { ...base(), prochainFacturation: new Date(Date.now() + 30 * 86_400_000) }, await repo.nextReference(ctx(A)));
    const out = await repo.listAFacturer(ctx(A));
    expect(out.some((x) => x.id === echu.id)).toBe(true);
    expect(out.find((x) => x.id === echu.id)?.clientNom).toBe("CA");
    expect(out.every((x) => x.statut === "actif")).toBe(true);
    // isolation : B ne voit aucun contrat de A
    expect((await repo.listAFacturer(ctx(B))).some((x) => x.artisanId === A)).toBe(false);
  });

  it("reviserPrix : met à jour montantHT + dateDerniereRevision + crée ligne historique ; isolation RLS", async () => {
    const c = await repo.create(ctx(A), { ...base(), montantHT: "300.00" }, await repo.nextReference(ctx(A)));
    const dateRevision = new Date("2026-01-15T00:00:00Z");
    const updated = await repo.reviserPrix(ctx(A), c.id, "300.00", "306.00", "2.00", dateRevision);
    expect(updated?.montantHT).toBe("306.00");
    expect(updated?.dateDerniereRevision?.toISOString()).toBe(dateRevision.toISOString());
    const hist = await repo.getHistoriqueRevisions(ctx(A), c.id);
    expect(hist).toHaveLength(1);
    expect(hist[0].ancienMontantHT).toBe("300.00");
    expect(hist[0].nouveauMontantHT).toBe("306.00");
    expect(hist[0].tauxApplique).toBe("2.00");
    expect(hist[0].declencheur).toBe("manuel");
    /* isolation cross-tenant : B ne voit pas l'historique de A */
    expect(await repo.getHistoriqueRevisions(ctx(B), c.id)).toHaveLength(0);
    expect(await repo.reviserPrix(ctx(B), c.id, "306.00", "999.00", "2.00", new Date())).toBeNull();
    expect((await repo.getById(ctx(A), c.id))?.montantHT).toBe("306.00");
  });

  it("reviserPrix : garde annuelle atomique — même année → null, aucune ligne historique supplémentaire", async () => {
    const c = await repo.create(ctx(A), { ...base(), montantHT: "200.00" }, await repo.nextReference(ctx(A)));
    const first = await repo.reviserPrix(ctx(A), c.id, "200.00", "204.00", "2.00", new Date());
    expect(first?.montantHT).toBe("204.00");
    const second = await repo.reviserPrix(ctx(A), c.id, "204.00", "210.00", "2.00", new Date());
    expect(second).toBeNull();
    expect((await repo.getById(ctx(A), c.id))?.montantHT).toBe("204.00");
    expect(await repo.getHistoriqueRevisions(ctx(A), c.id)).toHaveLength(1);
  });

  it("reviserPrix : concurrence — 2 appels parallèles → exactement 1 succès, 1 null", async () => {
    const c = await repo.create(ctx(A), { ...base(), montantHT: "500.00" }, await repo.nextReference(ctx(A)));
    const [r1, r2] = await Promise.all([
      repo.reviserPrix(ctx(A), c.id, "500.00", "510.00", "2.00", new Date()),
      repo.reviserPrix(ctx(A), c.id, "500.00", "510.00", "2.00", new Date()),
    ]);
    const successes = [r1, r2].filter((r) => r !== null).length;
    expect(successes).toBe(1);
    expect((await repo.getById(ctx(A), c.id))?.montantHT).toBe("510.00");
    expect(await repo.getHistoriqueRevisions(ctx(A), c.id)).toHaveLength(1);
  });
});
