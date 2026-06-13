// Test de conformite FEC — focalise sur OPE-136 (avoirs / notes de credit).
//
// Le FEC (arrete 29/07/2013, DGFiP) interdit les montants negatifs : une note de
// credit (avoir) doit s'enregistrer en INVERSANT le sens des comptes, en valeur
// absolue. Ce test cree un artisan SYNTHETIQUE isole (id 990136, aucune collision
// avec les donnees reelles), y insere une facture normale + un avoir, genere le FEC
// et verifie :
//   1) aucun montant Debit/Credit negatif ;
//   2) ecriture equilibree (somme debits == somme credits) ;
//   3) l'avoir produit bien un 411 au CREDIT et un 706 au DEBIT (sens inverse) ;
//   4) genererEcrituresFacture(avoir) ne stocke aucun montant negatif.
// Nettoyage complet en finally (DELETE de tout ce qui porte l'artisanId de test).
//
// Usage : DATABASE_URL=mysql://user:pass@127.0.0.1:3307/artisan_mvp tsx scripts/test-fec.mjs

import { genererFEC, genererEcrituresFacture, getDb, getPool } from "../server/db.ts";

const TID = 990136; // artisan synthetique isole
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log("  ✅", msg); } else { fail++; console.log("  ❌", msg); } };

async function cleanup(pool) {
  // Ordre : lignes -> factures -> ecritures -> clients (tout scope sur l'artisan de test).
  const [facts] = await pool.execute("SELECT id FROM factures WHERE artisanId = ?", [TID]);
  for (const f of facts) await pool.execute("DELETE FROM factures_lignes WHERE factureId = ?", [f.id]);
  await pool.execute("DELETE FROM ecritures_comptables WHERE artisanId = ?", [TID]);
  await pool.execute("DELETE FROM factures WHERE artisanId = ?", [TID]);
  await pool.execute("DELETE FROM clients WHERE artisanId = ?", [TID]);
}

async function main() {
  await getDb();
  const pool = getPool();
  if (!pool) throw new Error("Pool indisponible — DATABASE_URL ?");

  // Nettoyage prealable (au cas ou un run precedent aurait laisse des traces).
  await cleanup(pool);

  try {
    // --- Donnees de test isolees ---
    const [cli] = await pool.execute(
      "INSERT INTO clients (artisanId, nom, prenom) VALUES (?, 'TEST-FEC', 'Avoir')", [TID]);
    const clientId = cli.insertId;

    // Facture normale : 1000 HT + 200 TVA (20%) = 1200 TTC.
    const [fa] = await pool.execute(
      `INSERT INTO factures (artisanId, clientId, numero, dateFacture, statut, typeDocument, totalHT, totalTVA, totalTTC)
       VALUES (?, ?, 'TST-F-001', '2026-01-15', 'validee', 'facture', '1000.00', '200.00', '1200.00')`,
      [TID, clientId]);
    const factureId = fa.insertId;
    await pool.execute(
      `INSERT INTO factures_lignes (factureId, designation, quantite, prixUnitaireHT, tauxTVA, montantHT, montantTVA, montantTTC)
       VALUES (?, 'Prestation test', '1', '1000.00', '20', '1000.00', '200.00', '1200.00')`, [factureId]);

    // Avoir sur cette facture : -400 HT / -80 TVA / -480 TTC (montants NEGATIFS en base).
    const [av] = await pool.execute(
      `INSERT INTO factures (artisanId, clientId, numero, dateFacture, statut, typeDocument, factureOrigineId, totalHT, totalTVA, totalTTC)
       VALUES (?, ?, 'TST-A-001', '2026-01-20', 'validee', 'avoir', ?, '-400.00', '-80.00', '-480.00')`,
      [TID, clientId, factureId]);
    const avoirId = av.insertId;
    await pool.execute(
      `INSERT INTO factures_lignes (factureId, designation, quantite, prixUnitaireHT, tauxTVA, montantHT, montantTVA, montantTTC)
       VALUES (?, 'Remise avoir', '1', '-400.00', '20', '-400.00', '-80.00', '-480.00')`, [avoirId]);

    // --- 1) genererFEC : invariants DGFiP ---
    const { content, conformite } = await genererFEC(TID, new Date("2026-01-01"), new Date("2026-12-31"));
    const rows = content.split("\n").slice(1).filter(Boolean).map((l) => l.split("\t"));
    ok(rows.length > 0, `FEC genere (${rows.length} lignes)`);

    let negatifs = 0;
    for (const r of rows) {
      const debit = r[11] || "", credit = r[12] || "";
      if (debit.startsWith("-") || credit.startsWith("-")) negatifs++;
    }
    ok(negatifs === 0, `Aucun montant Debit/Credit negatif (trouve : ${negatifs})`);
    ok(conformite.equilibre, `Ecriture equilibree (ecart ${conformite.ecart})`);

    // 3) Sens inverse de l'avoir : sur les lignes de piece TST-A-001, le 411 doit etre
    //    au CREDIT et le 706 au DEBIT (oppose d'une facture normale).
    const avRows = rows.filter((r) => r[8] === "TST-A-001");
    const c411 = avRows.find((r) => r[4] === "411000");
    const c706 = avRows.find((r) => r[4] === "706000");
    ok(!!c411 && Number(c411[12].replace(",", ".")) > 0 && Number(c411[11].replace(",", ".")) === 0,
      `Avoir : 411 client au CREDIT (${c411 ? c411[12] : "?"})`);
    ok(!!c706 && Number(c706[11].replace(",", ".")) > 0 && Number(c706[12].replace(",", ".")) === 0,
      `Avoir : 706 ventes au DEBIT (${c706 ? c706[11] : "?"})`);

    // --- 4) genererEcrituresFacture(avoir) : ecritures stockees sans negatif ---
    await genererEcrituresFacture(avoirId);
    const [ecr] = await pool.execute(
      "SELECT numeroCompte, debit, credit FROM ecritures_comptables WHERE factureId = ?", [avoirId]);
    let ecrNeg = 0;
    for (const e of ecr) { if (Number(e.debit) < 0 || Number(e.credit) < 0) ecrNeg++; }
    ok(ecr.length > 0, `genererEcrituresFacture(avoir) a stocke ${ecr.length} ecritures`);
    ok(ecrNeg === 0, `Ecritures stockees sans montant negatif (trouve : ${ecrNeg})`);
    const e411 = ecr.find((e) => e.numeroCompte === "411000");
    ok(!!e411 && Number(e411.credit) > 0, `Avoir stocke : 411 au CREDIT (${e411 ? e411.credit : "?"})`);

  } finally {
    await cleanup(pool);
    console.log("  🧹 Donnees de test nettoyees (artisanId", TID, ")");
  }

  console.log(`\n=== FEC OPE-136 : ${pass} PASS / ${fail} FAIL ===`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("ERREUR:", e); process.exit(2); });
