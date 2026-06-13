// scripts/test-push-pg.mjs — OPE-184 P0.7d-4 — push subscriptions sur PG.
// savePushSubscription (upsert check-then-act sur (technicienId, endpoint), réactive),
// deletePushSubscription (soft-delete actif=false), getPushSubscriptionByEndpoint.
import {
  savePushSubscription, deletePushSubscription, getPushSubscriptionByEndpoint, getDb,
} from "../server/db.ts";
import { pushSubscriptions } from "../drizzle/schema.active.ts";
import { eq } from "drizzle-orm";

const T = 99101;
const EP = "https://push.example.com/sub/abc123";
let ok = true;
const check = (label, cond) => { console.log(`${cond ? "✅" : "❌"} ${label}`); if (!cond) ok = false; };
const countRows = async () => {
  const db = await getDb();
  return (await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.technicienId, T))).length;
};

try {
  const db = await getDb();
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.technicienId, T));

  // insert initial
  const s1 = await savePushSubscription({ technicienId: T, endpoint: EP, p256dh: "KEY1", auth: "AUTH1", userAgent: "Firefox" });
  check(`insert : subscription créée → ${s1?.id}`, !!s1?.id);
  check(`p256dh = KEY1 → ${s1?.p256dh}`, s1?.p256dh === "KEY1");
  check(`actif = true → ${s1?.actif}`, s1?.actif === true);
  check(`1 ligne après insert → ${await countRows()}`, (await countRows()) === 1);

  // upsert même (tech, endpoint) : met à jour les clés, PAS de doublon (corrige bug latent)
  const s2 = await savePushSubscription({ technicienId: T, endpoint: EP, p256dh: "KEY2", auth: "AUTH2", userAgent: "Chrome" });
  check(`upsert : p256dh mis à jour KEY2 → ${s2?.p256dh}`, s2?.p256dh === "KEY2");
  check(`upsert : userAgent mis à jour Chrome → ${s2?.userAgent}`, s2?.userAgent === "Chrome");
  check(`toujours 1 ligne après upsert (pas de doublon) → ${await countRows()}`, (await countRows()) === 1);

  // soft-delete : actif=false
  await deletePushSubscription(EP);
  let byEp = await getPushSubscriptionByEndpoint(EP);
  check(`soft-delete : actif = false → ${byEp?.actif}`, byEp?.actif === false);
  check(`soft-delete : ligne toujours présente (pas de DELETE physique) → ${await countRows()}`, (await countRows()) === 1);

  // ré-abonnement après soft-delete : réactive (actif=true), pas de doublon
  const s3 = await savePushSubscription({ technicienId: T, endpoint: EP, p256dh: "KEY3", auth: "AUTH3", userAgent: "Safari" });
  check(`réabonnement : actif réactivé = true → ${s3?.actif}`, s3?.actif === true);
  check(`réabonnement : toujours 1 ligne → ${await countRows()}`, (await countRows()) === 1);

  // endpoint différent → nouvelle ligne
  await savePushSubscription({ technicienId: T, endpoint: EP + "/other", p256dh: "KEY4", auth: "AUTH4", userAgent: "Edge" });
  check(`endpoint différent → 2 lignes → ${await countRows()}`, (await countRows()) === 2);

  // cleanup
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.technicienId, T));
} catch (e) {
  console.error("❌ EXCEPTION", e);
  ok = false;
}

console.log(ok ? "\n=== ✅ PUSH PG OK ===" : "\n=== ❌ PUSH PG FAIL ===");
process.exit(ok ? 0 : 1);
