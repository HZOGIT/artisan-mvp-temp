import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { PublicArticleSearchReaderDrizzle } from "./public-article-search-drizzle";

const URL = process.env.DATABASE_URL;
const M = "Zmark61search"; // marqueur unique → isole des données existantes du catalogue global

// L2 (HORS RLS) : recherche dans le catalogue public `bibliotheque_articles` (global, pas de tenant).
// Vérifie le filtre visible=true, l'ILIKE sur nom/description/categorie, les filtres optionnels
// (metier/categorie/sousCategorie) et le tri par nom asc. Données isolées par un marqueur unique.
describe.skipIf(!URL)("PublicArticleSearchReaderDrizzle (catalogue public, hors RLS)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(URL!);
  const reader = new PublicArticleSearchReaderDrizzle(app.db);

  const seed = (nom: string, opts: { metier?: string; categorie?: string; sous?: string; visible?: boolean; description?: string }) =>
    admin.query(
      'insert into bibliotheque_articles (metier,categorie,sous_categorie,nom,description,prix_base,unite,visible) values ($1,$2,$3,$4,$5,$6,$7,$8)',
      [opts.metier ?? "plomberie", opts.categorie ?? `${M}cat`, opts.sous ?? `${M}ss`, nom, opts.description ?? null, "10.00", "u", opts.visible ?? true],
    );

  const cleanup = () => admin.query("delete from bibliotheque_articles where nom ilike $1 or categorie ilike $1 or description ilike $1", [`%${M}%`]);

  beforeAll(async () => {
    await cleanup();
    await seed(`${M} Alpha`, { metier: "plomberie", categorie: `${M}foo`, sous: `${M}s1` });
    await seed(`${M} Beta`, { metier: "electricite", categorie: `${M}bar`, sous: `${M}s2` });
    await seed(`${M} Hidden`, { metier: "plomberie", categorie: `${M}foo`, visible: false }); // exclu
    await seed("Znomatch61", { categorie: `${M}desc`, description: `contient ${M} dans la description` }); // match via description
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("search : visible=true + ILIKE nom/description, exclut les non-visibles, tri par nom asc", async () => {
    const noms = (await reader.search(M, {})).map((r) => r.nom);
    expect(noms).toEqual([`${M} Alpha`, `${M} Beta`, "Znomatch61"]); // tri asc, Hidden exclu, match desc inclus
  });

  it("filtre metier : ne renvoie que la catégorie métier demandée", async () => {
    const r = await reader.search(M, { metier: "electricite" });
    expect(r.map((x) => x.nom)).toEqual([`${M} Beta`]);
  });

  it("filtre categorie : narrow + exclut le non-visible de la même catégorie", async () => {
    const r = await reader.search(M, { categorie: `${M}foo` });
    expect(r.map((x) => x.nom)).toEqual([`${M} Alpha`]); // Hidden (Zfoo, visible=false) exclu
  });

  it("filtre sousCategorie : matche la sous-catégorie exacte", async () => {
    const r = await reader.search(M, { sousCategorie: `${M}s2` });
    expect(r.map((x) => x.nom)).toEqual([`${M} Beta`]);
  });
});
