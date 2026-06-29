import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { ClientRepositoryDrizzle } from "./client-repository-drizzle";
import { calculerEncours } from "../application/encours";
import { expectCrossTenantDenied } from "../../../shared/testing";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const A = 997001;
const B = 997002;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });

describe.skipIf(!URL)("ClientRepositoryDrizzle (PG, RLS + scope tenant)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new ClientRepositoryDrizzle(app.db);

  const cleanup = async () => {
    /** demandes_avis avant interventions (FK interventionId). client_portal_sessions sans artisanId. */
    await admin.query('delete from demandes_avis where "artisanId" in ($1,$2)', [A, B]);
    await admin.query('delete from client_portal_sessions where "clientId" in (select id from clients where "artisanId" in ($1,$2))', [A, B]);
    for (const t of [
      "factures", "devis", "interventions", "contrats_maintenance", "rdv_en_ligne", "chantiers",
      "analyses_photos_chantier", "avis_clients", "demandes_contact", "conversations", "client_portal_access",
    ]) {
      await admin.query(`delete from ${t} where "artisanId" in ($1,$2)`, [A, B]);
    }
    await admin.query('delete from clients where "artisanId" in ($1,$2)', [A, B]);
  };

  /** Seede UNE ligne dans CHACUNE des 13 tables référençant clientId (renvoie le nb de tables). */
  const seedToutesTables = async (artisanId: number, clientId: number): Promise<number> => {
    await admin.query('insert into factures ("artisanId","clientId",numero) values ($1,$2,$3)', [artisanId, clientId, `F-${clientId}`]);
    await admin.query('insert into devis ("artisanId","clientId",numero) values ($1,$2,$3)', [artisanId, clientId, `D-${clientId}`]);
    const iv = await admin.query(
      'insert into interventions ("artisanId","clientId",titre,"dateDebut") values ($1,$2,$3,now()) returning id',
      [artisanId, clientId, "Interv"],
    );
    const interventionId = iv.rows[0].id;
    await admin.query(
      'insert into contrats_maintenance ("artisanId","clientId",reference,titre,"montantHT",periodicite,"dateDebut") values ($1,$2,$3,$4,$5,$6,now())',
      [artisanId, clientId, `CT-${clientId}`, "Contrat", "100.00", "mensuel"],
    );
    await admin.query('insert into rdv_en_ligne ("artisanId","clientId",titre,"dateProposee") values ($1,$2,$3,now())', [artisanId, clientId, "RDV"]);
    await admin.query('insert into chantiers ("artisanId","clientId",reference,nom) values ($1,$2,$3,$4)', [artisanId, clientId, `CH-${clientId}`, "Chantier"]);
    await admin.query('insert into analyses_photos_chantier ("artisanId","clientId") values ($1,$2)', [artisanId, clientId]);
    await admin.query('insert into avis_clients ("artisanId","clientId",note) values ($1,$2,5)', [artisanId, clientId]);
    await admin.query('insert into demandes_contact ("artisanId","clientId",nom) values ($1,$2,$3)', [artisanId, clientId, "Demande"]);
    await admin.query(
      'insert into demandes_avis ("artisanId","clientId","interventionId","tokenDemande","expiresAt") values ($1,$2,$3,$4,now())',
      [artisanId, clientId, interventionId, `TOK-${clientId}`],
    );
    await admin.query('insert into conversations ("artisanId","clientId") values ($1,$2)', [artisanId, clientId]);
    await admin.query(
      'insert into client_portal_access ("artisanId","clientId",token,email,"expiresAt") values ($1,$2,$3,$4,now())',
      [artisanId, clientId, `PT-${clientId}`, "p@a.fr"],
    );
    await admin.query('insert into client_portal_sessions ("clientId","sessionToken","expiresAt") values ($1,$2,now())', [clientId, `S-${clientId}`]);
    return 13;
  };

  /** Liste des 13 tables (table, colonne tenant ou null pour client_portal_sessions). */
  const TABLES_CLIENT: ReadonlyArray<readonly [string, string | null]> = [
    ["factures", "artisanId"], ["devis", "artisanId"], ["interventions", "artisanId"],
    ["contrats_maintenance", "artisanId"], ["rdv_en_ligne", "artisanId"], ["chantiers", "artisanId"],
    ["analyses_photos_chantier", "artisanId"], ["avis_clients", "artisanId"], ["demandes_contact", "artisanId"],
    ["demandes_avis", "artisanId"], ["conversations", "artisanId"], ["client_portal_access", "artisanId"],
    ["client_portal_sessions", null],
  ];
  const countPointant = async (table: string, clientId: number): Promise<number> => {
    const r = await admin.query(`select count(*)::int n from ${table} where "clientId"=$1`, [clientId]);
    return r.rows[0].n;
  };

  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("create + getById + list scopés au tenant", async () => {
    const c = await repo.create(ctx(A), { nom: "Durand", prenom: "Marie", email: "marie@example.fr", type: "professionnel" });
    expect(c.id).toBeGreaterThan(0);
    expect(c.artisanId).toBe(A);
    expect(c.type).toBe("professionnel");
    expect((await repo.getById(ctx(A), c.id))?.email).toBe("marie@example.fr");
    expect((await repo.list(ctx(A))).some((x) => x.id === c.id)).toBe(true);
  });

  it("type par défaut = particulier quand absent", async () => {
    const c = await repo.create(ctx(A), { nom: "Sanstype" });
    expect(c.type).toBe("particulier");
  });

  it("isolation cross-tenant : B ne lit/modifie/supprime pas le client de A (PII)", async () => {
    const c = await repo.create(ctx(A), { nom: "Secret", email: "secret@a.fr" });
    await expectCrossTenantDenied(() => repo.getById(ctx(B), c.id));
    expect((await repo.list(ctx(B))).some((x) => x.id === c.id)).toBe(false);
    expect(await repo.update(ctx(B), c.id, { nom: "hack" })).toBeNull();
    expect(await repo.delete(ctx(B), c.id)).toBe(false);
    // A intact (PII non altérée par B)
    const intact = await repo.getById(ctx(A), c.id);
    expect(intact?.nom).toBe("Secret");
    expect(intact?.email).toBe("secret@a.fr");
  });

  it("update : modifie les champs fournis, maj updatedAt, scopé", async () => {
    const c = await repo.create(ctx(A), { nom: "Avant", ville: "Lyon" });
    const maj = await repo.update(ctx(A), c.id, { nom: "Après", telephone: "0102030405" });
    expect(maj?.nom).toBe("Après");
    expect(maj?.telephone).toBe("0102030405");
    expect(maj?.ville).toBe("Lyon"); // champ non fourni préservé
  });

  it("delete : supprime le client, scopé", async () => {
    const c = await repo.create(ctx(A), { nom: "ASupprimer" });
    expect(await repo.delete(ctx(A), c.id)).toBe(true);
    expect(await repo.getById(ctx(A), c.id)).toBeNull();
  });

  it("countDocumentsLies : compte les documents métier du tenant, ignore les autres tenants", async () => {
    const c = await repo.create(ctx(A), { nom: "AvecDocs" });
    // aucun document au départ
    expect(await repo.countDocumentsLies(ctx(A), c.id)).toBe(0);
    // seed 2 factures + 1 devis liés au client de A (colonnes non-null minimales)
    await admin.query(
      `insert into factures ("artisanId","clientId",numero) values ($1,$2,'F-A-1'),($1,$2,'F-A-2')`,
      [A, c.id],
    );
    await admin.query(`insert into devis ("artisanId","clientId",numero) values ($1,$2,'D-A-1')`, [A, c.id]);
    expect(await repo.countDocumentsLies(ctx(A), c.id)).toBe(3);
    // un document d'un AUTRE tenant pointant un id de client identique ne doit pas compter
    expect(await repo.countDocumentsLies(ctx(B), c.id)).toBe(0);
    // nettoyage des documents seedés
    await admin.query('delete from factures where "artisanId"=$1', [A]);
    await admin.query('delete from devis where "artisanId"=$1', [A]);
  });

  it("search : trouve par nom/e-mail scopé tenant ; un `%` est littéral (pas d'injection LIKE)", async () => {
    await repo.create(ctx(A), { nom: "Lefebvre", email: "lefebvre@a.fr" });
    await repo.create(ctx(A), { nom: "a%b", email: "wild@a.fr" });
    await repo.create(ctx(B), { nom: "Lefebvre", email: "lefebvre@b.fr" }); // homonyme chez B
    // recherche par sous-chaîne (case-insensitive)
    expect((await repo.search(ctx(A), "lefeb")).map((c) => c.nom)).toEqual(["Lefebvre"]);
    // scope : le Lefebvre de B n'apparaît pas pour A
    expect((await repo.search(ctx(A), "lefebvre")).every((c) => c.artisanId === A)).toBe(true);
    // `%` traité littéralement : ne renvoie QUE le client contenant `%`, pas tout le tenant
    const wild = await repo.search(ctx(A), "%");
    expect(wild.map((c) => c.nom)).toEqual(["a%b"]);
  });

  it("listFacturesPourEncours : lignes scopées tenant ; encours = somme attendue, factures d'un autre tenant exclues", async () => {
    const cA = await repo.create(ctx(A), { nom: "Débiteur A" });
    // 2 factures envoyées (impayée + partielle) + 1 payée (exclue) du client A
    await admin.query(
      `insert into factures ("artisanId","clientId",numero,statut,"totalTTC","montantPaye") values
        ($1,$2,'F-E-1','envoyee','100.00','0.00'),
        ($1,$2,'F-E-2','envoyee','50.00','20.00'),
        ($1,$2,'F-E-3','payee','999.00','0.00')`,
      [A, cA.id],
    );
    // une facture d'un AUTRE tenant ne doit pas être visible
    const cB = await repo.create(ctx(B), { nom: "Débiteur B" });
    await admin.query(`insert into factures ("artisanId","clientId",numero,statut,"totalTTC") values ($1,$2,'F-B-1','envoyee','777.00')`, [B, cB.id]);

    const rows = await repo.listFacturesPourEncours(ctx(A), cA.id);
    const enc = calculerEncours(rows, Date.now());
    expect(enc.encoursTotal).toBe("130.00"); // 100 + (50−20), payée exclue
    expect(enc.nbFacturesImpayees).toBe(2);

    // depuis le tenant A, on ne voit jamais les factures de B
    const tousA = await repo.listFacturesPourEncours(ctx(A));
    expect(tousA.some((r) => Number(r.totalTTC) === 777)).toBe(false);

    await admin.query('delete from factures where "artisanId" in ($1,$2)', [A, B]);
  });

  it("fusionner : re-pointe CHAQUE table vers le survivant, complète ses champs, archive le doublon, idempotent", async () => {
    /** Survivant volontairement incomplet ; doublon riche → on observe la complétion de champs. */
    const survivant = await repo.create(ctx(A), { nom: "Dupont" });
    const doublon = await repo.create(ctx(A), {
      nom: "Dupont", email: "dupont@example.fr", telephone: "0102030405", ville: "Lyon", type: "professionnel",
    });
    await seedToutesTables(A, doublon.id);

    /** Pré-condition : tout pointe vers le doublon, rien vers le survivant. */
    for (const [t] of TABLES_CLIENT) {
      expect(await countPointant(t, doublon.id)).toBe(1);
      expect(await countPointant(t, survivant.id)).toBe(0);
    }

    const fusionne = await repo.fusionner(ctx(A), survivant.id, doublon.id);
    expect(fusionne).not.toBeNull();

    /** Data-integrity : AUCUNE ligne ne pointe plus vers le doublon ; tout est sur le survivant. */
    for (const [t] of TABLES_CLIENT) {
      expect(await countPointant(t, doublon.id)).toBe(0);
      expect(await countPointant(t, survivant.id)).toBe(1);
    }

    /** Champs complétés depuis le doublon (le survivant était vide), type le plus précis conservé. */
    expect(fusionne?.email).toBe("dupont@example.fr");
    expect(fusionne?.telephone).toBe("0102030405");
    expect(fusionne?.ville).toBe("Lyon");
    expect(fusionne?.type).toBe("professionnel");
    expect(fusionne?.nom).toBe("Dupont");

    /** Doublon archivé (jamais supprimé) : exclu de list, survivant présent, archivedAt non nul. */
    const liste = await repo.list(ctx(A));
    expect(liste.some((c) => c.id === doublon.id)).toBe(false);
    expect(liste.some((c) => c.id === survivant.id)).toBe(true);
    const arch = await admin.query('select "archivedAt" from clients where id=$1', [doublon.id]);
    expect(arch.rows[0].archivedAt).not.toBeNull();

    /** Idempotent : re-fusionner ne change rien (ni double archivage, ni re-déplacement). */
    const archAvant = arch.rows[0].archivedAt;
    const refusionne = await repo.fusionner(ctx(A), survivant.id, doublon.id);
    expect(refusionne).not.toBeNull();
    for (const [t] of TABLES_CLIENT) {
      expect(await countPointant(t, survivant.id)).toBe(1);
      expect(await countPointant(t, doublon.id)).toBe(0);
    }
    const arch2 = await admin.query('select "archivedAt" from clients where id=$1', [doublon.id]);
    expect(arch2.rows[0].archivedAt.getTime()).toBe(archAvant.getTime());
  });

  it("listByIds : renvoie le batch exact, respecte le scope tenant, ids vide → []", async () => {
    const c1 = await repo.create(ctx(A), { nom: "Alpha" });
    await repo.create(ctx(A), { nom: "Beta" });
    const c3 = await repo.create(ctx(A), { nom: "Gamma" });
    const cB = await repo.create(ctx(B), { nom: "CrossTenant" });

    /** Batch partiel : seulement c1 et c3 (pas Beta). */
    const res = await repo.listByIds(ctx(A), [c1.id, c3.id]);
    expect(res.map((c) => c.id).sort()).toEqual([c1.id, c3.id].sort());

    /** Cross-tenant : l'ID de B dans un batch A → absent du résultat. */
    const avecB = await repo.listByIds(ctx(A), [c1.id, cB.id]);
    expect(avecB.map((c) => c.id)).not.toContain(cB.id);
    expect(avecB.map((c) => c.id)).toContain(c1.id);

    /** ids vide → [] sans requête DB. */
    expect(await repo.listByIds(ctx(A), [])).toEqual([]);
  });

  it("fusionner : isolation RLS — refus de fusionner vers/depuis le client d'un autre tenant", async () => {
    const survivantA = await repo.create(ctx(A), { nom: "Survivant A" });
    const doublonA = await repo.create(ctx(A), { nom: "Doublon A" });
    const clientB = await repo.create(ctx(B), { nom: "Client B" });
    await seedToutesTables(A, doublonA.id);

    /** B tente de fusionner les clients de A → null (clients invisibles), rien n'est touché. */
    expect(await repo.fusionner(ctx(B), survivantA.id, doublonA.id)).toBeNull();
    /** A tente de fusionner un doublon appartenant à B → null (cross-tenant refusé). */
    expect(await repo.fusionner(ctx(A), survivantA.id, clientB.id)).toBeNull();
    /** A tente de réaffecter vers le survivant de B → null. */
    expect(await repo.fusionner(ctx(A), clientB.id, doublonA.id)).toBeNull();

    /** Aucune réaffectation : tout l'historique de doublonA est resté sur doublonA, rien archivé. */
    for (const [t] of TABLES_CLIENT) {
      expect(await countPointant(t, doublonA.id)).toBe(1);
    }
    const arch = await admin.query('select "archivedAt" from clients where id=$1', [doublonA.id]);
    expect(arch.rows[0].archivedAt).toBeNull();
    expect((await repo.list(ctx(A))).some((c) => c.id === doublonA.id)).toBe(true);
  });
});
