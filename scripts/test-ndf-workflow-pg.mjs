// scripts/test-ndf-workflow-pg.mjs — OPE-184 P0.7c-5 — workflow Notes de frais sur PG.
// Vérifie les transitions brouillon→soumise→approuvée→payée et le chemin rejet,
// la propagation du statut aux dépenses liées, et la règle OPE-179 (seules les
// dépenses remboursables passent « remboursee » au paiement).
import {
  createNoteFrais, addDepenseToNoteFrais, calculerTotalNoteFrais,
  getNoteFraisById, createDepense, getNextNoteFraisNumero, getNextDepenseNumero,
  soumettreNoteFrais, approuverNoteFrais, rejeterNoteFrais, payerNoteFrais,
  getDb,
} from "../server/db.ts";
import { notesDeFrais, notesFraisDepenses, depenses } from "../drizzle/schema.active.ts";
import { eq, inArray } from "drizzle-orm";

const A = 99011, U = 99011;
let ok = true;
const check = (label, cond) => { console.log(`${cond ? "✅" : "❌"} ${label}`); if (!cond) ok = false; };

const mkDep = async (ht, tva, remboursable) => {
  const ttc = Number((Number(ht) + Number(tva)).toFixed(2));
  const numero = await getNextDepenseNumero(A);
  return await createDepense({
    artisanId: A, userId: U, numero, categorie: "fournitures",
    montantHt: ht, tauxTva: 20, montantTva: tva, montantTtc: ttc,
    dateDepense: "2026-06-01", fournisseur: "T", remboursable,
  });
};

const mkNote = async () => {
  const num = await getNextNoteFraisNumero(A);
  return await createNoteFrais({ artisanId: A, userId: U, numero: num, titre: "WF",
    periodeDebut: "2026-06-01", periodeFin: "2026-06-30" });
};

const statutDep = async (id) => {
  const db = await getDb();
  const [d] = await db.select().from(depenses).where(eq(depenses.id, id)).limit(1);
  return d;
};

const createdDeps = [], createdNotes = [];

try {
  // --- Chemin approbation + paiement ---
  const note = await mkNote(); createdNotes.push(note.id);
  const dR = await mkDep(100, 20, true);   createdDeps.push(dR.id); // remboursable TTC 120
  const dN = await mkDep(50, 10, false);   createdDeps.push(dN.id); // non remboursable (lien refusé)
  await addDepenseToNoteFrais(note.id, dR.id, A);
  await addDepenseToNoteFrais(note.id, dN.id, A); // skip (non remboursable, OPE-179)

  let n = await getNoteFraisById(note.id, A);
  check(`statut initial = brouillon → ${n.statut}`, n.statut === "brouillon");

  await soumettreNoteFrais(note.id, A);
  n = await getNoteFraisById(note.id, A);
  check(`après soumission statut = soumise → ${n.statut}`, n.statut === "soumise");
  check(`date_soumission renseignée → ${n.date_soumission}`, !!n.date_soumission);
  check(`montant_total = 120 (recalculé à la soumission) → ${n.montant_total}`, Number(n.montant_total) === 120);
  check(`dépense liée passée à soumise → ${(await statutDep(dR.id)).statut}`, (await statutDep(dR.id)).statut === "soumise");

  await approuverNoteFrais(note.id, A, "OK chef");
  n = await getNoteFraisById(note.id, A);
  check(`après approbation statut = approuvee → ${n.statut}`, n.statut === "approuvee");
  check(`commentaire_approbateur = "OK chef" → ${n.commentaire_approbateur}`, n.commentaire_approbateur === "OK chef");
  check(`date_approbation renseignée → ${n.date_approbation}`, !!n.date_approbation);
  check(`dépense liée passée à approuvee → ${(await statutDep(dR.id)).statut}`, (await statutDep(dR.id)).statut === "approuvee");

  await payerNoteFrais(note.id, A);
  n = await getNoteFraisById(note.id, A);
  check(`après paiement statut = payee → ${n.statut}`, n.statut === "payee");
  check(`date_paiement renseignée → ${n.date_paiement}`, !!n.date_paiement);
  const dRfin = await statutDep(dR.id);
  check(`dépense remboursable → remboursee + rembourse=true → ${dRfin.statut}/${dRfin.rembourse}`,
    dRfin.statut === "remboursee" && dRfin.rembourse === true);
  check(`date_remboursement renseignée → ${dRfin.date_remboursement}`, !!dRfin.date_remboursement);
  // OPE-179 : dN non liée (refusée) donc inchangée — sanity
  const dNfin = await statutDep(dN.id);
  check(`dépense non-remboursable jamais remboursée → ${dNfin.statut}/${dNfin.rembourse}`,
    dNfin.statut !== "remboursee" && !dNfin.rembourse);

  // --- Chemin rejet ---
  const note2 = await mkNote(); createdNotes.push(note2.id);
  const d2 = await mkDep(80, 16, true); createdDeps.push(d2.id);
  await addDepenseToNoteFrais(note2.id, d2.id, A);
  await soumettreNoteFrais(note2.id, A);
  await rejeterNoteFrais(note2.id, A, "manque justificatif");
  let n2 = await getNoteFraisById(note2.id, A);
  check(`note2 rejetée statut = rejetee → ${n2.statut}`, n2.statut === "rejetee");
  check(`note2 commentaire = "manque justificatif" → ${n2.commentaire_approbateur}`, n2.commentaire_approbateur === "manque justificatif");
  check(`dépense liée passée à rejetee → ${(await statutDep(d2.id)).statut}`, (await statutDep(d2.id)).statut === "rejetee");
  check(`note2 jamais payée → date_paiement null`, !n2.date_paiement);

  // cleanup
  const db = await getDb();
  await db.delete(notesFraisDepenses).where(inArray(notesFraisDepenses.note_id, createdNotes));
  await db.delete(notesDeFrais).where(inArray(notesDeFrais.id, createdNotes));
  await db.delete(depenses).where(inArray(depenses.id, createdDeps));
} catch (e) {
  console.error("❌ EXCEPTION", e);
  ok = false;
}

console.log(ok ? "\n=== ✅ NDF WORKFLOW PG OK ===" : "\n=== ❌ NDF WORKFLOW PG FAIL ===");
process.exit(ok ? 0 : 1);
