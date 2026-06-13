// scripts/test-scheduler-pg.mjs — OPE-184 P0.7e-6 — scheduler (trials + emails) sur PG.
// expireTrials (trial_ends_at < NOW → expired), getTrialEndingRecipients (J-N),
// getDiscoveryRecipients (J+N après inscription). Jointures artisans/users/subscriptions.
import {
  expireTrials, getTrialEndingRecipients, getDiscoveryRecipients, getDb,
} from "../server/db.ts";
import { subscriptions, artisans, users } from "../drizzle/schema.active.ts";
import { eq, inArray } from "drizzle-orm";

let ok = true;
const check = (label, cond) => { console.log(`${cond ? "✅" : "❌"} ${label}`); if (!cond) ok = false; };
const dayOffset = (n) => new Date(Date.now() + n * 24 * 3600 * 1000);
const UIDS = [9921001, 9921002, 9921003];
const userIds = [], artisanIds = [];

try {
  const db = await getDb();
  // cleanup préalable
  await db.delete(users).where(inArray(users.id, UIDS));

  // 3 users/artisans : A=trial fini (J-2), B=trial J-3, C=inscrit J+3 (createdAt -3j)
  const mk = async (uid, email, prenom, createdAt) => {
    const [u] = await db.insert(users).values({ id: uid, email, prenom, password: "x", createdAt: createdAt || new Date() }).returning({ id: users.id });
    userIds.push(u.id);
    const [a] = await db.insert(artisans).values({ userId: u.id }).returning({ id: artisans.id });
    artisanIds.push(a.id);
    return a.id;
  };
  const aA = await mk(UIDS[0], "a@trial.fr", "Alice");
  const aB = await mk(UIDS[1], "b@trial.fr", "Bob");
  const aC = await mk(UIDS[2], "c@signup.fr", "Carol", dayOffset(-3));

  // subscriptions : A trialing échu (hier), B trialing finit dans 3j
  await db.insert(subscriptions).values({ artisan_id: aA, status: "trialing", trial_ends_at: dayOffset(-1) });
  await db.insert(subscriptions).values({ artisan_id: aB, status: "trialing", trial_ends_at: dayOffset(3) });

  // --- expireTrials : A bascule expired, B reste trialing ---
  const expired = await expireTrials();
  check(`expireTrials : ≥1 expiré (au moins A) → ${expired}`, expired >= 1);
  const [subA] = await db.select().from(subscriptions).where(eq(subscriptions.artisan_id, aA));
  check(`A : status=expired + plan=expired → ${subA?.status}/${subA?.plan}`, subA?.status === "expired" && subA?.plan === "expired");
  const [subB] = await db.select().from(subscriptions).where(eq(subscriptions.artisan_id, aB));
  check(`B : reste trialing (finit dans 3j) → ${subB?.status}`, subB?.status === "trialing");

  // --- getTrialEndingRecipients(3) : B (finit dans 3j), pas A (expiré) ---
  const j3 = await getTrialEndingRecipients(3);
  check(`J-3 : Bob présent (trial finit dans 3j) → ${j3.some((r) => r.artisanId === aB)}`, j3.some((r) => r.artisanId === aB && r.email === "b@trial.fr"));
  check(`J-3 : Alice absente (déjà expirée, plus trialing)`, !j3.some((r) => r.artisanId === aA));
  check(`J-3 : prenom Bob récupéré (jointure users) → ${j3.find((r) => r.artisanId === aB)?.prenom}`, j3.find((r) => r.artisanId === aB)?.prenom === "Bob");

  // J-1 : personne (aucun trial ne finit demain)
  const j1 = await getTrialEndingRecipients(1);
  check(`J-1 : ni A ni B`, !j1.some((r) => r.artisanId === aA || r.artisanId === aB));

  // --- getDiscoveryRecipients(3) : C (inscrit il y a 3j) ---
  const disc = await getDiscoveryRecipients(3);
  check(`Découverte J+3 : Carol présente (inscrite il y a 3j) → ${disc.some((r) => r.artisanId === aC)}`, disc.some((r) => r.artisanId === aC && r.email === "c@signup.fr"));
  check(`Découverte J+3 : Alice/Bob absents (inscrits aujourd'hui)`, !disc.some((r) => r.artisanId === aA || r.artisanId === aB));

  // cleanup
  await db.delete(subscriptions).where(inArray(subscriptions.artisan_id, artisanIds));
  await db.delete(artisans).where(inArray(artisans.id, artisanIds));
  await db.delete(users).where(inArray(users.id, userIds));
} catch (e) {
  console.error("❌ EXCEPTION", e);
  ok = false;
}

console.log(ok ? "\n=== ✅ SCHEDULER PG OK ===" : "\n=== ❌ SCHEDULER PG FAIL ===");
process.exit(ok ? 0 : 1);
