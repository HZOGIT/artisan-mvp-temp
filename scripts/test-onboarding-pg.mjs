// scripts/test-onboarding-pg.mjs — OPE-184 P0.7d-7 — onboarding artisan sur PG.
// updateArtisanOnboarding (set partiel dynamique : onboardingCompleted/metier/plan),
// getArtisanOnboardingStatus (lecture, null si artisan absent).
import {
  updateArtisanOnboarding, getArtisanOnboardingStatus, getDb,
} from "../server/db.ts";
import { artisans } from "../drizzle/schema.active.ts";
import { eq } from "drizzle-orm";

const UID = 9913001;
let ok = true;
const check = (label, cond) => { console.log(`${cond ? "✅" : "❌"} ${label}`); if (!cond) ok = false; };

try {
  const db = await getDb();
  await db.delete(artisans).where(eq(artisans.userId, UID));
  const [art] = await db.insert(artisans).values({ userId: UID }).returning({ id: artisans.id });
  const A = art.id;

  // état initial : onboardingCompleted=false (default), metier/plan défaut
  let st = await getArtisanOnboardingStatus(A);
  check(`statut initial : onboardingCompleted=false → ${st?.onboardingCompleted}`, st?.onboardingCompleted === false);
  check(`plan défaut = essentiel → ${st?.plan}`, st?.plan === "essentiel");
  check(`metier null par défaut → ${st?.metier}`, st?.metier === null);

  // set partiel : seulement metier
  await updateArtisanOnboarding(A, { metier: "plombier" });
  st = await getArtisanOnboardingStatus(A);
  check(`set partiel metier=plombier → ${st?.metier}`, st?.metier === "plombier");
  check(`onboardingCompleted inchangé (false) → ${st?.onboardingCompleted}`, st?.onboardingCompleted === false);
  check(`plan inchangé (essentiel) → ${st?.plan}`, st?.plan === "essentiel");

  // set partiel : onboardingCompleted + plan
  await updateArtisanOnboarding(A, { onboardingCompleted: true, plan: "pro" });
  st = await getArtisanOnboardingStatus(A);
  check(`onboardingCompleted=true → ${st?.onboardingCompleted}`, st?.onboardingCompleted === true);
  check(`plan=pro → ${st?.plan}`, st?.plan === "pro");
  check(`metier conservé (plombier) → ${st?.metier}`, st?.metier === "plombier");

  // set vide → no-op (pas d'erreur)
  await updateArtisanOnboarding(A, {});
  st = await getArtisanOnboardingStatus(A);
  check(`set vide = no-op (valeurs conservées) → ${st?.metier}/${st?.plan}`, st?.metier === "plombier" && st?.plan === "pro");

  // artisan inexistant → null
  const stNull = await getArtisanOnboardingStatus(99999999);
  check(`artisan inexistant → null`, stNull === null);

  // cleanup
  await db.delete(artisans).where(eq(artisans.id, A));
} catch (e) {
  console.error("❌ EXCEPTION", e);
  ok = false;
}

console.log(ok ? "\n=== ✅ ONBOARDING PG OK ===" : "\n=== ❌ ONBOARDING PG FAIL ===");
process.exit(ok ? 0 : 1);
