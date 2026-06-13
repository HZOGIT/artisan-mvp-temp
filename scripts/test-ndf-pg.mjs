// scripts/test-ndf-pg.mjs — OPE-184 P0.7c-4 — validation Notes de Frais sur PostgreSQL.
// Crée 1 note + 3 dépenses (2 remboursables, 1 non), lie les 3, vérifie que
// calculerTotalNoteFrais = somme des TTC des dépenses REMBOURSABLES uniquement (OPE-179),
// vérifie le garde-fou cross-tenant (OPE-182), puis nettoie.
import {
  createNoteFrais, addDepenseToNoteFrais, removeDepenseFromNoteFrais,
  calculerTotalNoteFrais, getNotesFrais, getNoteFraisById,
  createDepense, getNextNoteFraisNumero, getNextDepenseNumero,
} from "../server/db.ts";
import { getDb } from "../server/db.ts";
import { notesDeFrais, notesFraisDepenses, depenses } from "../drizzle/schema.active.ts";
import { eq, inArray } from "drizzle-orm";

const A = 99001;       // tenant A (test)
const B = 99002;       // tenant B (intrus, pour OPE-182)
const U = 99001;
let ok = true;
const check = (label, cond) => { console.log(`${cond ? "✅" : "❌"} ${label}`); if (!cond) ok = false; };

const mkDep = async (artisanId, ht, tva, remboursable) => {
  const ttc = Number((Number(ht) + Number(tva)).toFixed(2));
  const numero = await getNextDepenseNumero(artisanId);
  return await createDepense({
    artisanId, userId: U, numero, categorie: "fournitures",
    montantHt: ht, tauxTva: 20, montantTva: tva, montantTtc: ttc,
    dateDepense: "2026-06-01", fournisseur: "T", remboursable,
  });
};

try {
  const num = await getNextNoteFraisNumero(A);
  const note = await createNoteFrais({
    artisanId: A, userId: U, numero: num, titre: "NDF test",
    periodeDebut: "2026-06-01", periodeFin: "2026-06-30",
  });
  check("createNoteFrais retourne la note", !!note?.id);

  // 2 dépenses remboursables (TTC 120 + 60 = 180) + 1 non remboursable (TTC 240)
  const d1 = await mkDep(A, 100, 20, true);   // TTC 120
  const d2 = await mkDep(A, 50, 10, true);    // TTC 60
  const d3 = await mkDep(A, 200, 40, false);  // TTC 240, NON remboursable
  check("3 dépenses créées", d1?.id && d2?.id && d3?.id);

  await addDepenseToNoteFrais(note.id, d1.id, A);
  await addDepenseToNoteFrais(note.id, d2.id, A);
  await addDepenseToNoteFrais(note.id, d3.id, A); // doit être SKIP (non remboursable, OPE-179)

  const total = await calculerTotalNoteFrais(note.id, A);
  check(`total = 180 (120+60, exclut la non-remboursable) → ${total}`, total === 180);

  // montant_total bien persisté
  const fetched = await getNoteFraisById(note.id, A);
  check(`montant_total persisté = 180 → ${fetched?.montant_total}`, Number(fetched?.montant_total) === 180);
  // d3 non-remboursable n'est PAS liée
  check(`note contient 2 dépenses liées → ${fetched?.depenses?.length}`, fetched?.depenses?.length === 2);

  // idempotence du lien (re-add ne duplique pas)
  await addDepenseToNoteFrais(note.id, d1.id, A);
  const f2 = await getNoteFraisById(note.id, A);
  check(`re-add idempotent (toujours 2 liens) → ${f2?.depenses?.length}`, f2?.depenses?.length === 2);

  // OPE-182 — tenant B ne peut PAS lier une dépense dans la note de A
  const dB = await mkDep(B, 10, 2, true);
  await addDepenseToNoteFrais(note.id, dB.id, B); // note appartient à A → skip
  const f3 = await getNoteFraisById(note.id, A);
  check(`OPE-182 add cross-tenant refusé (toujours 2) → ${f3?.depenses?.length}`, f3?.depenses?.length === 2);

  // OPE-182 — tenant B ne peut PAS retirer un lien de la note de A
  await removeDepenseFromNoteFrais(note.id, d1.id, B);
  const f4 = await getNoteFraisById(note.id, A);
  check(`OPE-182 remove cross-tenant refusé (toujours 2) → ${f4?.depenses?.length}`, f4?.depenses?.length === 2);

  // remove légitime par A
  await removeDepenseFromNoteFrais(note.id, d2.id, A);
  const totalAfter = await calculerTotalNoteFrais(note.id, A);
  check(`après remove d2: total = 120 → ${totalAfter}`, totalAfter === 120);

  // getNotesFrais liste avec nb_depenses
  const list = await getNotesFrais(A, U);
  const listed = list.find((n) => n.id === note.id);
  check(`getNotesFrais nb_depenses = 1 → ${listed?.nb_depenses}`, Number(listed?.nb_depenses) === 1);

  // cleanup
  const db = await getDb();
  await db.delete(notesFraisDepenses).where(eq(notesFraisDepenses.note_id, note.id));
  await db.delete(notesDeFrais).where(eq(notesDeFrais.id, note.id));
  await db.delete(depenses).where(inArray(depenses.id, [d1.id, d2.id, d3.id, dB.id]));
} catch (e) {
  console.error("❌ EXCEPTION", e);
  ok = false;
}

console.log(ok ? "\n=== ✅ NDF PG OK ===" : "\n=== ❌ NDF PG FAIL ===");
process.exit(ok ? 0 : 1);
