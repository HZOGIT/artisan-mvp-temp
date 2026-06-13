// scripts/test-budgets-regles-pg.mjs — OPE-184 P0.7e-3 — copie budgets + règles catégorisation sur PG.
// copierBudgetsMois (upsert par catégorie source→cible), getReglesCategorisation,
// createRegleCategorisation, deleteRegleCategorisation (soft-delete scopé artisan).
import {
  copierBudgetsMois, upsertBudget, getReglesCategorisation,
  createRegleCategorisation, deleteRegleCategorisation, getDb,
} from "../server/db.ts";
import { budgetsCategories, reglesCategorisation } from "../drizzle/schema.active.ts";
import { eq, and } from "drizzle-orm";

const A = 9919001;
let ok = true;
const check = (label, cond) => { console.log(`${cond ? "✅" : "❌"} ${label}`); if (!cond) ok = false; };
const budgetsDuMois = async (mois) => {
  const db = await getDb();
  return db.select().from(budgetsCategories).where(and(eq(budgetsCategories.artisan_id, A), eq(budgetsCategories.mois, mois)));
};

try {
  const db = await getDb();
  await db.delete(budgetsCategories).where(eq(budgetsCategories.artisan_id, A));
  await db.delete(reglesCategorisation).where(eq(reglesCategorisation.artisan_id, A));

  // --- copierBudgetsMois ---
  await upsertBudget(A, "materiaux", "2026-05", 1000);
  await upsertBudget(A, "carburant", "2026-05", 300);
  // une valeur préexistante dans le mois cible (sera écrasée par l'upsert)
  await upsertBudget(A, "materiaux", "2026-06", 50);

  await copierBudgetsMois(A, "2026-05", "2026-06");
  const cible = await budgetsDuMois("2026-06");
  check(`copie : 2 catégories dans le mois cible → ${cible.length}`, cible.length === 2);
  const mat = cible.find((b) => b.categorie === "materiaux");
  const carb = cible.find((b) => b.categorie === "carburant");
  check(`copie : materiaux=1000 (écrase l'ancien 50) → ${mat?.budget}`, Number(mat?.budget) === 1000);
  check(`copie : carburant=300 (créé) → ${carb?.budget}`, Number(carb?.budget) === 300);
  // source intacte
  check(`source 2026-05 intacte (2 budgets) → ${(await budgetsDuMois("2026-05")).length}`, (await budgetsDuMois("2026-05")).length === 2);
  // idempotent : recopier ne duplique pas
  await copierBudgetsMois(A, "2026-05", "2026-06");
  check(`copie idempotente : toujours 2 dans la cible → ${(await budgetsDuMois("2026-06")).length}`, (await budgetsDuMois("2026-06")).length === 2);

  // --- règles de catégorisation ---
  await createRegleCategorisation(A, "TOTAL", "carburant");
  await createRegleCategorisation(A, "EDF", "energie");
  let regles = await getReglesCategorisation(A);
  check(`getRegles : 2 règles actives → ${regles.length}`, regles.length === 2);
  check(`getRegles : ordre id DESC (EDF en premier, créé en dernier) → ${regles[0]?.motif_libelle}`, regles[0]?.motif_libelle === "EDF");
  check(`règle : motif+catégorie corrects → ${regles[1]?.motif_libelle}/${regles[1]?.categorie}`, regles[1]?.motif_libelle === "TOTAL" && regles[1]?.categorie === "carburant");

  // soft-delete : la règle EDF disparaît de la liste mais reste en base (actif=false)
  const edfId = regles.find((r) => r.motif_libelle === "EDF").id;
  await deleteRegleCategorisation(edfId, A);
  regles = await getReglesCategorisation(A);
  check(`soft-delete : 1 règle active restante (TOTAL) → ${regles.length}`, regles.length === 1 && regles[0].motif_libelle === "TOTAL");
  const [edfRow] = await db.select().from(reglesCategorisation).where(eq(reglesCategorisation.id, edfId));
  check(`soft-delete : ligne conservée, actif=false → ${edfRow?.actif}`, edfRow && edfRow.actif === false);

  // garde-fou cross-tenant : delete avec mauvais artisan = no-op
  const totalId = regles[0].id;
  await deleteRegleCategorisation(totalId, 99999999);
  check(`cross-tenant : delete mauvais artisan = no-op (TOTAL toujours active)`, (await getReglesCategorisation(A)).length === 1);

  // cleanup
  await db.delete(budgetsCategories).where(eq(budgetsCategories.artisan_id, A));
  await db.delete(reglesCategorisation).where(eq(reglesCategorisation.artisan_id, A));
} catch (e) {
  console.error("❌ EXCEPTION", e);
  ok = false;
}

console.log(ok ? "\n=== ✅ BUDGETS+REGLES PG OK ===" : "\n=== ❌ BUDGETS+REGLES PG FAIL ===");
process.exit(ok ? 0 : 1);
