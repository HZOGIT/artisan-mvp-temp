// scripts/test-gamification-pg.mjs — OPE-184 P0.7d-3 — badges + classement sur PG.
// verifierEtAttribuerBadges (seuil interventions atteint → badge attribué),
// calculerClassement (agrégation interventions + CA factures payées, points, rang, purge).
import {
  verifierEtAttribuerBadges, calculerClassement, getClassementTechniciens, getDb,
} from "../server/db.ts";
import { badges, badgesTechniciens, classementTechniciens, interventions, factures, clients } from "../drizzle/schema.active.ts";
import { eq, and, inArray } from "drizzle-orm";

const A = 99091, T1 = 99091, T2 = 99092;
let ok = true;
const check = (label, cond) => { console.log(`${cond ? "✅" : "❌"} ${label}`); if (!cond) ok = false; };
const ids = { interventions: [], factures: [], clients: [], badges: [] };

const mkIntervention = async (db, technicienId, statut, dateDebut, factureId) => {
  const [r] = await db.insert(interventions).values({
    artisanId: A, clientId: ids.clients[0], titre: "Test", technicienId, statut, dateDebut, factureId: factureId ?? null,
  }).returning({ id: interventions.id });
  ids.interventions.push(r.id);
  return r.id;
};

try {
  const db = await getDb();
  // reset
  await db.delete(badgesTechniciens).where(inArray(badgesTechniciens.technicienId, [T1, T2]));
  await db.delete(classementTechniciens).where(eq(classementTechniciens.artisanId, A));
  await db.delete(interventions).where(eq(interventions.artisanId, A));
  await db.delete(factures).where(eq(factures.artisanId, A));
  await db.delete(badges).where(eq(badges.artisanId, A));
  await db.delete(clients).where(eq(clients.artisanId, A));

  const [cli] = await db.insert(clients).values({ artisanId: A, nom: "C", prenom: "G", email: "g@c.fr" }).returning({ id: clients.id });
  ids.clients.push(cli.id);

  // badge "3 interventions" actif
  const [bdg] = await db.insert(badges).values({ artisanId: A, code: "INTER3", nom: "3 interventions", categorie: "interventions", seuil: 3, actif: true }).returning({ id: badges.id });
  ids.badges.push(bdg.id);

  // dateDebut = le 5 du mois courant à 10h (sûrement dans [1er, aujourd'hui] pour la période "mois" ;
  // borne haute du BETWEEN = aujourd'hui à minuit, donc on évite "now" à 12h qui tomberait hors fenêtre).
  const now = new Date(new Date().getFullYear(), new Date().getMonth(), 5, 10, 0, 0);
  // 3 interventions terminées pour T1 → seuil atteint
  await mkIntervention(db, T1, "terminee", now);
  await mkIntervention(db, T1, "terminee", now);
  await mkIntervention(db, T1, "terminee", now);
  // 1 intervention en cours (ne compte pas)
  await mkIntervention(db, T1, "en_cours", now);

  const obtenus = await verifierEtAttribuerBadges(T1, A);
  check(`badge attribué (seuil 3 interventions atteint) → ${obtenus.length}`, obtenus.some((b) => b.badgeId === bdg.id));
  // idempotence : 2e passage ne re-attribue pas un doublon nouveau
  const obtenus2 = await verifierEtAttribuerBadges(T1, A);
  const bt = await db.select().from(badgesTechniciens).where(and(eq(badgesTechniciens.technicienId, T1), eq(badgesTechniciens.badgeId, bdg.id)));
  check(`pas de doublon de badge après 2e passage → ${bt.length}`, bt.length === 1);

  // --- classement ---
  // facture payée TTC 500 liée à une intervention T2
  const [fac] = await db.insert(factures).values({ artisanId: A, clientId: cli.id, numero: "CLST-1", dateFacture: now, statut: "payee", totalHT: "416.67", totalTVA: "83.33", totalTTC: "500.00" }).returning({ id: factures.id });
  ids.factures.push(fac.id);
  // T2 : 2 interventions terminées dont 1 avec facture payée 500 → CA=500
  await mkIntervention(db, T2, "terminee", now, fac.id);
  await mkIntervention(db, T2, "terminee", now);

  const classement = await calculerClassement(A, "mois");
  const r1 = classement.find((c) => c.technicienId === T1);
  const r2 = classement.find((c) => c.technicienId === T2);
  check(`classement : T1 présent (3 interventions) → ${r1?.interventions}`, Number(r1?.interventions) === 3);
  check(`classement : T2 présent (2 interventions, CA 500) → ${r2?.interventions}/${r2?.ca}`, Number(r2?.interventions) === 2 && Number(r2?.ca) === 500);
  // points T1 = 3*10 + floor(0/100) = 30 ; T2 = 2*10 + floor(500/100) = 25
  check(`points T1 = 30 (3*10) → ${r1?.pointsTotal}`, Number(r1?.pointsTotal) === 30);
  check(`points T2 = 25 (2*10 + 500/100) → ${r2?.pointsTotal}`, Number(r2?.pointsTotal) === 25);
  // rang : T1 (3 interventions) avant T2 (2) → ORDER BY interventions DESC
  check(`rang : T1 rang 1 (plus d'interventions) → ${r1?.rang}`, Number(r1?.rang) === 1);
  check(`rang : T2 rang 2 → ${r2?.rang}`, Number(r2?.rang) === 2);

  // purge : recalcul ne duplique pas (même artisan+periode+dateDebut)
  await calculerClassement(A, "mois");
  const reload = await getClassementTechniciens(A, "mois");
  check(`recalcul idempotent : 2 lignes (purge avant insert) → ${reload.length}`, reload.length === 2);

  // cleanup
  await db.delete(badgesTechniciens).where(inArray(badgesTechniciens.technicienId, [T1, T2]));
  await db.delete(classementTechniciens).where(eq(classementTechniciens.artisanId, A));
  await db.delete(interventions).where(eq(interventions.artisanId, A));
  await db.delete(factures).where(eq(factures.artisanId, A));
  await db.delete(badges).where(eq(badges.artisanId, A));
  await db.delete(clients).where(eq(clients.artisanId, A));
} catch (e) {
  console.error("❌ EXCEPTION", e);
  ok = false;
}

console.log(ok ? "\n=== ✅ GAMIFICATION PG OK ===" : "\n=== ❌ GAMIFICATION PG FAIL ===");
process.exit(ok ? 0 : 1);
