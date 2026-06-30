import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../db/client";
import { RgpdExportReaderDrizzle } from "./rgpd-export-reader-drizzle";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const UA = 999201;
const AA = 999201;
const UB = 999202;
const AB = 999202;

describe.skipIf(!URL)("RgpdExportReaderDrizzle — complétude + isolation tenant (Art.20)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const reader = new RgpdExportReaderDrizzle(app.db);

  let clientA: number, clientB: number;
  let technicienA: number, technicienB: number;
  let fournisseurA: number, fournisseurB: number;
  let demandeA: number;
  let deplacementA: number, deplacementB: number;
  let contratA: number;
  let conversationA: number, conversationB: number;
  let messageA: number, messageB: number;
  let avisA: number;
  let commandeA: number, commandeB: number;
  let ligneA: number, ligneB: number;
  let emailA: number;

  const cleanup = async () => {
    await admin.query("delete from emails_log where \"artisanId\" in ($1,$2)", [AA, AB]);
    await admin.query("delete from lignes_commandes_fournisseurs where \"commandeId\" in (select id from commandes_fournisseurs where \"artisanId\" in ($1,$2))", [AA, AB]);
    await admin.query("delete from commandes_fournisseurs where \"artisanId\" in ($1,$2)", [AA, AB]);
    await admin.query("delete from fournisseurs where \"artisanId\" in ($1,$2)", [AA, AB]);
    await admin.query("delete from avis_clients where \"artisanId\" in ($1,$2)", [AA, AB]);
    await admin.query("delete from messages where \"conversationId\" in (select id from conversations where \"artisanId\" in ($1,$2))", [AA, AB]);
    await admin.query("delete from conversations where \"artisanId\" in ($1,$2)", [AA, AB]);
    await admin.query("delete from contrats_maintenance where \"artisanId\" in ($1,$2)", [AA, AB]);
    await admin.query("delete from historique_deplacements where \"technicienId\" in (select id from techniciens where \"artisanId\" in ($1,$2))", [AA, AB]);
    await admin.query("delete from techniciens where \"artisanId\" in ($1,$2)", [AA, AB]);
    await admin.query("delete from demandes_contact where \"artisanId\" in ($1,$2)", [AA, AB]);
    await admin.query("delete from clients where \"artisanId\" in ($1,$2)", [AA, AB]);
    await admin.query("delete from artisans where id in ($1,$2)", [AA, AB]);
    await admin.query("delete from users where id in ($1,$2)", [UA, UB]);
  };

  beforeAll(async () => {
    await cleanup();

    for (const [uid, aid] of [[UA, AA], [UB, AB]] as [number, number][]) {
      await admin.query(
        `insert into users (id, "openId", email) values ($1,$2,$3) on conflict do nothing`,
        [uid, `test-rgpd-${uid}`, `rgpd-test-${uid}@test.invalid`],
      );
      await admin.query(
        `insert into artisans (id, "userId", "nomEntreprise") values ($1,$2,$3)`,
        [aid, uid, `Test RGPD ${aid}`],
      );
    }

    clientA = (await admin.query(`insert into clients ("artisanId", nom) values ($1,'Client A') returning id`, [AA])).rows[0].id;
    clientB = (await admin.query(`insert into clients ("artisanId", nom) values ($1,'Client B') returning id`, [AB])).rows[0].id;

    demandeA = (await admin.query(`insert into demandes_contact ("artisanId", nom, email) values ($1,'Prospect A','p@a.test') returning id`, [AA])).rows[0].id;

    technicienA = (await admin.query(`insert into techniciens ("artisanId", nom) values ($1,'Tech A') returning id`, [AA])).rows[0].id;
    technicienB = (await admin.query(`insert into techniciens ("artisanId", nom) values ($1,'Tech B') returning id`, [AB])).rows[0].id;

    deplacementA = (await admin.query(`insert into historique_deplacements ("technicienId","dateDebut") values ($1,now()) returning id`, [technicienA])).rows[0].id;
    deplacementB = (await admin.query(`insert into historique_deplacements ("technicienId","dateDebut") values ($1,now()) returning id`, [technicienB])).rows[0].id;

    contratA = (await admin.query(
      `insert into contrats_maintenance ("artisanId","clientId",reference,titre,"montantHT",periodicite,"dateDebut") values ($1,$2,'REF-A','Contrat A','100.00','annuel',now()) returning id`,
      [AA, clientA],
    )).rows[0].id;

    conversationA = (await admin.query(`insert into conversations ("artisanId","clientId") values ($1,$2) returning id`, [AA, clientA])).rows[0].id;
    conversationB = (await admin.query(`insert into conversations ("artisanId","clientId") values ($1,$2) returning id`, [AB, clientB])).rows[0].id;

    messageA = (await admin.query(`insert into messages ("conversationId",auteur,contenu) values ($1,'artisan','Bonjour A') returning id`, [conversationA])).rows[0].id;
    messageB = (await admin.query(`insert into messages ("conversationId",auteur,contenu) values ($1,'artisan','Bonjour B') returning id`, [conversationB])).rows[0].id;

    avisA = (await admin.query(`insert into avis_clients ("artisanId","clientId",note) values ($1,$2,5) returning id`, [AA, clientA])).rows[0].id;

    fournisseurA = (await admin.query(`insert into fournisseurs ("artisanId",nom) values ($1,'Fourni A') returning id`, [AA])).rows[0].id;
    fournisseurB = (await admin.query(`insert into fournisseurs ("artisanId",nom) values ($1,'Fourni B') returning id`, [AB])).rows[0].id;

    commandeA = (await admin.query(`insert into commandes_fournisseurs ("artisanId","fournisseurId",numero) values ($1,$2,'CMD-A') returning id`, [AA, fournisseurA])).rows[0].id;
    commandeB = (await admin.query(`insert into commandes_fournisseurs ("artisanId","fournisseurId",numero) values ($1,$2,'CMD-B') returning id`, [AB, fournisseurB])).rows[0].id;

    ligneA = (await admin.query(`insert into lignes_commandes_fournisseurs ("commandeId",designation,quantite) values ($1,'Vis A','10') returning id`, [commandeA])).rows[0].id;
    ligneB = (await admin.query(`insert into lignes_commandes_fournisseurs ("commandeId",designation,quantite) values ($1,'Vis B','10') returning id`, [commandeB])).rows[0].id;

    emailA = (await admin.query(`insert into emails_log ("artisanId",destinataire,sujet,statut) values ($1,'a@test.invalid','Test','envoye') returning id`, [AA])).rows[0].id;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("exporte toutes les entités PII de A avec des données réelles (length >= 1, ids attendus)", async () => {
    const r = await reader.read(AA, UA);

    expect(r.demandesContact.length).toBeGreaterThanOrEqual(1);
    expect(r.demandesContact.map((d) => d.id)).toContain(demandeA);

    expect(r.deplacements.length).toBeGreaterThanOrEqual(1);
    expect(r.deplacements.map((d) => d.id)).toContain(deplacementA);

    expect(r.contratsMaintenance.length).toBeGreaterThanOrEqual(1);
    expect(r.contratsMaintenance.map((d) => d.id)).toContain(contratA);

    expect(r.conversations.length).toBeGreaterThanOrEqual(1);
    const convA = r.conversations.find((c) => c.id === conversationA);
    expect(convA).toBeDefined();
    const msgs = (convA as Record<string, unknown[]>).messages as { id: number }[];
    expect(msgs.map((m) => m.id)).toContain(messageA);

    expect(r.avisClients.length).toBeGreaterThanOrEqual(1);
    expect(r.avisClients.map((d) => d.id)).toContain(avisA);

    expect(r.commandesFournisseurs.length).toBeGreaterThanOrEqual(1);
    const cmdA = r.commandesFournisseurs.find((c) => c.id === commandeA);
    expect(cmdA).toBeDefined();
    const lignes = (cmdA as Record<string, unknown[]>).lignes as { id: number }[];
    expect(lignes.map((l) => l.id)).toContain(ligneA);

    expect(r.emailsLog.length).toBeGreaterThanOrEqual(1);
    expect(r.emailsLog.map((d) => d.id)).toContain(emailA);
  });

  it("isolation cross-tenant : l'export de A n'expose AUCUNE donnée de B (tables directes et indirectes)", async () => {
    const r = await reader.read(AA, UA);

    expect(r.demandesContact.map((d) => d.artisanId)).not.toContain(AB);
    expect(r.deplacements.map((d) => d.id)).not.toContain(deplacementB);
    expect(r.deplacements.map((d) => d.technicienId)).not.toContain(technicienB);
    expect(r.contratsMaintenance.map((d) => d.artisanId)).not.toContain(AB);
    expect(r.conversations.map((c) => c.id)).not.toContain(conversationB);
    const allMessages = r.conversations.flatMap((c) => (c as Record<string, unknown[]>).messages as { id: number }[]);
    expect(allMessages.map((m) => m.id)).not.toContain(messageB);
    expect(r.avisClients.map((d) => d.artisanId)).not.toContain(AB);
    expect(r.commandesFournisseurs.map((c) => c.id)).not.toContain(commandeB);
    const allLignes = r.commandesFournisseurs.flatMap((c) => (c as Record<string, unknown[]>).lignes as { id: number }[]);
    expect(allLignes.map((l) => l.id)).not.toContain(ligneB);
    expect(r.emailsLog.map((d) => d.artisanId)).not.toContain(AB);
  });
});
