// scripts/test-banque-pg.mjs — OPE-184 P0.7c-7 — banque sur PG.
// importReleve (avec règle de catégorisation), getTransactionsBancaires (filtre ignoree),
// lierTransactionDepense, ignorerTransaction, getTresoreriePrevisionnelle (dépenses récurrentes).
import {
  importReleve, getTransactionsBancaires, lierTransactionDepense,
  ignorerTransaction, getTresoreriePrevisionnelle, createDepense,
  getNextDepenseNumero, getDb,
} from "../server/db.ts";
import { relevesBancaires, transactionsBancaires, reglesCategorisation, depenses } from "../drizzle/schema.active.ts";
import { eq, and } from "drizzle-orm";

const A = 99061, U = 99061;
let ok = true;
const check = (label, cond) => { console.log(`${cond ? "✅" : "❌"} ${label}`); if (!cond) ok = false; };

try {
  const db = await getDb();
  // reset
  await db.delete(transactionsBancaires).where(eq(transactionsBancaires.artisan_id, A));
  await db.delete(relevesBancaires).where(eq(relevesBancaires.artisan_id, A));
  await db.delete(reglesCategorisation).where(eq(reglesCategorisation.artisan_id, A));
  await db.delete(depenses).where(eq(depenses.artisan_id, A));

  // règle de catégorisation : libellé contenant TOTAL → carburant
  await db.insert(reglesCategorisation).values({ artisan_id: A, motif_libelle: "TOTAL", categorie: "carburant", actif: true });

  // import d'un relevé de 3 transactions
  const { releveId, nbImportees } = await importReleve(A, "releve-mai.csv", [
    { dateTransaction: "2026-05-03", libelle: "STATION TOTAL ACCESS", montant: -65.40, typeTransaction: "debit" },
    { dateTransaction: "2026-05-10", libelle: "VIREMENT CLIENT X", montant: 1200.00, typeTransaction: "credit" },
    { dateTransaction: "2026-05-15", libelle: "ACHAT DIVERS", montant: -30.00, typeTransaction: "debit" },
  ]);
  check(`importReleve : releveId créé → ${releveId}`, releveId > 0);
  check(`importReleve : 3 transactions importées → ${nbImportees}`, nbImportees === 3);

  // relevé marqué 'termine' avec nb_importees
  const [rel] = await db.select().from(relevesBancaires).where(eq(relevesBancaires.id, releveId)).limit(1);
  check(`relevé statut = termine → ${rel?.statut}`, rel?.statut === "termine");
  check(`relevé nb_importees = 3 → ${rel?.nb_importees}`, rel?.nb_importees === 3);

  let txs = await getTransactionsBancaires(A);
  check(`getTransactionsBancaires : 3 transactions → ${txs.length}`, txs.length === 3);
  // montants stockés en valeur absolue
  check(`montant stocké en valeur absolue (65.40) `, txs.some((t) => Number(t.montant) === 65.4));
  // catégorie suggérée appliquée via la règle TOTAL → carburant
  const txTotal = txs.find((t) => t.libelle.includes("TOTAL"));
  check(`règle catégorisation : STATION TOTAL → carburant → ${txTotal?.categorie_suggeree}`, txTotal?.categorie_suggeree === "carburant");
  const txDivers = txs.find((t) => t.libelle.includes("DIVERS"));
  check(`pas de règle pour ACHAT DIVERS → categorie_suggeree null`, !txDivers?.categorie_suggeree);

  // lier une transaction à une dépense
  const dep = await createDepense({ artisanId: A, userId: U, numero: await getNextDepenseNumero(A), categorie: "carburant", montantHt: 54.5, tauxTva: 20, montantTva: 10.9, montantTtc: 65.4, dateDepense: "2026-05-03", fournisseur: "Total" });
  await lierTransactionDepense(txTotal.id, dep.id, A);
  const [linked] = await db.select().from(transactionsBancaires).where(eq(transactionsBancaires.id, txTotal.id)).limit(1);
  check(`lierTransactionDepense : depense_id = ${dep.id} → ${linked?.depense_id}`, linked?.depense_id === dep.id);

  // ignorer une transaction → sort de la liste
  await ignorerTransaction(txDivers.id, A);
  txs = await getTransactionsBancaires(A);
  check(`ignorerTransaction : transaction ignorée exclue (2 restantes) → ${txs.length}`, txs.length === 2);

  // garde-fou cross-tenant : un autre artisan ne peut pas ignorer/lier
  await ignorerTransaction(txTotal.id, 99999);
  const [stillThere] = await db.select().from(transactionsBancaires).where(eq(transactionsBancaires.id, txTotal.id)).limit(1);
  check(`cross-tenant : ignorer par autre artisan sans effet → ignoree=${stillThere?.ignoree}`, stillThere?.ignoree === false);

  // trésorerie prévisionnelle : 1 dépense récurrente mensuelle (sortie attendue)
  await createDepense({ artisanId: A, userId: U, numero: await getNextDepenseNumero(A), categorie: "loyer", montantHt: 800, tauxTva: 0, montantTva: 0, montantTtc: 800, dateDepense: "2026-05-01", fournisseur: "Bailleur" });
  // marque la dépense récurrente (colonnes non exposées par createDepense → update direct)
  await db.update(depenses).set({ recurrente: true, frequence_recurrence: "mensuelle", prochaine_occurrence: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString().slice(0, 10) })
    .where(and(eq(depenses.artisan_id, A), eq(depenses.categorie, "loyer")));
  const treso = await getTresoreriePrevisionnelle(A, 8);
  check(`trésorerie : ${treso.semaines.length} semaines → 8`, treso.semaines.length === 8);
  check(`trésorerie : sorties récurrentes > 0 (dépense mensuelle expansée) → ${treso.totalSorties}`, treso.totalSorties > 0);
  check(`trésorerie : net = entrées - sorties cohérent`, Math.abs(treso.totalNet - (treso.totalEntrees - treso.totalSorties)) < 0.01);

  // cleanup
  await db.delete(transactionsBancaires).where(eq(transactionsBancaires.artisan_id, A));
  await db.delete(relevesBancaires).where(eq(relevesBancaires.artisan_id, A));
  await db.delete(reglesCategorisation).where(eq(reglesCategorisation.artisan_id, A));
  await db.delete(depenses).where(eq(depenses.artisan_id, A));
} catch (e) {
  console.error("❌ EXCEPTION", e);
  ok = false;
}

console.log(ok ? "\n=== ✅ BANQUE PG OK ===" : "\n=== ❌ BANQUE PG FAIL ===");
process.exit(ok ? 0 : 1);
