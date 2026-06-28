import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { VitrinePublicReaderDrizzle } from "./vitrine-public-reader-drizzle";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const UID_A = 9958291;
const UID_B = 9958292;
const SLUG_A = "vitrine-a-9958291";

// L2 : lecture publique de la vitrine. `artisans` HORS RLS (résolution par slug) ; les autres tables
// (parametres/avis/clients/interventions/articles) SOUS RLS, lues sous le scope de l'artisan résolu.
// Vérifie résolution slug, params, avis publiés (filtre+tri+nom), stats (terminée only), catégories.
describe.skipIf(!URL)("VitrinePublicReaderDrizzle (lecture publique, RLS scopée par slug)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const reader = new VitrinePublicReaderDrizzle(app.db);
  let artisanA = 0;
  let artisanB = 0;

  const cleanup = async () => {
    const uids = [UID_A, UID_B];
    const sub = 'in (select id from artisans where "userId" = any($1))';
    for (const t of ["avis_clients", "articles_artisan", "interventions", "clients", "parametres_artisan"]) {
      await admin.query(`delete from ${t} where "artisanId" ${sub}`, [uids]);
    }
    await admin.query('delete from artisans where "userId" = any($1)', [uids]);
  };

  beforeAll(async () => {
    await cleanup();
    artisanA = (await admin.query('insert into artisans ("userId","nomEntreprise",ville,slug,specialite) values ($1,$2,$3,$4,$5) returning id', [UID_A, "Vitrine A", "Lyon", SLUG_A, "plomberie"])).rows[0].id;
    artisanB = (await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UID_B, "Vitrine B (no params)"])).rows[0].id;
    await admin.query('insert into parametres_artisan ("artisanId","vitrineActive","vitrineDescription","vitrineExperience") values ($1,true,$2,$3)', [artisanA, "Artisan de confiance", 12]);
    const c1 = (await admin.query('insert into clients ("artisanId",nom,prenom) values ($1,$2,$3) returning id', [artisanA, "Petit", "Marc"])).rows[0].id;
    const c2 = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [artisanA, "Grand"])).rows[0].id;
    const iA = (await admin.query('insert into interventions ("artisanId","clientId",titre,"dateDebut",statut) values ($1,$2,$3,$4,$5) returning id', [artisanA, c1, "Fuite", "2026-06-01T08:00:00Z", "terminee"])).rows[0].id;
    // avis : un publié avec interventionId (vérifié), un masque (exclu), un en_attente (exclu)
    await admin.query('insert into avis_clients ("artisanId","clientId","interventionId",note,commentaire,statut,"createdAt") values ($1,$2,$3,5,$4,$5,$6)', [artisanA, c1, iA, "Super", "publie", "2026-06-10T10:00:00Z"]);
    await admin.query('insert into avis_clients ("artisanId","clientId",note,statut) values ($1,$2,2,$3)', [artisanA, c2, "masque"]);
    await admin.query('insert into avis_clients ("artisanId","clientId",note,statut) values ($1,$2,2,$3)', [artisanA, c2, "en_attente"]);
    // interventions : une terminée (comptée) + une planifiée (exclue des stats)
    await admin.query('insert into interventions ("artisanId","clientId",titre,"dateDebut",statut) values ($1,$2,$3,$4,$5)', [artisanA, c1, "I1", "2026-06-01T08:00:00Z", "terminee"]);
    await admin.query('insert into interventions ("artisanId","clientId",titre,"dateDebut",statut) values ($1,$2,$3,$4,$5)', [artisanA, c2, "I2", "2026-06-02T08:00:00Z", "planifiee"]);
    // articles : 2 catégories distinctes + 1 sans catégorie
    await admin.query('insert into articles_artisan ("artisanId",reference,designation,"prixUnitaireHT",categorie) values ($1,$2,$3,$4,$5),($1,$6,$7,$8,$9),($1,$10,$11,$12,null)', [artisanA, "R1", "A1", "10.00", "Plomberie", "R2", "A2", "20.00", "Chauffage", "R3", "A3", "30.00"]);
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("getArtisanBySlug : résout l'artisan par slug ; slug inconnu → null", async () => {
    const a = await reader.getArtisanBySlug(SLUG_A);
    expect(a?.id).toBe(artisanA);
    expect(a?.nomEntreprise).toBe("Vitrine A");
    expect(a?.ville).toBe("Lyon");
    expect(await reader.getArtisanBySlug("slug-inexistant-zzz")).toBeNull();
  });

  it("getVitrineParams : params de l'artisan ; artisan sans params → null", async () => {
    const p = await reader.getVitrineParams(artisanA);
    expect(p?.vitrineActive).toBe(true);
    expect(p?.vitrineDescription).toBe("Artisan de confiance");
    expect(p?.vitrineExperience).toBe(12);
    expect(await reader.getVitrineParams(artisanB)).toBeNull();
  });

  it("getPublishedAvis : publie seul exposé (masque+en_attente exclus), verifie+date présents", async () => {
    const avis = await reader.getPublishedAvis(artisanA);
    expect(avis).toHaveLength(1); // masque + en_attente exclus
    expect(avis[0].note).toBe(5);
    expect(avis[0].clientNom).toBe("Marc Petit");
    expect(avis[0].verifie).toBe(true); // avis vérifié (lié à une intervention réelle)
    expect(avis[0].createdAt).toBeInstanceOf(Date);
  });

  it("getPublishedAvis : avis sans interventionId → interventionId null (non vérifié)", async () => {
    const c3 = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [artisanA, "Sans"])).rows[0].id;
    await admin.query('insert into avis_clients ("artisanId","clientId",note,statut) values ($1,$2,4,$3)', [artisanA, c3, "publie"]);
    const avis = await reader.getPublishedAvis(artisanA);
    const nonVerifie = avis.find((a) => a.clientNom === "Sans");
    expect(nonVerifie?.verifie).toBe(false);
    await admin.query('delete from avis_clients where "artisanId"=$1 and "clientId"=$2', [artisanA, c3]);
    await admin.query('delete from clients where id=$1', [c3]);
  });

  it("getPublicStats : total clients + interventions terminées uniquement", async () => {
    const stats = await reader.getPublicStats(artisanA);
    expect(stats.totalClients).toBe(2);
    expect(stats.totalInterventions).toBe(2); // iA (seed avis) + I1, toutes deux terminées
  });

  it("getArticleCategories : catégories distinctes non nulles", async () => {
    const cats = (await reader.getArticleCategories(artisanA)).sort();
    expect(cats).toEqual(["Chauffage", "Plomberie"]);
  });
});
