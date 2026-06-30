import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { createDbClient } from "../db/client";
import { withTenant } from "../db/with-tenant";
import { expectCrossTenantDenied } from "./cross-tenant";
import type { TenantContext } from "../tenant";

/**
 * RLS isolation tests for the 13 child tables added in OPE-1000.
 * These tables have no direct artisanId — policy delegates via EXISTS to parent.
 * Tenant A must NOT see tenant B's children even with direct id lookup.
 */
const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 990301;
const B = 990302;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe.skipIf(!URL)("RLS child tables OPE-1000 — isolation cross-tenant (13 tables)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);

  /* IDs of B's parent records */
  let clientB = 0;
  let chantierId = 0;
  let vehiculeId = 0;
  let stockId = 0;
  let inventaireId = 0;
  let modeleDevisId = 0;
  let fournisseurId = 0;
  let commandeId = 0;
  let noteDeFraisId = 0;
  let depenseId = 0;
  let contratMaintenanceId = 0;
  let interventionId = 0;
  let interventionMobileId = 0;

  /* IDs of B's child records */
  let phaseId = 0;
  let suiviId = 0;
  let documentId = 0;
  let interventionChantierId = 0;
  let entretienId = 0;
  let assuranceId = 0;
  let mouvementId = 0;
  let inventaireLigneId = 0;
  let modeleDevisLigneId = 0;
  let ligneCommandeId = 0;
  let noteFraisDepenseId = 0;
  let factureRecurrenteId = 0;
  let photoId = 0;

  const cleanup = async () => {
    /* child tables */
    await admin.query(`delete from "photos_interventions" where id=$1`, [photoId]).catch(() => {});
    await admin.query(`delete from "factures_recurrentes" where id=$1`, [factureRecurrenteId]).catch(() => {});
    await admin.query(`delete from "notes_frais_depenses" where id=$1`, [noteFraisDepenseId]).catch(() => {});
    await admin.query(`delete from "lignes_commandes_fournisseurs" where id=$1`, [ligneCommandeId]).catch(() => {});
    await admin.query(`delete from "modeles_devis_lignes" where id=$1`, [modeleDevisLigneId]).catch(() => {});
    await admin.query(`delete from "inventaires_lignes" where id=$1`, [inventaireLigneId]).catch(() => {});
    await admin.query(`delete from "mouvements_stock" where id=$1`, [mouvementId]).catch(() => {});
    await admin.query(`delete from "entretiens_vehicules" where id=$1`, [entretienId]).catch(() => {});
    await admin.query(`delete from "assurances_vehicules" where id=$1`, [assuranceId]).catch(() => {});
    await admin.query(`delete from "interventions_chantier" where id=$1`, [interventionChantierId]).catch(() => {});
    await admin.query(`delete from "documents_chantier" where id=$1`, [documentId]).catch(() => {});
    await admin.query(`delete from "suivi_chantier" where id=$1`, [suiviId]).catch(() => {});
    await admin.query(`delete from "phases_chantier" where id=$1`, [phaseId]).catch(() => {});
    /* parents */
    await admin.query(`delete from "interventions_mobile" where id=$1`, [interventionMobileId]).catch(() => {});
    await admin.query(`delete from "interventions" where id=$1`, [interventionId]).catch(() => {});
    await admin.query(`delete from "contrats_maintenance" where id=$1`, [contratMaintenanceId]).catch(() => {});
    await admin.query(`delete from "commandes_fournisseurs" where id=$1`, [commandeId]).catch(() => {});
    await admin.query(`delete from "depenses" where id=$1`, [depenseId]).catch(() => {});
    await admin.query(`delete from "notes_de_frais" where id=$1`, [noteDeFraisId]).catch(() => {});
    await admin.query(`delete from "modeles_devis" where id=$1`, [modeleDevisId]).catch(() => {});
    await admin.query(`delete from "inventaires" where id=$1`, [inventaireId]).catch(() => {});
    await admin.query(`delete from "stocks" where id=$1`, [stockId]).catch(() => {});
    await admin.query(`delete from "vehicules" where id=$1`, [vehiculeId]).catch(() => {});
    await admin.query(`delete from "chantiers" where id=$1`, [chantierId]).catch(() => {});
    await admin.query(`delete from "fournisseurs" where id=$1`, [fournisseurId]).catch(() => {});
    await admin.query(`delete from "clients" where "artisanId"=$1`, [B]).catch(() => {});
  };

  beforeAll(async () => {
    await cleanup();

    /* Seed parents for tenant B */
    const cl = await admin.query(`insert into "clients" ("artisanId", nom) values ($1,'client-rls-b') returning id`, [B]);
    clientB = cl.rows[0].id;

    const ch = await admin.query(
      `insert into "chantiers" ("artisanId","clientId",reference,nom) values ($1,$2,'C-RLS-B','Chantier RLS B') returning id`,
      [B, clientB],
    );
    chantierId = ch.rows[0].id;

    const ve = await admin.query(
      `insert into "vehicules" ("artisanId",immatriculation) values ($1,'RLS-001-B') returning id`,
      [B],
    );
    vehiculeId = ve.rows[0].id;

    const st = await admin.query(
      `insert into "stocks" ("artisanId",reference,designation) values ($1,'REF-B','Stock RLS B') returning id`,
      [B],
    );
    stockId = st.rows[0].id;

    const inv = await admin.query(
      `insert into "inventaires" ("artisanId",date,statut) values ($1,now(),'brouillon') returning id`,
      [B],
    );
    inventaireId = inv.rows[0].id;

    const md = await admin.query(
      `insert into "modeles_devis" ("artisanId",nom) values ($1,'Modèle RLS B') returning id`,
      [B],
    );
    modeleDevisId = md.rows[0].id;

    const fo = await admin.query(
      `insert into "fournisseurs" ("artisanId",nom) values ($1,'Fournisseur RLS B') returning id`,
      [B],
    );
    fournisseurId = fo.rows[0].id;

    const co = await admin.query(
      `insert into "commandes_fournisseurs" ("artisanId","fournisseurId") values ($1,$2) returning id`,
      [B, fournisseurId],
    );
    commandeId = co.rows[0].id;

    const ndf = await admin.query(
      `insert into "notes_de_frais" ("artisan_id","user_id",numero,titre,"periode_debut","periode_fin") values ($1,1,'NDF-B','NDF RLS B','2026-06-01','2026-06-30') returning id`,
      [B],
    );
    noteDeFraisId = ndf.rows[0].id;

    const dep = await admin.query(
      `insert into "depenses" ("artisan_id","user_id",numero,"date_depense",categorie) values ($1,1,'DEP-B','2026-06-01','transport') returning id`,
      [B],
    );
    depenseId = dep.rows[0].id;

    const cm = await admin.query(
      `insert into "contrats_maintenance" ("artisanId","clientId",reference,titre,"montantHT",periodicite,"dateDebut") values ($1,$2,'CM-B','Contrat RLS B',100,'mensuel',now()) returning id`,
      [B, clientB],
    );
    contratMaintenanceId = cm.rows[0].id;

    const iv = await admin.query(
      `insert into "interventions" ("artisanId","clientId",titre,"dateDebut") values ($1,$2,'Interv RLS B',now()) returning id`,
      [B, clientB],
    );
    interventionId = iv.rows[0].id;

    const im = await admin.query(
      `insert into "interventions_mobile" ("interventionId","artisanId") values ($1,$2) returning id`,
      [interventionId, B],
    );
    interventionMobileId = im.rows[0].id;

    /* Seed children for tenant B */
    const ph = await admin.query(
      `insert into "phases_chantier" ("chantierId",nom) values ($1,'Phase RLS B') returning id`,
      [chantierId],
    );
    phaseId = ph.rows[0].id;

    const sv = await admin.query(
      `insert into "suivi_chantier" ("chantierId",titre) values ($1,'Suivi RLS B') returning id`,
      [chantierId],
    );
    suiviId = sv.rows[0].id;

    const dc = await admin.query(
      `insert into "documents_chantier" ("chantierId",nom,url) values ($1,'Doc RLS B','https://example.com/b') returning id`,
      [chantierId],
    );
    documentId = dc.rows[0].id;

    const ic = await admin.query(
      `insert into "interventions_chantier" ("chantierId","interventionId") values ($1,$2) returning id`,
      [chantierId, interventionId],
    );
    interventionChantierId = ic.rows[0].id;

    const en = await admin.query(
      `insert into "entretiens_vehicules" ("vehiculeId",type,"dateEntretien") values ($1,'vidange','2026-06-01') returning id`,
      [vehiculeId],
    );
    entretienId = en.rows[0].id;

    const as = await admin.query(
      `insert into "assurances_vehicules" ("vehiculeId",compagnie,"dateDebut","dateFin") values ($1,'Maif','2026-01-01','2026-12-31') returning id`,
      [vehiculeId],
    );
    assuranceId = as.rows[0].id;

    const mv = await admin.query(
      `insert into "mouvements_stock" ("stockId",type,quantite,"quantiteAvant","quantiteApres") values ($1,'entree',10,0,10) returning id`,
      [stockId],
    );
    mouvementId = mv.rows[0].id;

    const il = await admin.query(
      `insert into "inventaires_lignes" ("inventaireId","stockId",reference,designation,unite,"quantiteTheorique") values ($1,$2,'REF-B','Stock RLS B','unité',10) returning id`,
      [inventaireId, stockId],
    );
    inventaireLigneId = il.rows[0].id;

    const ml = await admin.query(
      `insert into "modeles_devis_lignes" ("modeleId",designation) values ($1,'Ligne modèle RLS B') returning id`,
      [modeleDevisId],
    );
    modeleDevisLigneId = ml.rows[0].id;

    const lc = await admin.query(
      `insert into "lignes_commandes_fournisseurs" ("commandeId",designation,quantite) values ($1,'Ligne commande RLS B',5) returning id`,
      [commandeId],
    );
    ligneCommandeId = lc.rows[0].id;

    const nd = await admin.query(
      `insert into "notes_frais_depenses" ("note_id","depense_id") values ($1,$2) returning id`,
      [noteDeFraisId, depenseId],
    );
    noteFraisDepenseId = nd.rows[0].id;

    const fr = await admin.query(
      `insert into "factures_recurrentes" ("contratId","factureId","periodeDebut","periodeFin") values ($1,99999,now(),now()) returning id`,
      [contratMaintenanceId],
    );
    factureRecurrenteId = fr.rows[0].id;

    const pi = await admin.query(
      `insert into "photos_interventions" ("interventionMobileId",url) values ($1,'https://example.com/photo-b') returning id`,
      [interventionMobileId],
    );
    photoId = pi.rows[0].id;
  });

  afterAll(async () => {
    await cleanup();
    await app.close().catch(() => {});
    await admin.end();
  });

  /* CROSS-TENANT: A ne doit pas voir les enfants de B */

  it("phases_chantier — tenant A bloqué par RLS", () =>
    expectCrossTenantDenied(() =>
      withTenant(app.db, ctx(A), (tx) =>
        tx.execute(sql`select * from "phases_chantier" where id = ${phaseId}`).then((r) => r.rows[0] ?? null),
      ),
    ));

  it("suivi_chantier — tenant A bloqué par RLS", () =>
    expectCrossTenantDenied(() =>
      withTenant(app.db, ctx(A), (tx) =>
        tx.execute(sql`select * from "suivi_chantier" where id = ${suiviId}`).then((r) => r.rows[0] ?? null),
      ),
    ));

  it("documents_chantier — tenant A bloqué par RLS", () =>
    expectCrossTenantDenied(() =>
      withTenant(app.db, ctx(A), (tx) =>
        tx.execute(sql`select * from "documents_chantier" where id = ${documentId}`).then((r) => r.rows[0] ?? null),
      ),
    ));

  it("interventions_chantier — tenant A bloqué par RLS", () =>
    expectCrossTenantDenied(() =>
      withTenant(app.db, ctx(A), (tx) =>
        tx.execute(sql`select * from "interventions_chantier" where id = ${interventionChantierId}`).then((r) => r.rows[0] ?? null),
      ),
    ));

  it("entretiens_vehicules — tenant A bloqué par RLS", () =>
    expectCrossTenantDenied(() =>
      withTenant(app.db, ctx(A), (tx) =>
        tx.execute(sql`select * from "entretiens_vehicules" where id = ${entretienId}`).then((r) => r.rows[0] ?? null),
      ),
    ));

  it("assurances_vehicules — tenant A bloqué par RLS", () =>
    expectCrossTenantDenied(() =>
      withTenant(app.db, ctx(A), (tx) =>
        tx.execute(sql`select * from "assurances_vehicules" where id = ${assuranceId}`).then((r) => r.rows[0] ?? null),
      ),
    ));

  it("mouvements_stock — tenant A bloqué par RLS", () =>
    expectCrossTenantDenied(() =>
      withTenant(app.db, ctx(A), (tx) =>
        tx.execute(sql`select * from "mouvements_stock" where id = ${mouvementId}`).then((r) => r.rows[0] ?? null),
      ),
    ));

  it("inventaires_lignes — tenant A bloqué par RLS", () =>
    expectCrossTenantDenied(() =>
      withTenant(app.db, ctx(A), (tx) =>
        tx.execute(sql`select * from "inventaires_lignes" where id = ${inventaireLigneId}`).then((r) => r.rows[0] ?? null),
      ),
    ));

  it("modeles_devis_lignes — tenant A bloqué par RLS", () =>
    expectCrossTenantDenied(() =>
      withTenant(app.db, ctx(A), (tx) =>
        tx.execute(sql`select * from "modeles_devis_lignes" where id = ${modeleDevisLigneId}`).then((r) => r.rows[0] ?? null),
      ),
    ));

  it("lignes_commandes_fournisseurs — tenant A bloqué par RLS", () =>
    expectCrossTenantDenied(() =>
      withTenant(app.db, ctx(A), (tx) =>
        tx.execute(sql`select * from "lignes_commandes_fournisseurs" where id = ${ligneCommandeId}`).then((r) => r.rows[0] ?? null),
      ),
    ));

  it("notes_frais_depenses — tenant A bloqué par RLS", () =>
    expectCrossTenantDenied(() =>
      withTenant(app.db, ctx(A), (tx) =>
        tx.execute(sql`select * from "notes_frais_depenses" where id = ${noteFraisDepenseId}`).then((r) => r.rows[0] ?? null),
      ),
    ));

  it("factures_recurrentes — tenant A bloqué par RLS", () =>
    expectCrossTenantDenied(() =>
      withTenant(app.db, ctx(A), (tx) =>
        tx.execute(sql`select * from "factures_recurrentes" where id = ${factureRecurrenteId}`).then((r) => r.rows[0] ?? null),
      ),
    ));

  it("photos_interventions — tenant A bloqué par RLS", () =>
    expectCrossTenantDenied(() =>
      withTenant(app.db, ctx(A), (tx) =>
        tx.execute(sql`select * from "photos_interventions" where id = ${photoId}`).then((r) => r.rows[0] ?? null),
      ),
    ));

  /* SAME-TENANT: B doit voir ses propres enfants */

  it("contrôle — tenant B lit ses phases_chantier", async () => {
    const r = await withTenant(app.db, ctx(B), (tx) =>
      tx.execute(sql`select id from "phases_chantier" where id = ${phaseId}`),
    );
    expect(r.rows[0]).toBeDefined();
  });

  it("contrôle — tenant B lit ses entretiens_vehicules", async () => {
    const r = await withTenant(app.db, ctx(B), (tx) =>
      tx.execute(sql`select id from "entretiens_vehicules" where id = ${entretienId}`),
    );
    expect(r.rows[0]).toBeDefined();
  });

  it("contrôle — tenant B lit ses mouvements_stock", async () => {
    const r = await withTenant(app.db, ctx(B), (tx) =>
      tx.execute(sql`select id from "mouvements_stock" where id = ${mouvementId}`),
    );
    expect(r.rows[0]).toBeDefined();
  });

  it("contrôle — tenant B lit ses factures_recurrentes", async () => {
    const r = await withTenant(app.db, ctx(B), (tx) =>
      tx.execute(sql`select id from "factures_recurrentes" where id = ${factureRecurrenteId}`),
    );
    expect(r.rows[0]).toBeDefined();
  });
});
