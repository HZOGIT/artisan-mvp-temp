// scripts/test-dashboard-pg.mjs — OPE-184 P0.7d-11 — getDashboardStats sur PG.
// 9 agrégations : caMonth/caYear (factures payées, EXTRACT MONTH/YEAR), devisEnCours,
// facturesImpayees, totalClients, interventionsAVenir, totalDevis/Factures/Interventions.
import { getDashboardStats, createFacture, createClient, getDb } from "../server/db.ts";
import { factures, devis, clients, interventions } from "../drizzle/schema.active.ts";
import { eq } from "drizzle-orm";

const A = 9917001;
let ok = true;
const check = (label, cond) => { console.log(`${cond ? "✅" : "❌"} ${label}`); if (!cond) ok = false; };

try {
  const db = await getDb();
  // reset
  await db.delete(factures).where(eq(factures.artisanId, A));
  await db.delete(devis).where(eq(devis.artisanId, A));
  await db.delete(interventions).where(eq(interventions.artisanId, A));
  await db.delete(clients).where(eq(clients.artisanId, A));

  const cli = await createClient(A, { nom: "Dash", prenom: "Board", email: "d@b.fr" });
  const now = new Date();
  const lastYear = new Date(now.getFullYear() - 1, 5, 15);

  // factures payées : 1 ce mois (1000), 1 cette année mois différent (500), 1 l'an dernier (9999)
  await createFacture(A, { clientId: cli.id, numero: "D-PAYE-MOIS", dateFacture: now, datePaiement: now, statut: "payee", totalHT: "833.33", totalTVA: "166.67", totalTTC: "1000.00" });
  const debutAnnee = new Date(now.getFullYear(), 0, 10);
  await createFacture(A, { clientId: cli.id, numero: "D-PAYE-AN", dateFacture: debutAnnee, datePaiement: debutAnnee, statut: "payee", totalHT: "416.67", totalTVA: "83.33", totalTTC: "500.00" });
  await createFacture(A, { clientId: cli.id, numero: "D-PAYE-ANPASSE", dateFacture: lastYear, datePaiement: lastYear, statut: "payee", totalHT: "8332.50", totalTVA: "1666.50", totalTTC: "9999.00" });
  // facture impayée (en_retard) 300 → compte dans facturesImpayees, pas dans caYear
  await createFacture(A, { clientId: cli.id, numero: "D-IMPAYE", dateFacture: now, statut: "en_retard", totalHT: "250.00", totalTVA: "50.00", totalTTC: "300.00" });

  // devis : 2 en cours (brouillon+envoye) + 1 accepté
  await db.insert(devis).values({ artisanId: A, clientId: cli.id, numero: "DEV-1", statut: "brouillon", totalHT: "100", totalTVA: "20", totalTTC: "120" });
  await db.insert(devis).values({ artisanId: A, clientId: cli.id, numero: "DEV-2", statut: "envoye", totalHT: "100", totalTVA: "20", totalTTC: "120" });
  await db.insert(devis).values({ artisanId: A, clientId: cli.id, numero: "DEV-3", statut: "accepte", totalHT: "100", totalTVA: "20", totalTTC: "120" });

  // interventions : 1 planifiée future, 1 planifiée passée, 1 terminée
  const future = new Date(now.getTime() + 5 * 24 * 3600 * 1000);
  const past = new Date(now.getTime() - 5 * 24 * 3600 * 1000);
  await db.insert(interventions).values({ artisanId: A, clientId: cli.id, titre: "Future", statut: "planifiee", dateDebut: future });
  await db.insert(interventions).values({ artisanId: A, clientId: cli.id, titre: "Passee", statut: "planifiee", dateDebut: past });
  await db.insert(interventions).values({ artisanId: A, clientId: cli.id, titre: "Finie", statut: "terminee", dateDebut: past });

  const s = await getDashboardStats(A);

  check(`caMonth = 1000 (facture payée ce mois) → ${s.caMonth}`, s.caMonth === 1000);
  check(`caYear = 1500 (1000 + 500 cette année, exclut l'an passé) → ${s.caYear}`, s.caYear === 1500);
  check(`devisEnCours = 2 (brouillon + envoye) → ${s.devisEnCours}`, s.devisEnCours === 2);
  check(`facturesImpayees.count = 1 → ${s.facturesImpayees.count}`, s.facturesImpayees.count === 1);
  check(`facturesImpayees.total = 300 → ${s.facturesImpayees.total}`, s.facturesImpayees.total === 300);
  check(`totalClients = 1 → ${s.totalClients}`, s.totalClients === 1);
  check(`interventionsAVenir = 1 (planifiée future seulement) → ${s.interventionsAVenir}`, s.interventionsAVenir === 1);
  check(`totalDevis = 3 → ${s.totalDevis}`, s.totalDevis === 3);
  check(`totalFactures = 4 → ${s.totalFactures}`, s.totalFactures === 4);
  check(`totalInterventions = 3 → ${s.totalInterventions}`, s.totalInterventions === 3);

  // cleanup
  await db.delete(factures).where(eq(factures.artisanId, A));
  await db.delete(devis).where(eq(devis.artisanId, A));
  await db.delete(interventions).where(eq(interventions.artisanId, A));
  await db.delete(clients).where(eq(clients.artisanId, A));
} catch (e) {
  console.error("❌ EXCEPTION", e);
  ok = false;
}

console.log(ok ? "\n=== ✅ DASHBOARD PG OK ===" : "\n=== ❌ DASHBOARD PG FAIL ===");
process.exit(ok ? 0 : 1);
