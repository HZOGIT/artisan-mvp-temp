import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { PortalSchedulingReaderDrizzle } from "./portal-scheduling-reader-drizzle";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const UID_A = 9936071;
const UID_B = 9936072;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 0 });

const BASE = new Date("2026-09-01T08:00:00.000Z");
const at = (h: number) => new Date(BASE.getTime() + h * 3600_000);

// L2 RLS : planification du portail (créneaux occupés, RDV, chantiers+suivi) via withTenant + scope client.
describe.skipIf(!URL)("PortalSchedulingReaderDrizzle (RLS tenant + scope client)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const reader = new PortalSchedulingReaderDrizzle(app.db);
  let artisanA = 0;
  let artisanB = 0;
  let clientA = 0;

  const cleanup = async () => {
    const uids = [UID_A, UID_B];
    await admin.query('delete from suivi_chantier where "chantierId" in (select id from chantiers where "artisanId" in (select id from artisans where "userId" = any($1)))', [uids]);
    for (const t of ["chantiers", "rdv_en_ligne", "interventions"]) {
      await admin.query(`delete from ${t} where "artisanId" in (select id from artisans where "userId" = any($1))`, [uids]);
    }
    await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId" = any($1))', [uids]);
    await admin.query('delete from artisans where "userId" = any($1)', [uids]);
  };

  beforeAll(async () => {
    await cleanup();
    artisanA = (await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UID_A, "Plan A"])).rows[0].id;
    artisanB = (await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UID_B, "Plan B"])).rows[0].id;
    clientA = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [artisanA, "Durand"])).rows[0].id;

    // Créneaux dans la fenêtre [BASE, BASE+24h] : 1 intervention planifiée + 1 RDV confirmé = OCCUPÉS ;
    // 1 intervention annulée + 1 RDV refusé = IGNORÉS.
    await admin.query('insert into interventions ("artisanId","clientId",titre,"dateDebut",statut) values ($1,$2,$3,$4,$5)', [artisanA, clientA, "I-ok", at(1), "planifiee"]);
    await admin.query('insert into interventions ("artisanId","clientId",titre,"dateDebut",statut) values ($1,$2,$3,$4,$5)', [artisanA, clientA, "I-annul", at(2), "annulee"]);
    await admin.query('insert into rdv_en_ligne ("artisanId","clientId",titre,"dateProposee","dureeEstimee",statut,urgence) values ($1,$2,$3,$4,$5,$6,$7)', [artisanA, clientA, "R-ok", at(3), 60, "confirme", "normale"]);
    await admin.query('insert into rdv_en_ligne ("artisanId","clientId",titre,"dateProposee","dureeEstimee",statut,urgence) values ($1,$2,$3,$4,$5,$6,$7)', [artisanA, clientA, "R-refuse", at(4), 60, "refuse", "normale"]);

    // Chantier + 2 étapes de suivi : 1 visible client, 1 interne.
    const chId = (await admin.query('insert into chantiers ("artisanId","clientId",reference,nom,statut) values ($1,$2,$3,$4,$5) returning id', [artisanA, clientA, "CH-1", "Réno SDB", "en_cours"])).rows[0].id;
    await admin.query('insert into suivi_chantier ("chantierId",titre,"visibleClient",ordre,statut) values ($1,$2,$3,$4,$5)', [chId, "Démolition", true, 1, "termine"]);
    await admin.query('insert into suivi_chantier ("chantierId",titre,"visibleClient",ordre,statut) values ($1,$2,$3,$4,$5)', [chId, "Note interne", false, 2, "a_faire"]);
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("getCreneauxOccupes : compte interventions (≠annulée) + RDV (en_attente/confirmé) dans la fenêtre", async () => {
    const occ = await reader.getCreneauxOccupes(ctx(artisanA), BASE, at(24));
    expect(occ.length).toBe(2); // I-ok + R-ok ; I-annul et R-refuse exclus
    // cross-tenant : B n'a aucun créneau
    expect(await reader.getCreneauxOccupes(ctx(artisanB), BASE, at(24))).toEqual([]);
  });

  it("createRdv + getRdvByClient : crée un RDV (en_attente) lisible côté tenant ; cross-tenant → []", async () => {
    const created = await reader.createRdv(ctx(artisanA), { clientId: clientA, titre: "Demande client", urgence: "normale", dateProposee: at(100), dureeEstimee: 30 });
    expect(created.titre).toBe("Demande client");
    expect(created.statut).toBe("en_attente");
    const list = await reader.getRdvByClient(ctx(artisanA), clientA);
    expect(list.some((r) => r.id === created.id)).toBe(true);
    expect(await reader.getRdvByClient(ctx(artisanB), clientA)).toEqual([]);
  });

  it("getChantiersWithSuivi : chantier scopé + étapes visibles client uniquement ; cross-tenant → []", async () => {
    const chans = await reader.getChantiersWithSuivi(ctx(artisanA), clientA);
    expect(chans.length).toBe(1);
    expect(chans[0].reference).toBe("CH-1");
    expect(chans[0].etapes.map((e) => e.titre)).toEqual(["Démolition"]); // "Note interne" (visibleClient=false) exclue
    expect(await reader.getChantiersWithSuivi(ctx(artisanB), clientA)).toEqual([]);
  });
});
