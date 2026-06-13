// scripts/test-exports-comptables-pg.mjs — OPE-184 P0.7c-6c — exports/sync comptables sur PG.
// Vérifie genererExportFEC (3 lignes/facture, débit TTC = crédit HT+TVA),
// genererExportIIF (sections !TRNS/!SPL), getPendingItemsComptables (NOT EXISTS :
// une facture couverte par un export 'termine' disparaît), lancerSynchronisationComptable.
import {
  genererExportFEC, genererExportIIF, getPendingItemsComptables,
  lancerSynchronisationComptable, saveConfigurationComptable, getConfigurationComptable,
  createFacture, createClient, createExportComptable, getDb,
} from "../server/db.ts";
import { factures, clients, exportsComptables, configurationsComptables } from "../drizzle/schema.active.ts";
import { eq, inArray } from "drizzle-orm";

const A = 99041;
let ok = true;
const check = (label, cond) => { console.log(`${cond ? "✅" : "❌"} ${label}`); if (!cond) ok = false; };
const ids = { factures: [], clients: [] };

const fecNum = (s) => Number(String(s).replace(",", "."));

try {
  const db = await getDb();
  // reset complet de l'artisan de test (factures/clients résiduels d'un run précédent)
  await db.delete(exportsComptables).where(eq(exportsComptables.artisanId, A));
  await db.delete(configurationsComptables).where(eq(configurationsComptables.artisanId, A));
  await db.delete(factures).where(eq(factures.artisanId, A));
  await db.delete(clients).where(eq(clients.artisanId, A));

  const cli = await createClient(A, { nom: "Martin", prenom: "Lea", email: "l@m.fr" });
  ids.clients.push(cli.id);
  const fac = await createFacture(A, {
    clientId: cli.id, numero: "EXP-1", dateFacture: new Date("2026-04-10"),
    statut: "validee", totalHT: "1000.00", totalTVA: "200.00", totalTTC: "1200.00",
  });
  ids.factures.push(fac.id);

  // --- genererExportFEC : 3 lignes (client débit TTC, vente crédit HT, TVA crédit) ---
  const fec = await genererExportFEC(A, new Date("2026-04-01"), new Date("2026-04-30"));
  const fecRows = fec.split("\n");
  check(`FEC export : header + 3 lignes → ${fecRows.length}`, fecRows.length === 4);
  // colonnes Debit(11)/Credit(12) — somme débit = somme crédit
  let dSum = 0, cSum = 0;
  for (const r of fecRows.slice(1)) { const cols = r.split("\t"); dSum += fecNum(cols[11]); cSum += fecNum(cols[12]); }
  check(`FEC export équilibré : débit ${dSum} = crédit ${cSum}`, Math.abs(dSum - cSum) < 0.01);
  check(`FEC export débit total = 1200 (TTC) → ${dSum}`, Math.abs(dSum - 1200) < 0.01);

  // --- genererExportIIF : sections présentes ---
  const iif = await genererExportIIF(A, new Date("2026-04-01"), new Date("2026-04-30"));
  check(`IIF a l'entête !TRNS`, iif.includes("!TRNS"));
  check(`IIF contient une transaction INVOICE`, iif.includes("INVOICE"));
  check(`IIF clôt par ENDTRNS`, iif.includes("ENDTRNS"));

  // --- getPendingItemsComptables : facture non exportée => pending ---
  let pending = await getPendingItemsComptables(A);
  check(`pending contient la facture EXP-1 → ${pending.length}`, pending.some((p) => p.id === fac.id));

  // crée un export 'termine' couvrant avril => la facture sort du pending (NOT EXISTS)
  await createExportComptable({
    artisanId: A, logiciel: "sage", formatExport: "fec",
    periodeDebut: "2026-04-01", periodeFin: "2026-04-30", nombreEcritures: 1, statut: "termine",
  });
  pending = await getPendingItemsComptables(A);
  check(`après export 'termine' : facture EXP-1 plus dans le pending (NOT EXISTS)`, !pending.some((p) => p.id === fac.id));

  // --- lancerSynchronisationComptable : nécessite une config ---
  await saveConfigurationComptable({ artisanId: A, logiciel: "sage", formatExport: "fec" });
  // une nouvelle facture (mois courant) pour avoir un item à synchroniser
  const facNow = await createFacture(A, {
    clientId: cli.id, numero: "EXP-NOW", dateFacture: new Date(),
    statut: "validee", totalHT: "500.00", totalTVA: "100.00", totalTTC: "600.00",
  });
  ids.factures.push(facNow.id);
  const sync = await lancerSynchronisationComptable(A);
  check(`sync success → ${sync.success}`, sync.success === true);
  check(`sync a traité ≥1 item → ${sync.nbItems}`, sync.nbItems >= 1);
  const cfg = await getConfigurationComptable(A);
  check(`derniereSync renseignée après sync → ${cfg?.derniereSync}`, !!cfg?.derniereSync);

  // cleanup
  await db.delete(exportsComptables).where(eq(exportsComptables.artisanId, A));
  await db.delete(configurationsComptables).where(eq(configurationsComptables.artisanId, A));
  await db.delete(factures).where(inArray(factures.id, ids.factures));
  await db.delete(clients).where(inArray(clients.id, ids.clients));
} catch (e) {
  console.error("❌ EXCEPTION", e);
  ok = false;
}

console.log(ok ? "\n=== ✅ EXPORTS COMPTABLES PG OK ===" : "\n=== ❌ EXPORTS COMPTABLES PG FAIL ===");
process.exit(ok ? 0 : 1);
