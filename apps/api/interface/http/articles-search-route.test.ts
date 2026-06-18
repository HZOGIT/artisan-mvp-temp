import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { buildApp } from "../../app";
import { isSearchable } from "../../modules/articles/application/public-article-search";

const URL = process.env.DATABASE_URL;
const METIER = "plomberie_test_9991161";

describe("isSearchable (pur)", () => {
  it("< 2 caractères → false", () => {
    expect(isSearchable("a")).toBe(false);
    expect(isSearchable(" ")).toBe(false);
    expect(isSearchable("ab")).toBe(true);
  });
});

// E2E `GET /api/articles/search` (catalogue public, sans auth) via le routeur monté.
describe.skipIf(!URL)("GET /api/articles/search (catalogue public)", () => {
  const admin = new Pool({ connectionString: URL });
  let app: ReturnType<typeof buildApp>;

  const cleanup = () => admin.query("delete from bibliotheque_articles where metier = $1", [METIER]);

  beforeAll(async () => {
    await cleanup();
    await admin.query('insert into bibliotheque_articles (metier,categorie,sous_categorie,nom,description,prix_base,unite,visible) values ($1,$2,$3,$4,$5,$6,$7,$8)', [METIER, "Sanitaire", "Robinetterie", "Mitigeur lavabo zztest", "Mitigeur chrome", "89.90", "u", true]);
    await admin.query('insert into bibliotheque_articles (metier,categorie,sous_categorie,nom,description,prix_base,unite,visible) values ($1,$2,$3,$4,$5,$6,$7,$8)', [METIER, "Sanitaire", "Robinetterie", "Article masque zztest", "Caché", "10.00", "u", false]);
    app = buildApp();
  });
  afterAll(async () => {
    await app?.close();
    await cleanup();
    await admin.end();
  });

  it("q < 2 caractères → [] (pas de requête DB)", async () => {
    const res = await app.inject({ method: "GET", url: "/api/articles/search?q=a" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("q valide → résultats (forme snake_case) ; non visibles exclus", async () => {
    const res = await app.inject({ method: "GET", url: `/api/articles/search?q=zztest&metier=${METIER}` });
    expect(res.statusCode).toBe(200);
    const rows = res.json() as Array<{ nom: string; prix_base: string; sous_categorie: string }>;
    expect(rows.map((r) => r.nom)).toContain("Mitigeur lavabo zztest");
    expect(rows.map((r) => r.nom)).not.toContain("Article masque zztest"); // visible=false exclu
    expect(rows[0]).toHaveProperty("prix_base");
    expect(rows[0]).toHaveProperty("sous_categorie");
  });

  it("filtre sous_categorie", async () => {
    const res = await app.inject({ method: "GET", url: `/api/articles/search?q=zztest&metier=${METIER}&sous_categorie=Robinetterie` });
    expect((res.json() as unknown[]).length).toBeGreaterThanOrEqual(1);
    const res2 = await app.inject({ method: "GET", url: `/api/articles/search?q=zztest&metier=${METIER}&sous_categorie=Inexistante` });
    expect(res2.json()).toEqual([]);
  });
});
