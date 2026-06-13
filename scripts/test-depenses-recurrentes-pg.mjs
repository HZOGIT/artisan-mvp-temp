// scripts/test-depenses-recurrentes-pg.mjs — OPE-184 P0.7e-7 — dépenses récurrentes (FINANCIER) sur PG.
// genererDepensesRecurrentes : copie exacte des montants à la date du jour, statut brouillon,
// recurrente=false, nouveau numéro ; avance prochaine_occurrence selon fréquence ; idempotent.
import { genererDepensesRecurrentes, createDepense, getNextDepenseNumero, getDb } from "../server/db.ts";
import { depenses, notifications } from "../drizzle/schema.active.ts";
import { eq, and, inArray } from "drizzle-orm";

const A = 9922001, U = 9922001;
let ok = true;
const check = (label, cond) => { console.log(`${cond ? "✅" : "❌"} ${label}`); if (!cond) ok = false; };
const ymd = (d) => d.toISOString().slice(0, 10);
const today = ymd(new Date());

try {
  const db = await getDb();
  await db.delete(depenses).where(eq(depenses.artisan_id, A));
  await db.delete(notifications).where(eq(notifications.artisanId, A));

  // dépense récurrente mensuelle échue (prochaine_occurrence = hier), HT 100 / TVA 20 / TTC 120
  const hier = ymd(new Date(Date.now() - 24 * 3600 * 1000));
  const dep = await createDepense({
    artisanId: A, userId: U, numero: await getNextDepenseNumero(A), categorie: "loyer",
    montantHt: 100, tauxTva: 20, montantTva: 20, montantTtc: 120, dateDepense: "2026-01-15",
    fournisseur: "Bailleur", remboursable: false, tvaDeductible: true,
  });
  // flag récurrente mensuelle, prochaine_occurrence = hier (échue)
  await db.update(depenses).set({ recurrente: true, frequence_recurrence: "mensuelle", prochaine_occurrence: hier })
    .where(eq(depenses.id, dep.id));

  // dépense récurrente annuelle PAS encore échue (prochaine_occurrence = dans 10j) → ne doit PAS générer
  const futur = ymd(new Date(Date.now() + 10 * 24 * 3600 * 1000));
  const depFut = await createDepense({
    artisanId: A, userId: U, numero: await getNextDepenseNumero(A), categorie: "assurance",
    montantHt: 500, tauxTva: 20, montantTva: 100, montantTtc: 600, dateDepense: "2026-01-01",
    fournisseur: "Assureur", remboursable: false,
  });
  await db.update(depenses).set({ recurrente: true, frequence_recurrence: "annuelle", prochaine_occurrence: futur })
    .where(eq(depenses.id, depFut.id));

  const nb = await genererDepensesRecurrentes();
  check(`génère 1 dépense (mensuelle échue ; pas l'annuelle future) → ${nb}`, nb === 1);

  // la copie : datée aujourd'hui, montants EXACTS, statut brouillon, non récurrente, nouveau numéro
  const all = await db.select().from(depenses).where(eq(depenses.artisan_id, A));
  const copie = all.find((d) => d.id !== dep.id && d.id !== depFut.id && d.categorie === "loyer");
  check(`copie créée → ${!!copie}`, !!copie);
  check(`copie : date_depense = aujourd'hui → ${copie?.date_depense}`, copie?.date_depense === today);
  check(`copie : montant_ttc EXACT = 120 → ${copie?.montant_ttc}`, Number(copie?.montant_ttc) === 120);
  check(`copie : montant_ht = 100, montant_tva = 20 → ${copie?.montant_ht}/${copie?.montant_tva}`, Number(copie?.montant_ht) === 100 && Number(copie?.montant_tva) === 20);
  check(`copie : statut = brouillon → ${copie?.statut}`, copie?.statut === "brouillon");
  check(`copie : recurrente = false → ${copie?.recurrente}`, copie?.recurrente === false);
  check(`copie : numéro distinct de l'original → ${copie?.numero} ≠ ${dep.numero}`, copie?.numero !== dep.numero);

  // prochaine_occurrence de l'originale avancée d'1 mois (hier + 1 mois)
  const [orig] = await db.select().from(depenses).where(eq(depenses.id, dep.id));
  const attendu = ymd(new Date(new Date(hier).getFullYear(), new Date(hier).getMonth() + 1, new Date(hier).getDate()));
  check(`originale : prochaine_occurrence avancée d'1 mois → ${orig?.prochaine_occurrence} (attendu ${attendu})`, orig?.prochaine_occurrence === attendu);

  // notification créée
  const notifs = await db.select().from(notifications).where(eq(notifications.artisanId, A));
  check(`notification créée pour la dépense récurrente → ${notifs.length}`, notifs.length === 1 && notifs[0].titre.includes("Dépense récurrente"));

  // idempotence : 2e passage le même jour ne régénère pas (prochaine_occurrence désormais future)
  const nb2 = await genererDepensesRecurrentes();
  check(`idempotent : 2e passage = 0 nouvelle dépense → ${nb2}`, nb2 === 0);
  const allAfter = await db.select().from(depenses).where(eq(depenses.artisan_id, A));
  check(`idempotent : toujours 3 dépenses (2 originales + 1 copie) → ${allAfter.length}`, allAfter.length === 3);

  // cleanup
  await db.delete(depenses).where(eq(depenses.artisan_id, A));
  await db.delete(notifications).where(eq(notifications.artisanId, A));
} catch (e) {
  console.error("❌ EXCEPTION", e);
  ok = false;
}

console.log(ok ? "\n=== ✅ DEPENSES RECURRENTES PG OK ===" : "\n=== ❌ DEPENSES RECURRENTES PG FAIL ===");
process.exit(ok ? 0 : 1);
