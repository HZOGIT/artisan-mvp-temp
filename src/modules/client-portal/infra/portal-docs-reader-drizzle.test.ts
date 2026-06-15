import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { PortalDocsReaderDrizzle } from "./portal-docs-reader-drizzle";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const UID_A = 9935061;
const UID_B = 9935062;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 0 });

// L2 RLS : lecture des documents du portail via `withTenant(artisanId)` + filtre `clientId` (anti-IDOR).
// Vérifie le scope tenant + scope client + le lien de paiement « en attente » + l'exclusion des champs
// internes (contrats sans `notes`).
describe.skipIf(!URL)("PortalDocsReaderDrizzle (RLS tenant + scope client)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const reader = new PortalDocsReaderDrizzle(app.db);
  let artisanA = 0;
  let artisanB = 0;
  let clientA = 0;
  let clientA2 = 0;
  let factureA = 0;

  const cleanup = async () => {
    const uids = [UID_A, UID_B];
    await admin.query('delete from paiements_stripe where "artisanId" in (select id from artisans where "userId" = any($1))', [uids]);
    for (const t of ["devis", "factures", "interventions", "contrats_maintenance"]) {
      await admin.query(`delete from ${t} where "artisanId" in (select id from artisans where "userId" = any($1))`, [uids]);
    }
    await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId" = any($1))', [uids]);
    await admin.query('delete from artisans where "userId" = any($1)', [uids]);
  };

  beforeAll(async () => {
    await cleanup();
    artisanA = (await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UID_A, "Docs A"])).rows[0].id;
    artisanB = (await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UID_B, "Docs B"])).rows[0].id;
    clientA = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [artisanA, "Durand"])).rows[0].id;
    clientA2 = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [artisanA, "Autre"])).rows[0].id;

    // Documents du client A
    await admin.query('insert into devis ("artisanId","clientId",numero,"totalTTC",statut) values ($1,$2,$3,$4,$5)', [artisanA, clientA, "DEV-A1", "1200.00", "envoye"]);
    factureA = (await admin.query('insert into factures ("artisanId","clientId",numero,"totalTTC",statut) values ($1,$2,$3,$4,$5) returning id', [artisanA, clientA, "FAC-A1", "600.00", "envoyee"])).rows[0].id;
    await admin.query('insert into paiements_stripe ("factureId","artisanId",montant,statut,"lienPaiement") values ($1,$2,$3,$4,$5)', [factureA, artisanA, "600.00", "en_attente", "https://pay/EN_ATTENTE"]);
    await admin.query('insert into paiements_stripe ("factureId","artisanId",montant,statut,"lienPaiement") values ($1,$2,$3,$4,$5)', [factureA, artisanA, "600.00", "complete", "https://pay/COMPLETE"]);
    await admin.query('insert into interventions ("artisanId","clientId",titre,"dateDebut",statut) values ($1,$2,$3,now(),$4)', [artisanA, clientA, "Pose", "planifiee"]);
    await admin.query('insert into contrats_maintenance ("artisanId","clientId",reference,titre,"montantHT",periodicite,"dateDebut",notes) values ($1,$2,$3,$4,$5,$6,now(),$7)', [artisanA, clientA, "CTR-A1", "Entretien annuel", "300.00", "annuel", "NOTE INTERNE ARTISAN"]);

    // Un devis d'un AUTRE client du MÊME tenant (vérif scope clientId)
    await admin.query('insert into devis ("artisanId","clientId",numero,"totalTTC",statut) values ($1,$2,$3,$4,$5)', [artisanA, clientA2, "DEV-A2", "9.00", "brouillon"]);
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("listDevis : scope tenant + clientId ; tokenSignature toujours null", async () => {
    const rows = await reader.listDevis(ctx(artisanA), clientA);
    expect(rows.map((d) => d.numero)).toEqual(["DEV-A1"]); // pas DEV-A2 (autre client)
    expect(rows[0].tokenSignature).toBeNull();
  });

  it("listFactures : lien de paiement = celui EN ATTENTE (ignore les paiements payés)", async () => {
    const rows = await reader.listFactures(ctx(artisanA), clientA);
    expect(rows.length).toBe(1);
    expect(rows[0].numero).toBe("FAC-A1");
    expect(rows[0].lienPaiement).toBe("https://pay/EN_ATTENTE");
  });

  it("listInterventions : scope tenant + clientId", async () => {
    const rows = await reader.listInterventions(ctx(artisanA), clientA);
    expect(rows.length).toBe(1);
    expect(rows[0].titre).toBe("Pose");
  });

  it("listContrats : renvoie l'essentiel SANS les notes internes (client-safe)", async () => {
    const rows = await reader.listContrats(ctx(artisanA), clientA);
    expect(rows.length).toBe(1);
    expect(rows[0].reference).toBe("CTR-A1");
    expect(rows[0].titre).toBe("Entretien annuel");
    expect("notes" in rows[0]).toBe(false); // champ interne jamais exposé
  });

  it("anti-IDOR cross-tenant : B ne lit AUCUN document du client de A", async () => {
    expect(await reader.listDevis(ctx(artisanB), clientA)).toEqual([]);
    expect(await reader.listFactures(ctx(artisanB), clientA)).toEqual([]);
    expect(await reader.listInterventions(ctx(artisanB), clientA)).toEqual([]);
    expect(await reader.listContrats(ctx(artisanB), clientA)).toEqual([]);
  });
});
