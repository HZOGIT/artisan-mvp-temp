// scripts/test-subscriptions-pg.mjs — OPE-184 P0.7d-8 — subscriptions (billing/Stripe) sur PG.
// updateSubscription (upsert atomique sur artisan_id : insert avec défauts puis update partiel),
// getSubscription, getSubscriptionByCustomerId. Intégrité plan/limites + camelCase mapping.
import {
  getSubscription, updateSubscription, getSubscriptionByCustomerId, getDb,
} from "../server/db.ts";
import { subscriptions } from "../drizzle/schema.active.ts";
import { eq } from "drizzle-orm";

const A = 9914001;
let ok = true;
const check = (label, cond) => { console.log(`${cond ? "✅" : "❌"} ${label}`); if (!cond) ok = false; };
const countRows = async () => {
  const db = await getDb();
  return (await db.select().from(subscriptions).where(eq(subscriptions.artisan_id, A))).length;
};

try {
  const db = await getDb();
  await db.delete(subscriptions).where(eq(subscriptions.artisan_id, A));

  // pas de ligne → null (essai gratuit côté appelant)
  check(`getSubscription absent → null`, (await getSubscription(A)) === null);

  // 1er update = INSERT avec défauts de schéma + overrides
  await updateSubscription(A, { stripeCustomerId: "cus_ABC", plan: "pro", status: "active" });
  let sub = await getSubscription(A);
  check(`insert : sub créée → ${sub?.id}`, !!sub?.id);
  check(`mapping camelCase : stripeCustomerId=cus_ABC → ${sub?.stripeCustomerId}`, sub?.stripeCustomerId === "cus_ABC");
  check(`plan=pro → ${sub?.plan}`, sub?.plan === "pro");
  check(`status=active → ${sub?.status}`, sub?.status === "active");
  // défauts de schéma appliqués (limites)
  check(`défaut maxUsers=1 → ${sub?.maxUsers}`, sub?.maxUsers === 1);
  check(`défaut maxDevicesPerUser=3 → ${sub?.maxDevicesPerUser}`, sub?.maxDevicesPerUser === 3);
  check(`défaut maxConcurrentSessions=2 → ${sub?.maxConcurrentSessions}`, sub?.maxConcurrentSessions === 2);
  check(`défaut cancelAtPeriodEnd=false → ${sub?.cancelAtPeriodEnd}`, sub?.cancelAtPeriodEnd === false);
  check(`1 ligne après insert → ${await countRows()}`, (await countRows()) === 1);

  // 2e update = UPDATE partiel (artisan_id conflit) : change les limites, conserve le reste
  await updateSubscription(A, { maxUsers: 5, maxDevicesPerUser: 10, cancelAtPeriodEnd: true });
  sub = await getSubscription(A);
  check(`update : maxUsers=5 → ${sub?.maxUsers}`, sub?.maxUsers === 5);
  check(`update : maxDevicesPerUser=10 → ${sub?.maxDevicesPerUser}`, sub?.maxDevicesPerUser === 10);
  check(`update : cancelAtPeriodEnd=true → ${sub?.cancelAtPeriodEnd}`, sub?.cancelAtPeriodEnd === true);
  check(`update : plan=pro conservé → ${sub?.plan}`, sub?.plan === "pro");
  check(`update : stripeCustomerId conservé → ${sub?.stripeCustomerId}`, sub?.stripeCustomerId === "cus_ABC");
  check(`toujours 1 ligne après upsert (artisan_id unique, pas de doublon) → ${await countRows()}`, (await countRows()) === 1);

  // dates (timestamps) : trialEndsAt / currentPeriodEnd
  const end = new Date("2026-12-31T00:00:00Z");
  await updateSubscription(A, { currentPeriodEnd: end, trialEndsAt: null });
  sub = await getSubscription(A);
  check(`currentPeriodEnd persistée (Date) → ${sub?.currentPeriodEnd?.toISOString?.()}`, sub?.currentPeriodEnd instanceof Date && sub.currentPeriodEnd.getTime() === end.getTime());

  // lookup par customerId (webhook Stripe)
  const byCust = await getSubscriptionByCustomerId("cus_ABC");
  check(`getSubscriptionByCustomerId → bonne sub (artisanId=${A}) → ${byCust?.artisanId}`, byCust?.artisanId === A);
  const byCustAbsent = await getSubscriptionByCustomerId("cus_INEXISTANT");
  check(`getSubscriptionByCustomerId inexistant → null`, byCustAbsent === null);

  // set vide = no-op
  await updateSubscription(A, {});
  check(`set vide = no-op (toujours 1 ligne, plan pro) → ${(await getSubscription(A))?.plan}`, (await getSubscription(A))?.plan === "pro");

  // cleanup
  await db.delete(subscriptions).where(eq(subscriptions.artisan_id, A));
} catch (e) {
  console.error("❌ EXCEPTION", e);
  ok = false;
}

console.log(ok ? "\n=== ✅ SUBSCRIPTIONS PG OK ===" : "\n=== ❌ SUBSCRIPTIONS PG FAIL ===");
process.exit(ok ? 0 : 1);
