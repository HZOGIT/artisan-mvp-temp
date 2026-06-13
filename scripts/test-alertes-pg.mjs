// scripts/test-alertes-pg.mjs — OPE-184 P0.7d-5 — alertes prévisions CA sur PG.
// saveConfigAlertePrevision (upsert whitelist sur artisanId),
// verifierEcartsEtEnvoyerAlertes (écart CA réel vs prévisionnel, seuil, anti-spam).
import {
  saveConfigAlertePrevision, getConfigAlertePrevision, verifierEcartsEtEnvoyerAlertes,
  getHistoriqueAlertesPrevisions, createFacture, createClient, getDb,
} from "../server/db.ts";
import { configAlertesPrevisions, historiqueAlertesPrevisions, previsionsCA, factures, clients } from "../drizzle/schema.active.ts";
import { eq } from "drizzle-orm";

const A = 99111;
const now = new Date();
const mois = now.getMonth() + 1, annee = now.getFullYear();
let ok = true;
const check = (label, cond) => { console.log(`${cond ? "✅" : "❌"} ${label}`); if (!cond) ok = false; };
const countCfg = async () => {
  const db = await getDb();
  return (await db.select().from(configAlertesPrevisions).where(eq(configAlertesPrevisions.artisanId, A))).length;
};

try {
  const db = await getDb();
  // reset
  await db.delete(historiqueAlertesPrevisions).where(eq(historiqueAlertesPrevisions.artisanId, A));
  await db.delete(configAlertesPrevisions).where(eq(configAlertesPrevisions.artisanId, A));
  await db.delete(previsionsCA).where(eq(previsionsCA.artisanId, A));
  await db.delete(factures).where(eq(factures.artisanId, A));
  await db.delete(clients).where(eq(clients.artisanId, A));

  // config alerte : actif, seuils 10%
  await saveConfigAlertePrevision({ artisanId: A, actif: true, seuilAlertePositif: "10.00", seuilAlerteNegatif: "10.00", alerteEmail: true, alerteSms: false, maliciousCol: "DROP" });
  let cfg = await getConfigAlertePrevision(A);
  check(`config créée, actif=true → ${cfg?.actif}`, cfg?.actif === true);
  check(`whitelist : maliciousCol ignorée`, !("maliciousCol" in (cfg || {})));
  check(`1 ligne config → ${await countCfg()}`, (await countCfg()) === 1);

  // upsert config idempotent
  await saveConfigAlertePrevision({ artisanId: A, actif: true, seuilAlertePositif: "15.00", seuilAlerteNegatif: "15.00", alerteEmail: true });
  cfg = await getConfigAlertePrevision(A);
  check(`config upsert : seuilPositif=15 → ${cfg?.seuilAlertePositif}`, Number(cfg?.seuilAlertePositif) === 15);
  check(`config toujours 1 ligne (pas de doublon) → ${await countCfg()}`, (await countCfg()) === 1);

  // prévision CA = 1000 pour le mois courant
  await db.insert(previsionsCA).values({ artisanId: A, mois, annee, caPrevisionnel: "1000.00" });

  // CA réel = 500 (facture payée) → écart -50% < -15% → depassement_negatif
  const cli = await createClient(A, { nom: "Al", prenom: "Ert", email: "a@e.fr" });
  await createFacture(A, { clientId: cli.id, numero: "ALERT-1", dateFacture: now, statut: "payee", totalHT: "416.67", totalTVA: "83.33", totalTTC: "500.00" });

  const alertes = await verifierEcartsEtEnvoyerAlertes(A);
  check(`alerte générée (écart -50% dépasse seuil) → ${alertes.length}`, alertes.length === 1);
  check(`type = depassement_negatif → ${alertes[0]?.typeAlerte}`, alertes[0]?.typeAlerte === "depassement_negatif");
  check(`caPrevisionnel=1000 enregistré → ${alertes[0]?.caPrevisionnel}`, Number(alertes[0]?.caPrevisionnel) === 1000);
  check(`caRealise=500 enregistré → ${alertes[0]?.caRealise}`, Number(alertes[0]?.caRealise) === 500);
  check(`ecartPourcentage=-50 → ${alertes[0]?.ecartPourcentage}`, Math.round(Number(alertes[0]?.ecartPourcentage)) === -50);

  // anti-spam : 2e appel même mois/type → pas de nouvelle alerte
  const alertes2 = await verifierEcartsEtEnvoyerAlertes(A);
  check(`anti-spam : 2e appel = aucune nouvelle alerte → ${alertes2.length}`, alertes2.length === 0);
  const hist = await getHistoriqueAlertesPrevisions(A);
  check(`historique : 1 seule alerte (pas de spam) → ${hist.length}`, hist.length === 1);

  // config inactive → pas d'alerte
  await saveConfigAlertePrevision({ artisanId: A, actif: false, alerteEmail: true });
  await db.delete(historiqueAlertesPrevisions).where(eq(historiqueAlertesPrevisions.artisanId, A));
  const alertes3 = await verifierEcartsEtEnvoyerAlertes(A);
  check(`config inactive → aucune alerte → ${alertes3.length}`, alertes3.length === 0);

  // cleanup
  await db.delete(historiqueAlertesPrevisions).where(eq(historiqueAlertesPrevisions.artisanId, A));
  await db.delete(configAlertesPrevisions).where(eq(configAlertesPrevisions.artisanId, A));
  await db.delete(previsionsCA).where(eq(previsionsCA.artisanId, A));
  await db.delete(factures).where(eq(factures.artisanId, A));
  await db.delete(clients).where(eq(clients.artisanId, A));
} catch (e) {
  console.error("❌ EXCEPTION", e);
  ok = false;
}

console.log(ok ? "\n=== ✅ ALERTES PG OK ===" : "\n=== ❌ ALERTES PG FAIL ===");
process.exit(ok ? 0 : 1);
