import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { VehiculeRepositoryDrizzle } from "./vehicule-repository-drizzle";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 991501;
const B = 991502;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const ymd = (offsetDays: number) => new Date(Date.now() + offsetDays * 24 * 3600 * 1000).toISOString().slice(0, 10);
const year = new Date().getFullYear();

describe.skipIf(!URL)("vehicules — historique kilométrage + statistiques flotte", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new VehiculeRepositoryDrizzle(app.db);

  const cleanup = async () => {
    await admin.query('delete from historique_kilometrage where "vehiculeId" in (select id from vehicules where "artisanId" in ($1,$2))', [A, B]);
    await admin.query('delete from entretiens_vehicules where "vehiculeId" in (select id from vehicules where "artisanId" in ($1,$2))', [A, B]);
    await admin.query('delete from assurances_vehicules where "vehiculeId" in (select id from vehicules where "artisanId" in ($1,$2))', [A, B]);
    await admin.query('delete from vehicules where "artisanId" in ($1,$2)', [A, B]);
  };
  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("addKilometrage : enregistre l'historique + met à jour le compteur (non régressif)", async () => {
    const v = await repo.create(ctx(A), { immatriculation: "KS-1", kilometrageActuel: 1000 });
    const r1 = await repo.addKilometrage(ctx(A), v.id, { kilometrage: 5000, dateReleve: ymd(-2), motif: "plein" });
    expect(r1?.kilometrage).toBe(5000);
    expect((await repo.getById(ctx(A), v.id))?.kilometrageActuel).toBe(5000);

    // relevé inférieur : enregistré en historique, compteur inchangé (GREATEST)
    await repo.addKilometrage(ctx(A), v.id, { kilometrage: 4000, dateReleve: ymd(-1) });
    expect((await repo.getById(ctx(A), v.id))?.kilometrageActuel).toBe(5000);

    const hist = await repo.getHistoriqueKilometrage(ctx(A), v.id);
    expect(hist.length).toBe(2);
    // tri date desc : le relevé d'hier (-1) avant celui d'avant-hier (-2)
    expect(hist[0].kilometrage).toBe(4000);

    // isolation : B ne lit pas l'historique ni n'ajoute
    expect(await repo.getHistoriqueKilometrage(ctx(B), v.id)).toEqual([]);
    expect(await repo.addKilometrage(ctx(B), v.id, { kilometrage: 9999, dateReleve: ymd(0) })).toBeNull();
  });

  it("getStatistiquesFlotte : agrégats scopés au tenant", async () => {
    const v1 = await repo.create(ctx(A), { immatriculation: "ST-1", statut: "actif", kilometrageActuel: 10000 });
    const v2 = await repo.create(ctx(A), { immatriculation: "ST-2", statut: "en_maintenance", kilometrageActuel: 20000 });
    await repo.addEntretien(ctx(A), v1.id, { type: "revision", dateEntretien: `${year}-03-01`, cout: "150.00" });
    await repo.addEntretien(ctx(A), v2.id, { type: "pneus", dateEntretien: `${year}-04-01`, cout: "300.00" });
    await repo.addAssurance(ctx(A), v1.id, { compagnie: "Maif", dateDebut: ymd(-300), dateFin: ymd(40) }); // expire <60j
    // bruit tenant B
    const vb = await repo.create(ctx(B), { immatriculation: "ST-B", statut: "actif", kilometrageActuel: 999999 });
    await repo.addEntretien(ctx(B), vb.id, { type: "autre", dateEntretien: `${year}-05-01`, cout: "999.00" });

    const stats = await repo.getStatistiquesFlotte(ctx(A));
    expect(stats.nbVehicules).toBeGreaterThanOrEqual(2);
    // (KS-1 du test précédent peut subsister dans le même run ; on vérifie les agrégats de A)
    expect(stats.nbEnMaintenance).toBe(1);
    expect(stats.kmTotalFlotte).toBeGreaterThanOrEqual(30000);
    expect(stats.coutEntretienAnneeEnCours).toBeGreaterThanOrEqual(450);
    expect(stats.assurancesAExpirer).toBeGreaterThanOrEqual(1);

    // B isolé : ne voit que sa flotte
    const statsB = await repo.getStatistiquesFlotte(ctx(B));
    expect(statsB.kmTotalFlotte).toBe(999999);
    expect(statsB.coutEntretienAnneeEnCours).toBe(999);
  });
});
