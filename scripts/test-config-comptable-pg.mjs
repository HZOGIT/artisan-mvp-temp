// scripts/test-config-comptable-pg.mjs — OPE-184 P0.7c-6a — config comptable upsert sur PG.
// Vérifie : insert initial, update idempotent (1 seule ligne / artisan), whitelist
// (colonne non autorisée ignorée), saveSyncConfigComptable (variante partielle).
import {
  getConfigurationComptable, saveConfigurationComptable, saveSyncConfigComptable, getDb,
} from "../server/db.ts";
import { configurationsComptables } from "../drizzle/schema.active.ts";
import { eq } from "drizzle-orm";

const A = 99021;
let ok = true;
const check = (label, cond) => { console.log(`${cond ? "✅" : "❌"} ${label}`); if (!cond) ok = false; };

const countRows = async () => {
  const db = await getDb();
  const r = await db.select().from(configurationsComptables).where(eq(configurationsComptables.artisanId, A));
  return r.length;
};

try {
  // cleanup préalable
  const db = await getDb();
  await db.delete(configurationsComptables).where(eq(configurationsComptables.artisanId, A));

  // insert initial
  await saveConfigurationComptable({ artisanId: A, logiciel: "sage", compteVentes: "707000", journalVentes: "VT", maliciousCol: "DROP" });
  let cfg = await getConfigurationComptable(A);
  check(`insert : config créée`, !!cfg);
  check(`logiciel = sage → ${cfg?.logiciel}`, cfg?.logiciel === "sage");
  check(`compteVentes = 707000 → ${cfg?.compteVentes}`, cfg?.compteVentes === "707000");
  check(`whitelist : colonne maliciousCol absente du modèle`, !("maliciousCol" in (cfg || {})));
  check(`1 seule ligne après insert → ${await countRows()}`, (await countRows()) === 1);

  // update idempotent (même artisan) : modifie logiciel, ne duplique pas
  await saveConfigurationComptable({ artisanId: A, logiciel: "ebp", compteVentes: "707000", journalVentes: "VT" });
  cfg = await getConfigurationComptable(A);
  check(`update : logiciel = ebp → ${cfg?.logiciel}`, cfg?.logiciel === "ebp");
  check(`compteVentes conservé = 707000 → ${cfg?.compteVentes}`, cfg?.compteVentes === "707000");
  check(`toujours 1 seule ligne après update → ${await countRows()}`, (await countRows()) === 1);

  // variante sync partielle (ne touche que les champs sync, config existe déjà)
  await saveSyncConfigComptable(A, { syncAutoFactures: true, frequenceSync: "quotidien" });
  cfg = await getConfigurationComptable(A);
  check(`sync : syncAutoFactures = true → ${cfg?.syncAutoFactures}`, cfg?.syncAutoFactures === true);
  check(`sync : logiciel ebp préservé → ${cfg?.logiciel}`, cfg?.logiciel === "ebp");
  check(`toujours 1 seule ligne après sync → ${await countRows()}`, (await countRows()) === 1);

  // cleanup
  await db.delete(configurationsComptables).where(eq(configurationsComptables.artisanId, A));
} catch (e) {
  console.error("❌ EXCEPTION", e);
  ok = false;
}

console.log(ok ? "\n=== ✅ CONFIG COMPTABLE PG OK ===" : "\n=== ❌ CONFIG COMPTABLE PG FAIL ===");
process.exit(ok ? 0 : 1);
