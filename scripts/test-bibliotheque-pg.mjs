// scripts/test-bibliotheque-pg.mjs — OPE-184 P0.7e-5 — bibliothèque articles (catalogue public) sur PG.
// searchBibliothequeArticles (ilike nom/desc/cat + filtres metier/cat/sous-cat, visible only, limit 10),
// getBibliothequeCategories (DISTINCT categorie/sous_categorie par métier).
import { searchBibliothequeArticles, getBibliothequeCategories, getDb } from "../server/db.ts";
import { bibliothequeArticles } from "../drizzle/schema.active.ts";
import { inArray } from "drizzle-orm";

let ok = true;
const check = (label, cond) => { console.log(`${cond ? "✅" : "❌"} ${label}`); if (!cond) ok = false; };
const TAG = "ZZTEST";
const ids = [];

try {
  const db = await getDb();
  const mk = async (nom, description, metier, categorie, sous_categorie, visible) => {
    const [r] = await db.insert(bibliothequeArticles).values({
      nom: `${TAG}-${nom}`, description, metier, categorie, sous_categorie,
      prix_base: "50.00", unite: "u", duree_moyenne_minutes: 30, visible,
    }).returning({ id: bibliothequeArticles.id });
    ids.push(r.id);
  };

  await mk("Robinet", "Robinet mitigeur chrome", "plombier", "Robinetterie", "Cuisine", true);
  await mk("Tuyau", "Tuyau PER pour ZZTEST plomberie", "plombier", "Tuyauterie", "PER", true);
  await mk("Cable", "Cable electrique", "electricien", "Cablage", "Souple", true);
  await mk("Invisible", "Article ZZTEST cache", "plombier", "Robinetterie", "Cuisine", false);

  // recherche par nom (ilike insensible casse)
  let res = await searchBibliothequeArticles("zztest-robinet");
  check(`recherche 'zztest-robinet' (ilike) → trouve Robinet`, res.some((a) => a.nom === `${TAG}-Robinet`));
  // recherche par description
  res = await searchBibliothequeArticles("ZZTEST plomberie");
  check(`recherche par description → trouve Tuyau`, res.some((a) => a.nom === `${TAG}-Tuyau`));
  // visible only : l'article caché n'apparaît jamais
  res = await searchBibliothequeArticles(TAG);
  check(`visible only : article caché exclu`, !res.some((a) => a.nom === `${TAG}-Invisible`));
  check(`recherche large '${TAG}' → 3 visibles (plombier x2 + electricien)`, res.filter((a) => a.nom.startsWith(TAG)).length === 3);
  // filtre métier
  res = await searchBibliothequeArticles(TAG, { metier: "electricien" });
  check(`filtre metier=electricien → seul Cable`, res.filter((a) => a.nom.startsWith(TAG)).length === 1 && res.some((a) => a.nom === `${TAG}-Cable`));
  // filtre categorie
  res = await searchBibliothequeArticles(TAG, { metier: "plombier", categorie: "Tuyauterie" });
  check(`filtre metier+categorie → seul Tuyau`, res.filter((a) => a.nom.startsWith(TAG)).length === 1 && res.some((a) => a.nom === `${TAG}-Tuyau`));
  // tri par nom
  res = await searchBibliothequeArticles(TAG, { metier: "plombier" });
  const noms = res.filter((a) => a.nom.startsWith(TAG)).map((a) => a.nom);
  check(`tri par nom ASC → ${noms.join(",")}`, JSON.stringify(noms) === JSON.stringify([...noms].sort()));

  // getBibliothequeCategories : DISTINCT pour plombier
  const cats = await getBibliothequeCategories("plombier");
  const testCats = cats.filter((c) => c.categorie === "Robinetterie" || c.categorie === "Tuyauterie");
  check(`categories plombier : Robinetterie + Tuyauterie présentes (visible only) → ${testCats.length}`, testCats.length === 2);
  check(`categories : article caché (Robinetterie/Cuisine déjà visible via Robinet) → pas de doublon DISTINCT`,
    cats.filter((c) => c.categorie === "Robinetterie" && c.sous_categorie === "Cuisine").length === 1);

  // cleanup
  await db.delete(bibliothequeArticles).where(inArray(bibliothequeArticles.id, ids));
} catch (e) {
  console.error("❌ EXCEPTION", e);
  ok = false;
}

console.log(ok ? "\n=== ✅ BIBLIOTHEQUE PG OK ===" : "\n=== ❌ BIBLIOTHEQUE PG FAIL ===");
process.exit(ok ? 0 : 1);
