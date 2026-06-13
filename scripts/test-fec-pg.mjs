// scripts/test-fec-pg.mjs — OPE-184 P0.7c-6b — générateur FEC sur PG.
// Crée 1 facture (HT 1000 / TVA 200 / TTC 1200) + 1 dépense (HT 500 / TVA 100 / TTC 600),
// génère le FEC et vérifie l'invariant comptable : totalDébit = totalCrédit (écart=0),
// nombre d'écritures, comptes PCG valides, conformité 18 colonnes.
import {
  genererFEC, createFacture, createClient, createDepense,
  getNextDepenseNumero, getDb,
} from "../server/db.ts";
import { factures, facturesLignes, clients, depenses } from "../drizzle/schema.active.ts";
import { eq, inArray } from "drizzle-orm";

const A = 99031, U = 99031;
let ok = true;
const check = (label, cond) => { console.log(`${cond ? "✅" : "❌"} ${label}`); if (!cond) ok = false; };

const ids = { factures: [], clients: [], depenses: [] };

try {
  const db = await getDb();

  // client
  const cli = await createClient(A, { nom: "Durand", prenom: "Paul", email: "p@d.fr" });
  ids.clients.push(cli.id);

  // facture validée : HT 1000 / TVA 200 / TTC 1200
  const fac = await createFacture(A, {
    clientId: cli.id, numero: "FEC-TEST-1", dateFacture: new Date("2026-03-10"),
    statut: "validee", totalHT: "1000.00", totalTVA: "200.00", totalTTC: "1200.00",
  });
  ids.factures.push(fac.id);
  await db.insert(facturesLignes).values({
    factureId: fac.id, designation: "Prestation", prixUnitaireHT: "1000.00",
    tauxTVA: "20.00", montantHT: "1000.00", montantTVA: "200.00", montantTTC: "1200.00",
  });

  // dépense : HT 500 / TVA 100 / TTC 600
  const numDep = await getNextDepenseNumero(A);
  const dep = await createDepense({
    artisanId: A, userId: U, numero: numDep, categorie: "materiaux",
    montantHt: 500, tauxTva: 20, montantTva: 100, montantTtc: 600,
    dateDepense: "2026-03-12", fournisseur: "BigMat", remboursable: false,
  });
  ids.depenses.push(dep.id);

  const { content, conformite: c } = await genererFEC(A, new Date("2026-03-01"), new Date("2026-03-31"));

  check(`FEC équilibré (écart=0) → écart=${c.ecart}`, c.equilibre === true && c.ecart === 0);
  check(`totalDébit = totalCrédit → ${c.totalDebit} = ${c.totalCredit}`, c.totalDebit === c.totalCredit);
  // Ventes : débit 411=1200, crédit 706=1000 + 445=200 → +1200/+1200
  // Achats : débit charge=500 + TVA déd=100, crédit 401=600 → +600/+600
  // total attendu débit = 1200 + 600 = 1800
  check(`totalDébit = 1800 (1200 ventes + 600 achats) → ${c.totalDebit}`, c.totalDebit === 1800);
  check(`2 écritures (1 facture + 1 dépense) → ${c.nbEcritures}`, c.nbEcritures === 2);
  check(`aucune erreur de conformité → ${JSON.stringify(c.erreurs)}`, c.erreurs.length === 0);
  check(`comptes PCG tous valides (≥3 chiffres)`, c.comptesUtilises.every((x) => /^[0-9]{3,}$/.test(x)));
  // 18 colonnes sur chaque ligne (header + détail)
  const rows = content.split("\n");
  check(`header 18 colonnes`, rows[0].split("\t").length === 18);
  check(`toutes les lignes ont 18 colonnes`, rows.every((r) => r.split("\t").length === 18));
  // pas de montant négatif (FEC interdit)
  check(`aucun montant négatif dans le FEC`, !/\t-\d/.test(content));
  // comptes attendus présents : 411 (clients), 706 (ventes), 445 (TVA), 601/607 (charge), 401 (fourn)
  check(`compte clients 411000 présent`, c.comptesUtilises.includes("411000"));
  check(`compte fournisseurs 401000 présent`, c.comptesUtilises.includes("401000"));

  // cleanup
  await db.delete(facturesLignes).where(inArray(facturesLignes.factureId, ids.factures));
  await db.delete(factures).where(inArray(factures.id, ids.factures));
  await db.delete(depenses).where(inArray(depenses.id, ids.depenses));
  await db.delete(clients).where(inArray(clients.id, ids.clients));
} catch (e) {
  console.error("❌ EXCEPTION", e);
  ok = false;
}

console.log(ok ? "\n=== ✅ FEC PG OK ===" : "\n=== ❌ FEC PG FAIL ===");
process.exit(ok ? 0 : 1);
