// scripts/test-sessions-pg.mjs — OPE-184 P0.7d-10 — active_sessions sur PG.
// createSession (upsert (user_id, token), expiry DATE_ADD→JS), getActiveSessions/
// countActiveSessions (filtre expires_at > NOW()), deleteOldestSession, cleanExpiredSessions.
import {
  getActiveSessions, countActiveSessions, createSession,
  deleteOldestSession, cleanExpiredSessions, getDb,
} from "../server/db.ts";
import { activeSessions } from "../drizzle/schema.active.ts";
import { eq } from "drizzle-orm";

const U = 9916001, A = 9916001;
let ok = true;
const check = (label, cond) => { console.log(`${cond ? "✅" : "❌"} ${label}`); if (!cond) ok = false; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  const db = await getDb();
  await db.delete(activeSessions).where(eq(activeSessions.user_id, U));

  // crée 2 sessions actives (TTL 7j)
  await createSession({ userId: U, artisanId: A, token: "tok-1", fingerprint: "fp-1", ip: "1.1.1.1" });
  await sleep(1100); // pour départager last_active_at (tok-1 plus ancienne)
  await createSession({ userId: U, artisanId: A, token: "tok-2", fingerprint: "fp-2", ip: "2.2.2.2" });

  let sessions = await getActiveSessions(U);
  check(`getActiveSessions : 2 sessions actives → ${sessions.length}`, sessions.length === 2);
  check(`mapping camelCase : sessionToken présent → ${sessions[0]?.sessionToken}`, !!sessions[0]?.sessionToken);
  check(`expiresAt dans le futur (Date) → ${sessions[0]?.expiresAt?.toISOString?.()}`, sessions[0]?.expiresAt instanceof Date && sessions[0].expiresAt.getTime() > Date.now());
  check(`countActiveSessions = 2 → ${await countActiveSessions(U)}`, (await countActiveSessions(U)) === 2);

  // upsert : re-login tok-1 → prolonge ET rafraîchit last_active_at (tok-1 devient la plus RÉCENTE) ; pas de doublon
  await createSession({ userId: U, artisanId: A, token: "tok-1", fingerprint: "fp-1", ip: "9.9.9.9", ttlDays: 14 });
  sessions = await getActiveSessions(U);
  check(`upsert : toujours 2 sessions (pas de doublon) → ${sessions.length}`, sessions.length === 2);

  // deleteOldestSession : après le refresh de tok-1, la plus ANCIENNE active est tok-2 → supprimée
  await deleteOldestSession(U);
  sessions = await getActiveSessions(U);
  const tokens = sessions.map((s) => s.sessionToken);
  check(`deleteOldestSession : tok-2 (plus ancienne) supprimée → reste [tok-1]`, sessions.length === 1 && tokens.includes("tok-1") && !tokens.includes("tok-2"));

  // session expirée : insérée directement avec expires_at passé → exclue de getActiveSessions
  await db.insert(activeSessions).values({ user_id: U, artisan_id: A, session_token: "tok-expired", expires_at: new Date(Date.now() - 3600 * 1000) });
  check(`session expirée exclue de getActiveSessions → ${(await getActiveSessions(U)).length}`, (await getActiveSessions(U)).length === 1);
  check(`countActiveSessions ignore l'expirée = 1 → ${await countActiveSessions(U)}`, (await countActiveSessions(U)) === 1);

  // cleanExpiredSessions : supprime physiquement l'expirée, pas les actives
  const cleaned = await cleanExpiredSessions();
  check(`cleanExpiredSessions : ≥1 supprimée → ${cleaned}`, cleaned >= 1);
  const remaining = await db.select().from(activeSessions).where(eq(activeSessions.user_id, U));
  check(`après clean : 1 session active restante (tok-1) → ${remaining.length}`, remaining.length === 1 && remaining[0].session_token === "tok-1");

  // cleanup
  await db.delete(activeSessions).where(eq(activeSessions.user_id, U));
} catch (e) {
  console.error("❌ EXCEPTION", e);
  ok = false;
}

console.log(ok ? "\n=== ✅ SESSIONS PG OK ===" : "\n=== ❌ SESSIONS PG FAIL ===");
process.exit(ok ? 0 : 1);
