// scripts/test-couleurs-pg.mjs — OPE-184 P0.7d-1 — couleurs calendrier sur PG.
// Vérifie setCouleurIntervention (upsert idempotent PK composite),
// getCouleursCalendrier (map), setCouleursMultiples (batch upsert), delete.
import {
  getCouleursCalendrier, setCouleurIntervention, deleteCouleurIntervention,
  setCouleursMultiples, getDb,
} from "../server/db.ts";
import { couleursInterventions } from "../drizzle/schema.active.ts";
import { eq } from "drizzle-orm";

const A = 99071;
let ok = true;
const check = (label, cond) => { console.log(`${cond ? "✅" : "❌"} ${label}`); if (!cond) ok = false; };

const countRows = async () => {
  const db = await getDb();
  return (await db.select().from(couleursInterventions).where(eq(couleursInterventions.artisanId, A))).length;
};

try {
  const db = await getDb();
  await db.delete(couleursInterventions).where(eq(couleursInterventions.artisanId, A));

  // insert simple
  await setCouleurIntervention(A, 101, "#FF0000");
  let map = await getCouleursCalendrier(A);
  check(`set + get : intervention 101 = #FF0000 → ${map[101]}`, map[101] === "#FF0000");
  check(`1 ligne après insert → ${await countRows()}`, (await countRows()) === 1);

  // upsert idempotent : même (artisan, intervention) → update couleur, pas de doublon
  await setCouleurIntervention(A, 101, "#00FF00");
  map = await getCouleursCalendrier(A);
  check(`upsert : couleur mise à jour #00FF00 → ${map[101]}`, map[101] === "#00FF00");
  check(`toujours 1 ligne après upsert (PK composite) → ${await countRows()}`, (await countRows()) === 1);

  // batch multi-rows : 102, 103 + update 101
  await setCouleursMultiples(A, { 101: "#0000FF", 102: "#FFFF00", 103: "#FF00FF" });
  map = await getCouleursCalendrier(A);
  check(`batch : 101 mis à jour #0000FF → ${map[101]}`, map[101] === "#0000FF");
  check(`batch : 102 = #FFFF00 → ${map[102]}`, map[102] === "#FFFF00");
  check(`batch : 103 = #FF00FF → ${map[103]}`, map[103] === "#FF00FF");
  check(`3 lignes après batch (101 mis à jour, pas dupliqué) → ${await countRows()}`, (await countRows()) === 3);

  // delete
  await deleteCouleurIntervention(A, 102);
  map = await getCouleursCalendrier(A);
  check(`delete : 102 absent → ${map[102]}`, map[102] === undefined);
  check(`2 lignes après delete → ${await countRows()}`, (await countRows()) === 2);

  // cleanup
  await db.delete(couleursInterventions).where(eq(couleursInterventions.artisanId, A));
} catch (e) {
  console.error("❌ EXCEPTION", e);
  ok = false;
}

console.log(ok ? "\n=== ✅ COULEURS PG OK ===" : "\n=== ❌ COULEURS PG FAIL ===");
process.exit(ok ? 0 : 1);
