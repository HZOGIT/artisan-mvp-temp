import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { DevisIARepositoryDrizzle } from "./devis-ia-repository-drizzle";
import type { TenantContext } from "../../../shared/tenant";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const UID_A = 9948191;
const UID_B = 9948192;
const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 0 });

// L2 RLS : repository devis-IA. `analyses_photos_chantier` SOUS RLS (artisanId) ; tables filles (photos
// /résultats/suggestions, sans artisanId) lues/écrites uniquement pour des analyses du tenant déjà
// résolues → anti-IDOR par le parent. Vérifie le cycle analyse + photos + résultats + suggestions, le
// détail enrichi, l'ownership (addPhoto/listPhotoUrls) et l'anti-IDOR de updateSuggestionOwned (chaîne).
describe.skipIf(!URL)("DevisIARepositoryDrizzle (RLS analyses + chaîne anti-IDOR)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const repo = new DevisIARepositoryDrizzle(app.db);
  let artisanA = 0;
  let artisanB = 0;
  let clientA = 0;

  const cleanup = async () => {
    const uids = [UID_A, UID_B];
    const sub = 'in (select id from artisans where "userId" = any($1))';
    const an = `in (select id from analyses_photos_chantier where "artisanId" ${sub})`;
    const res = `in (select id from resultats_analyse_ia where "analyseId" ${an})`;
    await admin.query(`delete from suggestions_articles_ia where "resultatId" ${res}`, [uids]);
    await admin.query(`delete from resultats_analyse_ia where "analyseId" ${an}`, [uids]);
    await admin.query(`delete from photos_analyse where "analyseId" ${an}`, [uids]);
    await admin.query(`delete from devis_genere_ia where "analyseId" ${an}`, [uids]);
    await admin.query(`delete from analyses_photos_chantier where "artisanId" ${sub}`, [uids]);
    await admin.query(`delete from clients where "artisanId" ${sub}`, [uids]);
    await admin.query('delete from artisans where "userId" = any($1)', [uids]);
  };

  beforeAll(async () => {
    await cleanup();
    artisanA = (await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UID_A, "IA A"])).rows[0].id;
    artisanB = (await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [UID_B, "IA B"])).rows[0].id;
    clientA = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [artisanA, "C"])).rows[0].id;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("createAnalyse / listAnalyses / getAnalyseOwned : scopé tenant + anti-IDOR", async () => {
    const a = await repo.createAnalyse(ctx(artisanA), { clientId: clientA, titre: "Chantier", description: "SDB" });
    expect(a.titre).toBe("Chantier");
    expect((await repo.listAnalyses(ctx(artisanA))).some((x) => x.id === a.id)).toBe(true);
    expect((await repo.getAnalyseOwned(ctx(artisanA), a.id))?.id).toBe(a.id);
    expect(await repo.getAnalyseOwned(ctx(artisanB), a.id)).toBeNull(); // anti-IDOR
    expect(await repo.listAnalyses(ctx(artisanB))).toEqual([]);
  });

  it("addPhoto / listPhotoUrls : ownership de l'analyse (B → null/[]) ; tri par ordre", async () => {
    const a = await repo.createAnalyse(ctx(artisanA), { clientId: clientA, titre: "Photos" });
    expect(await repo.addPhoto(ctx(artisanB), a.id, { url: "http://x/intrus.jpg" })).toBeNull(); // anti-IDOR : pas d'insert
    await repo.addPhoto(ctx(artisanA), a.id, { url: "http://x/2.jpg", ordre: 2 });
    await repo.addPhoto(ctx(artisanA), a.id, { url: "http://x/1.jpg", ordre: 1 });
    expect(await repo.listPhotoUrls(ctx(artisanA), a.id)).toEqual(["http://x/1.jpg", "http://x/2.jpg"]);
    expect(await repo.listPhotoUrls(ctx(artisanB), a.id)).toEqual([]); // anti-IDOR
  });

  it("saveResultat + saveSuggestion + getAnalyseDetail : détail enrichi (résultats→suggestions)", async () => {
    const a = await repo.createAnalyse(ctx(artisanA), { clientId: clientA, titre: "Detail" });
    const resId = await repo.saveResultat(ctx(artisanA), { analyseId: a.id, typeTravauxDetecte: "Plomberie", descriptionTravaux: "Fuite", urgence: "haute", confiance: "0.90", rawResponse: { ok: true } });
    await repo.saveSuggestion(ctx(artisanA), { resultatId: resId, articleId: null, nomArticle: "Joint", description: "Joint torique", quantiteSuggeree: "2.00", unite: "u", prixEstime: "5.00", confiance: "0.80" });
    const detail = await repo.getAnalyseDetail(ctx(artisanA), a.id);
    expect(detail?.resultats).toHaveLength(1);
    expect(detail?.resultats[0].typeTravauxDetecte).toBe("Plomberie");
    expect(detail?.resultats[0].suggestions[0].nomArticle).toBe("Joint");
    expect(await repo.getAnalyseDetail(ctx(artisanB), a.id)).toBeNull(); // anti-IDOR
  });

  it("updateSuggestionOwned : anti-IDOR via la chaîne suggestion→résultat→analyse(tenant)", async () => {
    const a = await repo.createAnalyse(ctx(artisanA), { clientId: clientA, titre: "Sugg" });
    const resId = await repo.saveResultat(ctx(artisanA), { analyseId: a.id, typeTravauxDetecte: "T", descriptionTravaux: "D", urgence: "moyenne", confiance: "0.5", rawResponse: {} });
    await repo.saveSuggestion(ctx(artisanA), { resultatId: resId, articleId: null, nomArticle: "S", description: "d", quantiteSuggeree: "1.00", unite: "u", prixEstime: "10.00", confiance: "0.7" });
    const detail = await repo.getAnalyseDetail(ctx(artisanA), a.id);
    const suggId = detail!.resultats[0].suggestions[0].id;
    // B ne peut pas modifier la suggestion (chaîne hors tenant) → null, pas d'écriture
    expect(await repo.updateSuggestionOwned(ctx(artisanB), suggId, { selectionne: true })).toBeNull();
    // A modifie → selectionne=true persisté
    const updated = await repo.updateSuggestionOwned(ctx(artisanA), suggId, { selectionne: true, prixEstime: "12.00" });
    expect(updated?.selectionne).toBe(true);
    expect(updated?.prixEstime).toBe("12.00");
  });
});
