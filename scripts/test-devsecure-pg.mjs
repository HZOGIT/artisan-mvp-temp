// scripts/test-devsecure-pg.mjs — OPE-184 P0.7-FIN — createDevisSecure (insertId→insertReturningId) sur PG.
import { createDevisSecure } from "../server/db-secure.ts";
import { createClient, getDb } from "../server/db.ts";
import { devis, clients } from "../drizzle/schema.active.ts";
import { eq } from "drizzle-orm";

const A = 9923001;
let ok = true;
const check = (label, cond) => { console.log(`${cond ? "✅" : "❌"} ${label}`); if (!cond) ok = false; };

try {
  const db = await getDb();
  await db.delete(devis).where(eq(devis.artisanId, A));
  await db.delete(clients).where(eq(clients.artisanId, A));

  const cli = await createClient(A, { nom: "Sec", prenom: "Ure", email: "s@u.fr" });
  const created = await createDevisSecure(A, cli.id, {
    numero: "DEVSEC-1", objet: "Test secure", statut: "brouillon",
    totalHT: "1000.00", totalTVA: "200.00", totalTTC: "1200.00",
  });
  check(`createDevisSecure : devis créé avec id → ${created?.id}`, !!created?.id && created.id > 0);
  check(`devis scopé artisan → ${created?.artisanId}`, created?.artisanId === A);
  check(`devis clientId forcé → ${created?.clientId}`, created?.clientId === cli.id);
  check(`devis totalTTC = 1200 → ${created?.totalTTC}`, Number(created?.totalTTC) === 1200);
  // relecture confirme la persistance
  const [reread] = await db.select().from(devis).where(eq(devis.id, created.id));
  check(`relecture : devis bien persisté en base → ${reread?.numero}`, reread?.numero === "DEVSEC-1");

  await db.delete(devis).where(eq(devis.artisanId, A));
  await db.delete(clients).where(eq(clients.artisanId, A));
} catch (e) {
  console.error("❌ EXCEPTION", e);
  ok = false;
}

console.log(ok ? "\n=== ✅ DEVSECURE PG OK ===" : "\n=== ❌ DEVSECURE PG FAIL ===");
process.exit(ok ? 0 : 1);
