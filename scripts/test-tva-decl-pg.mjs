// scripts/test-tva-decl-pg.mjs — OPE-184 P0.7c-6d — déclaration TVA + export dépenses FEC sur PG.
// Facture 20% (HT 1000 / TVA 200) + facture 10% (HT 500 / TVA 50) → collectée 250.
// Dépense déductible (TVA 60) + dépense NON déductible (TVA 99, exclue).
// Vérifie : tvaCollectee=250, ventilation par taux, tvaDeductible=60, tvaNette=190 ;
// exportDepensesFEC n'exporte QUE la dépense déductible et reste équilibré.
import {
  getDeclarationTVADetail, exportDepensesFEC, createFacture, createClient,
  createDepense, getNextDepenseNumero, getDb,
} from "../server/db.ts";
import { factures, facturesLignes, clients, depenses } from "../drizzle/schema.active.ts";
import { eq } from "drizzle-orm";

const A = 99051, U = 99051;
let ok = true;
const check = (label, cond) => { console.log(`${cond ? "✅" : "❌"} ${label}`); if (!cond) ok = false; };
const fecNum = (s) => Number(String(s).replace(",", "."));

try {
  const db = await getDb();
  // reset
  await db.delete(factures).where(eq(factures.artisanId, A));
  await db.delete(clients).where(eq(clients.artisanId, A));
  await db.delete(depenses).where(eq(depenses.artisan_id, A));

  const cli = await createClient(A, { nom: "TVA", prenom: "Test", email: "t@v.fr" });

  // facture 20% : HT 1000 / TVA 200
  const f1 = await createFacture(A, { clientId: cli.id, numero: "TVA-1", dateFacture: new Date("2026-05-05"), statut: "validee", totalHT: "1000.00", totalTVA: "200.00", totalTTC: "1200.00" });
  await db.insert(facturesLignes).values({ factureId: f1.id, designation: "P20", prixUnitaireHT: "1000.00", tauxTVA: "20.00", montantHT: "1000.00", montantTVA: "200.00", montantTTC: "1200.00" });
  // facture 10% : HT 500 / TVA 50
  const f2 = await createFacture(A, { clientId: cli.id, numero: "TVA-2", dateFacture: new Date("2026-05-12"), statut: "envoyee", totalHT: "500.00", totalTVA: "50.00", totalTTC: "550.00" });
  await db.insert(facturesLignes).values({ factureId: f2.id, designation: "P10", prixUnitaireHT: "500.00", tauxTVA: "10.00", montantHT: "500.00", montantTVA: "50.00", montantTTC: "550.00" });

  // dépense déductible (TVA 60) + dépense non déductible (TVA 99, doit être exclue)
  const dDed = await createDepense({ artisanId: A, userId: U, numero: await getNextDepenseNumero(A), categorie: "materiaux", montantHt: 300, tauxTva: 20, montantTva: 60, montantTtc: 360, dateDepense: "2026-05-08", fournisseur: "Ded", tvaDeductible: true });
  const dNon = await createDepense({ artisanId: A, userId: U, numero: await getNextDepenseNumero(A), categorie: "repas", montantHt: 495, tauxTva: 20, montantTva: 99, montantTtc: 594, dateDepense: "2026-05-09", fournisseur: "NonDed", tvaDeductible: false });

  const decl = await getDeclarationTVADetail(A, new Date("2026-05-01"), new Date("2026-05-31"));

  check(`TVA collectée = 250 (200 + 50) → ${decl.tvaCollectee}`, decl.tvaCollectee === 250);
  check(`ventilation : 2 taux → ${decl.parTaux.length}`, decl.parTaux.length === 2);
  const t20 = decl.parTaux.find((t) => t.taux === 20);
  const t10 = decl.parTaux.find((t) => t.taux === 10);
  check(`taux 20 : baseHT=1000, tvaCollectee=200 → ${t20?.baseHT}/${t20?.tvaCollectee}`, t20?.baseHT === 1000 && t20?.tvaCollectee === 200);
  check(`taux 10 : baseHT=500, tvaCollectee=50 → ${t10?.baseHT}/${t10?.tvaCollectee}`, t10?.baseHT === 500 && t10?.tvaCollectee === 50);
  check(`ordre décroissant (20 avant 10)`, decl.parTaux[0].taux === 20);
  check(`TVA déductible = 60 (exclut la non-déductible de 99) → ${decl.tvaDeductible}`, decl.tvaDeductible === 60);
  check(`TVA nette = 190 (250 - 60) → ${decl.tvaNette}`, decl.tvaNette === 190);

  // exportDepensesFEC : seule la dépense déductible, écriture équilibrée
  const fec = await exportDepensesFEC(A, "2026-05-01", "2026-05-31");
  const fecRows = fec.split("\n");
  check(`export dépenses : header + 3 lignes (1 seule dépense déductible) → ${fecRows.length}`, fecRows.length === 4);
  let dSum = 0, cSum = 0;
  for (const r of fecRows.slice(1)) { const cols = r.split("\t"); dSum += fecNum(cols[11]); cSum += fecNum(cols[12]); }
  check(`export dépenses équilibré : débit ${dSum} = crédit ${cSum}`, Math.abs(dSum - cSum) < 0.01);
  check(`export débit = 360 (HT 300 + TVA 60) → ${dSum}`, Math.abs(dSum - 360) < 0.01);
  check(`export ne contient PAS la dépense non déductible (NonDed)`, !fec.includes("NonDed"));

  // cleanup
  await db.delete(facturesLignes).where(eq(facturesLignes.factureId, f1.id));
  await db.delete(facturesLignes).where(eq(facturesLignes.factureId, f2.id));
  await db.delete(factures).where(eq(factures.artisanId, A));
  await db.delete(depenses).where(eq(depenses.artisan_id, A));
  await db.delete(clients).where(eq(clients.artisanId, A));
} catch (e) {
  console.error("❌ EXCEPTION", e);
  ok = false;
}

console.log(ok ? "\n=== ✅ TVA DECL PG OK ===" : "\n=== ❌ TVA DECL PG FAIL ===");
process.exit(ok ? 0 : 1);
