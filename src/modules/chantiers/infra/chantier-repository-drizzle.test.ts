import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { ChantierRepositoryDrizzle } from "./chantier-repository-drizzle";
import { expectCrossTenantDenied } from "../../../shared/testing";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 9930011;
const B = 9930012;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
let seq = 0;
const ref = () => `CH-${A}-${++seq}`;

describe.skipIf(!URL)("ChantierRepositoryDrizzle (PG, RLS + scope tenant)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new ChantierRepositoryDrizzle(app.db);
  let clientA = 0;
  let clientB = 0;

  let techA = 0;
  let intervA = 0;
  let intervB = 0;

  const cleanup = async () => {
    await admin.query('delete from pointages_chantier where "artisanId" in ($1,$2)', [A, B]);
    await admin.query('delete from suivi_chantier where "chantierId" in (select id from chantiers where "artisanId" in ($1,$2))', [A, B]);
    await admin.query('delete from phases_chantier where "chantierId" in (select id from chantiers where "artisanId" in ($1,$2))', [A, B]);
    await admin.query('delete from interventions_chantier where "chantierId" in (select id from chantiers where "artisanId" in ($1,$2))', [A, B]);
    await admin.query('delete from documents_chantier where "chantierId" in (select id from chantiers where "artisanId" in ($1,$2))', [A, B]);
    await admin.query("delete from depenses where artisan_id in ($1,$2)", [A, B]);
    await admin.query('delete from interventions where "artisanId" in ($1,$2)', [A, B]);
    await admin.query('delete from chantiers where "artisanId" in ($1,$2)', [A, B]);
    await admin.query('delete from techniciens where "artisanId" in ($1,$2)', [A, B]);
    await admin.query('delete from clients where "artisanId" in ($1,$2)', [A, B]);
  };

  beforeAll(async () => {
    await cleanup();
    // clientId est NOT NULL : on seed un client réel par tenant.
    clientA = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [A, "Client A"])).rows[0].id;
    clientB = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [B, "Client B"])).rows[0].id;
    techA = (await admin.query('insert into techniciens ("artisanId",nom) values ($1,$2) returning id', [A, "Tech A"])).rows[0].id;
    intervA = (await admin.query('insert into interventions ("artisanId","clientId",titre,"dateDebut") values ($1,$2,$3,now()) returning id', [A, clientA, "Interv A"])).rows[0].id;
    intervB = (await admin.query('insert into interventions ("artisanId","clientId",titre,"dateDebut") values ($1,$2,$3,now()) returning id', [B, clientB, "Interv B"])).rows[0].id;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("create + getById + list scopés au tenant", async () => {
    const c = await repo.create(ctx(A), { clientId: clientA, reference: ref(), nom: "Rénovation cuisine", budgetPrevisionnel: "15000.00" });
    expect(c.id).toBeGreaterThan(0);
    expect(c.artisanId).toBe(A);
    expect(c.statut).toBe("planifie"); // défaut PG
    expect(c.priorite).toBe("normale");
    expect(c.avancement).toBe(0);
    expect(c.budgetRealise).toBe("0.00");
    expect((await repo.getById(ctx(A), c.id))?.nom).toBe("Rénovation cuisine");
    expect((await repo.list(ctx(A))).some((x) => x.id === c.id)).toBe(true);
  });

  it("isolation cross-tenant : B ne lit/modifie/supprime pas le chantier de A", async () => {
    const c = await repo.create(ctx(A), { clientId: clientA, reference: ref(), nom: "Secret" });
    await expectCrossTenantDenied(() => repo.getById(ctx(B), c.id));
    expect((await repo.list(ctx(B))).some((x) => x.id === c.id)).toBe(false);
    expect(await repo.update(ctx(B), c.id, { nom: "hack" })).toBeNull();
    expect(await repo.delete(ctx(B), c.id)).toBe(false);
    expect((await repo.getById(ctx(A), c.id))?.nom).toBe("Secret");
  });

  it("update : modifie les champs fournis (dont avancement/statut), préserve les autres, scopé", async () => {
    const c = await repo.create(ctx(A), { clientId: clientA, reference: ref(), nom: "Avant", ville: "Lyon" });
    const maj = await repo.update(ctx(A), c.id, { nom: "Après", statut: "en_cours", avancement: 40 });
    expect(maj?.nom).toBe("Après");
    expect(maj?.statut).toBe("en_cours");
    expect(maj?.avancement).toBe(40);
    expect(maj?.ville).toBe("Lyon"); // champ non fourni préservé
  });

  it("delete : supprime le chantier, scopé", async () => {
    const c = await repo.create(ctx(A), { clientId: clientA, reference: ref(), nom: "ASupprimer" });
    expect(await repo.delete(ctx(A), c.id)).toBe(true);
    expect(await repo.getById(ctx(A), c.id)).toBeNull();
  });

  it("ownsClient (anti-IDOR-FK) : un client est reconnu pour son tenant, pas pour un autre", async () => {
    expect(await repo.ownsClient(ctx(A), clientA)).toBe(true);
    expect(await repo.ownsClient(ctx(B), clientA)).toBe(false); // client de A, vu depuis B
    expect(await repo.ownsClient(ctx(A), 987654321)).toBe(false); // inexistant
  });

  it("delete : cascade les sous-ressources (phases/documents…) — pas de lignes orphelines", async () => {
    const c = await repo.create(ctx(A), { clientId: clientA, reference: ref(), nom: "Avec sous-ressources" });
    await admin.query('insert into phases_chantier ("chantierId",nom) values ($1,$2),($1,$3)', [c.id, "Phase 1", "Phase 2"]);
    await admin.query('insert into documents_chantier ("chantierId",nom,url) values ($1,$2,$3)', [c.id, "Plan", "https://x/plan.pdf"]);
    expect(await repo.delete(ctx(A), c.id)).toBe(true);
    expect(await repo.getById(ctx(A), c.id)).toBeNull();
    const phases = await admin.query('select count(*)::int as n from phases_chantier where "chantierId"=$1', [c.id]);
    const docs = await admin.query('select count(*)::int as n from documents_chantier where "chantierId"=$1', [c.id]);
    expect(phases.rows[0].n).toBe(0);
    expect(docs.rows[0].n).toBe(0);
  });

  it("pointages : add/list/delete scopés via le chantier parent + ownsTechnicien", async () => {
    const c = await repo.create(ctx(A), { clientId: clientA, reference: ref(), nom: "Pointable" });
    expect(await repo.ownsTechnicien(ctx(A), techA)).toBe(true);
    expect(await repo.ownsTechnicien(ctx(B), techA)).toBe(false);
    const p = await repo.addPointage(ctx(A), { chantierId: c.id, technicienId: techA, date: "2026-09-02", heures: "4.00", description: "Pose" });
    expect(p?.heures).toBe("4.00");
    expect(p?.technicienId).toBe(techA);
    expect((await repo.listPointages(ctx(A), c.id)).map((x) => x.id)).toEqual([p!.id]);
    // isolation : B ne voit pas / n'ajoute pas / ne supprime pas
    expect(await repo.listPointages(ctx(B), c.id)).toEqual([]);
    expect(await repo.addPointage(ctx(B), { chantierId: c.id, date: "2026-09-02", heures: "1.00" })).toBeNull();
    expect(await repo.deletePointage(ctx(B), c.id, p!.id)).toBe(false);
    expect(await repo.deletePointage(ctx(A), c.id, p!.id)).toBe(true);
    expect(await repo.listPointages(ctx(A), c.id)).toEqual([]);
  });

  it("suivi : add/list/get/update/delete (table sans artisanId, scope via chantier parent)", async () => {
    const c = await repo.create(ctx(A), { clientId: clientA, reference: ref(), nom: "Suivable" });
    const s = await repo.addSuivi(ctx(A), { chantierId: c.id, titre: "Fondations", ordre: 2 });
    expect(s.statut).toBe("a_faire"); // défaut PG
    expect(s.pourcentage).toBe(0);
    expect(s.visibleClient).toBe(true);
    const s2 = await repo.addSuivi(ctx(A), { chantierId: c.id, titre: "Gros œuvre", ordre: 1, dateDebut: "2026-09-02" });
    expect(s2.dateDebut).toBe("2026-09-02");
    // listSuivi ordonné par `ordre` puis id
    expect((await repo.listSuivi(ctx(A), c.id)).map((x) => x.titre)).toEqual(["Gros œuvre", "Fondations"]);
    // getSuiviById (non scopé tenant : la table n'a pas d'artisanId)
    expect((await repo.getSuiviById(ctx(A), s.id))?.titre).toBe("Fondations");
    // update partiel
    const maj = await repo.updateSuivi(ctx(A), s.id, { statut: "termine", pourcentage: 100 });
    expect(maj?.statut).toBe("termine");
    expect(maj?.pourcentage).toBe(100);
    expect(maj?.titre).toBe("Fondations"); // champ non fourni préservé
    // delete idempotent
    expect(await repo.deleteSuivi(ctx(A), s.id)).toBe(true);
    expect(await repo.deleteSuivi(ctx(A), s.id)).toBe(false);
    expect((await repo.listSuivi(ctx(A), c.id)).map((x) => x.id)).toEqual([s2.id]);
  });

  it("phases : add/list/get/update/delete (table sans artisanId, scope via chantier parent)", async () => {
    const c = await repo.create(ctx(A), { clientId: clientA, reference: ref(), nom: "Phasable" });
    const p = await repo.addPhase(ctx(A), { chantierId: c.id, nom: "Gros œuvre", ordre: 2, budgetPhase: "5000.00", dateDebutPrevue: "2026-09-02" });
    expect(p.statut).toBe("a_faire"); // défaut PG
    expect(p.avancement).toBe(0);
    expect(p.coutReel).toBe("0.00");
    expect(p.budgetPhase).toBe("5000.00");
    expect(p.dateDebutPrevue).toBe("2026-09-02");
    const p2 = await repo.addPhase(ctx(A), { chantierId: c.id, nom: "Finitions", ordre: 1 });
    // listPhases ordonné par `ordre` puis id
    expect((await repo.listPhases(ctx(A), c.id)).map((x) => x.nom)).toEqual(["Finitions", "Gros œuvre"]);
    // getPhaseById (non scopé tenant : la table n'a pas d'artisanId)
    expect((await repo.getPhaseById(ctx(A), p.id))?.nom).toBe("Gros œuvre");
    // update partiel
    const maj = await repo.updatePhase(ctx(A), p.id, { statut: "termine", avancement: 100, coutReel: "5200.00" });
    expect(maj?.statut).toBe("termine");
    expect(maj?.avancement).toBe(100);
    expect(maj?.coutReel).toBe("5200.00");
    expect(maj?.nom).toBe("Gros œuvre"); // champ non fourni préservé
    // update sans champ → renvoie la phase inchangée (pas de SET vide)
    const noop = await repo.updatePhase(ctx(A), p.id, {});
    expect(noop?.statut).toBe("termine");
    // delete idempotent
    expect(await repo.deletePhase(ctx(A), p.id)).toBe(true);
    expect(await repo.deletePhase(ctx(A), p.id)).toBe(false);
    expect((await repo.listPhases(ctx(A), c.id)).map((x) => x.id)).toEqual([p2.id]);
  });

  it("interventions liées : ownsIntervention + associer/dissocier (anti-IDOR DOUBLE, idempotent)", async () => {
    const c = await repo.create(ctx(A), { clientId: clientA, reference: ref(), nom: "Avec interventions" });
    // ownsIntervention (anti-IDOR-FK) : reconnue pour son tenant, pas pour un autre
    expect(await repo.ownsIntervention(ctx(A), intervA)).toBe(true);
    expect(await repo.ownsIntervention(ctx(B), intervA)).toBe(false);
    expect(await repo.ownsIntervention(ctx(A), intervB)).toBe(false);
    // associer + idempotence (pas de doublon)
    const l = await repo.associerIntervention(ctx(A), { chantierId: c.id, interventionId: intervA, ordre: 1 });
    const l2 = await repo.associerIntervention(ctx(A), { chantierId: c.id, interventionId: intervA });
    expect(l2.id).toBe(l.id);
    expect((await repo.listInterventionsLiens(ctx(A), c.id)).map((x) => x.interventionId)).toEqual([intervA]);
    // listAll scopé tenant (B ne voit rien)
    expect((await repo.listAllInterventionsLiens(ctx(A))).some((x) => x.id === l.id)).toBe(true);
    expect(await repo.listAllInterventionsLiens(ctx(B))).toEqual([]);
    // dissocier idempotent
    expect(await repo.dissocierIntervention(ctx(A), c.id, intervA)).toBe(true);
    expect(await repo.dissocierIntervention(ctx(A), c.id, intervA)).toBe(false);
    expect(await repo.listInterventionsLiens(ctx(A), c.id)).toEqual([]);
  });

  it("documents : add/list/get/delete (table sans artisanId, scope via chantier parent)", async () => {
    const c = await repo.create(ctx(A), { clientId: clientA, reference: ref(), nom: "Avec documents" });
    const d = await repo.addDocument(ctx(A), { chantierId: c.id, nom: "Plan", url: "https://x/plan.pdf" });
    expect(d.type).toBe("autre"); // défaut PG
    expect(d.taille).toBeNull();
    const d2 = await repo.addDocument(ctx(A), { chantierId: c.id, nom: "Photo", type: "photo", url: "https://x/p.jpg", taille: 2048 });
    expect(d2.type).toBe("photo");
    expect(d2.taille).toBe(2048);
    // récents d'abord (uploadedAt desc, id desc) — d2 ajouté après d
    expect((await repo.listDocuments(ctx(A), c.id)).map((x) => x.id)).toEqual([d2.id, d.id]);
    // getDocumentById (non scopé tenant : la table n'a pas d'artisanId)
    expect((await repo.getDocumentById(ctx(A), d.id))?.nom).toBe("Plan");
    // delete idempotent
    expect(await repo.deleteDocument(ctx(A), d.id)).toBe(true);
    expect(await repo.deleteDocument(ctx(A), d.id)).toBe(false);
    expect((await repo.listDocuments(ctx(A), c.id)).map((x) => x.id)).toEqual([d2.id]);
  });

  it("stats : sumDepensesChantier (scopé artisan+chantier) + setAvancement (scopé tenant)", async () => {
    const c = await repo.create(ctx(A), { clientId: clientA, reference: ref(), nom: "Statable", budgetPrevisionnel: "10000.00" });
    // aucune dépense → "0"
    expect(parseFloat(await repo.sumDepensesChantier(ctx(A), c.id))).toBe(0);
    // 2 dépenses TTC du tenant A rattachées au chantier + 1 dépense de B (ne doit pas compter)
    await admin.query(
      'insert into depenses (artisan_id,user_id,numero,date_depense,categorie,montant_ht,montant_ttc,chantier_id) values ($1,1,$2,now(),$3,$4,$5,$6)',
      [A, `DEP-${A}-1`, "materiel", "1000.00", "1200.00", c.id],
    );
    await admin.query(
      'insert into depenses (artisan_id,user_id,numero,date_depense,categorie,montant_ht,montant_ttc,chantier_id) values ($1,1,$2,now(),$3,$4,$5,$6)',
      [A, `DEP-${A}-2`, "materiel", "2500.00", "3000.00", c.id],
    );
    expect(parseFloat(await repo.sumDepensesChantier(ctx(A), c.id))).toBe(4200);
    // B ne voit pas les dépenses de A (RLS sur depenses.artisan_id)
    expect(parseFloat(await repo.sumDepensesChantier(ctx(B), c.id))).toBe(0);
    // setAvancement scopé tenant : A met à jour, B est sans effet
    await repo.setAvancement(ctx(A), c.id, 73);
    expect((await repo.getById(ctx(A), c.id))?.avancement).toBe(73);
    await repo.setAvancement(ctx(B), c.id, 5);
    expect((await repo.getById(ctx(A), c.id))?.avancement).toBe(73); // inchangé
  });
});
