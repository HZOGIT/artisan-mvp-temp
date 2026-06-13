// scripts/test-conges-pg.mjs — OPE-184 P0.7d-2 — soldes de congés sur PG.
// initSoldeConges (upsert idempotent check-then-act), updateSoldeConges
// (décompte joursPris + soldeRestant planché à 0 ; OPE-178 INSERT si absent).
import {
  initSoldeConges, updateSoldeConges, getSoldesConges, getDb,
} from "../server/db.ts";
import { soldesConges } from "../drizzle/schema.active.ts";
import { eq, and } from "drizzle-orm";

const T = 99081, A = 99081, ANNEE = 2026;
let ok = true;
const check = (label, cond) => { console.log(`${cond ? "✅" : "❌"} ${label}`); if (!cond) ok = false; };

const getRow = async (type) => {
  const db = await getDb();
  const [r] = await db.select().from(soldesConges)
    .where(and(eq(soldesConges.technicienId, T), eq(soldesConges.type, type), eq(soldesConges.annee, ANNEE))).limit(1);
  return r;
};
const countRows = async () => {
  const db = await getDb();
  return (await db.select().from(soldesConges).where(eq(soldesConges.technicienId, T))).length;
};

try {
  const db = await getDb();
  await db.delete(soldesConges).where(eq(soldesConges.technicienId, T));

  // init congés payés : 25 jours
  await initSoldeConges({ technicienId: T, artisanId: A, type: "conge_paye", annee: ANNEE, soldeInitial: "25.00", soldeRestant: "25.00", joursAcquis: "25.00", joursPris: "0.00" });
  let r = await getRow("conge_paye");
  check(`init : soldeRestant = 25 → ${r?.soldeRestant}`, Number(r?.soldeRestant) === 25);
  check(`1 ligne après init → ${await countRows()}`, (await countRows()) === 1);

  // init idempotent : ré-init même (tech, type, annee) → update, pas de doublon (corrige bug latent mysql)
  await initSoldeConges({ technicienId: T, artisanId: A, type: "conge_paye", annee: ANNEE, soldeInitial: "30.00", soldeRestant: "30.00", joursAcquis: "30.00", joursPris: "0.00" });
  r = await getRow("conge_paye");
  check(`init idempotent : soldeRestant mis à jour = 30 → ${r?.soldeRestant}`, Number(r?.soldeRestant) === 30);
  check(`toujours 1 ligne après ré-init (pas de doublon) → ${await countRows()}`, (await countRows()) === 1);

  // décompte 5 jours : joursPris 0→5, soldeRestant 30→25
  await updateSoldeConges(T, A, "conge_paye", ANNEE, 5);
  r = await getRow("conge_paye");
  check(`update : joursPris = 5 → ${r?.joursPris}`, Number(r?.joursPris) === 5);
  check(`update : soldeRestant = 25 (30-5) → ${r?.soldeRestant}`, Number(r?.soldeRestant) === 25);

  // recrédit (delta négatif) : joursPris 5→3, soldeRestant 25→27
  await updateSoldeConges(T, A, "conge_paye", ANNEE, -2);
  r = await getRow("conge_paye");
  check(`recrédit : joursPris = 3 → ${r?.joursPris}`, Number(r?.joursPris) === 3);
  check(`recrédit : soldeRestant = 27 → ${r?.soldeRestant}`, Number(r?.soldeRestant) === 27);

  // GREATEST plancher : décompte 50 (> reste 27) → soldeRestant plafonne à 0 (pas négatif)
  await updateSoldeConges(T, A, "conge_paye", ANNEE, 50);
  r = await getRow("conge_paye");
  check(`plancher : soldeRestant = 0 (GREATEST, pas négatif) → ${r?.soldeRestant}`, Number(r?.soldeRestant) === 0);

  // OPE-178 : update sur ligne ABSENTE (rtt non initialisé) + décompte > 0 → INSERT
  await updateSoldeConges(T, A, "rtt", ANNEE, 3);
  r = await getRow("rtt");
  check(`OPE-178 : rtt créé par décompte (joursPris=3) → ${r?.joursPris}`, Number(r?.joursPris) === 3);
  check(`OPE-178 : rtt soldeRestant = 0 (planché) → ${r?.soldeRestant}`, Number(r?.soldeRestant) === 0);

  // OPE-178 : update sur ligne ABSENTE + recrédit (<=0) → no-op (pas d'INSERT)
  const before = await countRows();
  await updateSoldeConges(T, A, "rtt", 2025, -5); // année absente + delta négatif
  check(`OPE-178 : recrédit sur ligne absente = no-op (pas d'INSERT) → ${await countRows()}`, (await countRows()) === before);

  // cleanup
  await db.delete(soldesConges).where(eq(soldesConges.technicienId, T));
} catch (e) {
  console.error("❌ EXCEPTION", e);
  ok = false;
}

console.log(ok ? "\n=== ✅ CONGES PG OK ===" : "\n=== ❌ CONGES PG FAIL ===");
process.exit(ok ? 0 : 1);
