// scripts/test-seed-bootstrap-pg.mjs — OPE-184 P0.7e-4 — bootstrap/seed démo sur PG.
// migrateDefaultObjectifs (UPDATE défauts là où 0/null), seedDemoNotifications,
// seedDemoRdv (one-time guards, idempotents). Artisan 1 = compte démo.
import {
  migrateDefaultObjectifs, seedDemoNotifications, seedDemoRdv, getDb,
} from "../server/db.ts";
import { notifications, rdvEnLigne, parametresArtisan } from "../drizzle/schema.active.ts";
import { eq } from "drizzle-orm";

let ok = true;
const check = (label, cond) => { console.log(`${cond ? "✅" : "❌"} ${label}`); if (!cond) ok = false; };

try {
  const db = await getDb();
  const countNotif = async () => (await db.select().from(notifications).where(eq(notifications.artisanId, 1))).length;
  const countRdv = async () => (await db.select().from(rdvEnLigne).where(eq(rdvEnLigne.artisanId, 1))).length;

  // reset démo artisan 1
  await db.delete(notifications).where(eq(notifications.artisanId, 1));
  await db.delete(rdvEnLigne).where(eq(rdvEnLigne.artisanId, 1));

  // --- seedDemoNotifications ---
  const n1 = await seedDemoNotifications();
  check(`seedDemoNotifications : 5 insérées → ${n1}`, n1 === 5);
  check(`5 notifications en base → ${await countNotif()}`, (await countNotif()) === 5);
  // lu booléen correctement converti (2 lues)
  const lues = (await db.select().from(notifications).where(eq(notifications.artisanId, 1))).filter((x) => x.lu === true);
  check(`lu booléen : 2 notifs lues (lu=true) → ${lues.length}`, lues.length === 2);
  // idempotent : 2e appel = skip
  const n2 = await seedDemoNotifications();
  check(`idempotent : 2e appel insère 0 → ${n2}`, n2 === 0);
  check(`toujours 5 notifications (pas de doublon) → ${await countNotif()}`, (await countNotif()) === 5);

  // --- seedDemoRdv ---
  const r1 = await seedDemoRdv();
  check(`seedDemoRdv : 2 insérés → ${r1}`, r1 === 2);
  check(`2 RDV en base → ${await countRdv()}`, (await countRdv()) === 2);
  const rdvs = await db.select().from(rdvEnLigne).where(eq(rdvEnLigne.artisanId, 1));
  check(`RDV statut=en_attente → ${rdvs[0]?.statut}`, rdvs.every((r) => r.statut === "en_attente"));
  check(`RDV urgence variée (normale + urgente)`, rdvs.some((r) => r.urgence === "normale") && rdvs.some((r) => r.urgence === "urgente"));
  const r2 = await seedDemoRdv();
  check(`idempotent : 2e appel insère 0 → ${r2}`, r2 === 0);
  check(`toujours 2 RDV (pas de doublon) → ${await countRdv()}`, (await countRdv()) === 2);

  // --- migrateDefaultObjectifs ---
  // crée un paramètre artisan avec objectifs à 0
  await db.delete(parametresArtisan).where(eq(parametresArtisan.artisanId, 9920001));
  await db.insert(parametresArtisan).values({ artisanId: 9920001, objectifCA: "0", objectifDevis: 0, objectifClients: 0 });
  await migrateDefaultObjectifs();
  const [pa] = await db.select().from(parametresArtisan).where(eq(parametresArtisan.artisanId, 9920001));
  check(`migrate : objectifCA 0 → 10000 → ${pa?.objectifCA}`, Number(pa?.objectifCA) === 10000);
  check(`migrate : objectifDevis 0 → 15 → ${pa?.objectifDevis}`, pa?.objectifDevis === 15);
  check(`migrate : objectifClients 0 → 5 → ${pa?.objectifClients}`, pa?.objectifClients === 5);

  // ne réécrase PAS un objectif déjà défini
  await db.update(parametresArtisan).set({ objectifCA: "50000", objectifDevis: 99 }).where(eq(parametresArtisan.artisanId, 9920001));
  await migrateDefaultObjectifs();
  const [pa2] = await db.select().from(parametresArtisan).where(eq(parametresArtisan.artisanId, 9920001));
  check(`migrate idempotent : objectif déjà défini non écrasé (50000) → ${pa2?.objectifCA}`, Number(pa2?.objectifCA) === 50000);

  // cleanup
  await db.delete(notifications).where(eq(notifications.artisanId, 1));
  await db.delete(rdvEnLigne).where(eq(rdvEnLigne.artisanId, 1));
  await db.delete(parametresArtisan).where(eq(parametresArtisan.artisanId, 9920001));
} catch (e) {
  console.error("❌ EXCEPTION", e);
  ok = false;
}

console.log(ok ? "\n=== ✅ SEED BOOTSTRAP PG OK ===" : "\n=== ❌ SEED BOOTSTRAP PG FAIL ===");
process.exit(ok ? 0 : 1);
