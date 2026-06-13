// scripts/test-search-pg.mjs — OPE-184 P0.7e-2 — recherche globale sur PG.
// db.searchGlobal : 5 entités (clients/devis/factures/interventions/fournisseurs),
// ilike (insensible casse), scope artisan, title/subtitle construits en JS.
import { searchGlobal, createClient, createFacture, getDb } from "../server/db.ts";
import { clients, devis, factures, interventions, fournisseurs } from "../drizzle/schema.active.ts";
import { eq } from "drizzle-orm";

const A = 9918001, OTHER = 9918002;
let ok = true;
const check = (label, cond) => { console.log(`${cond ? "✅" : "❌"} ${label}`); if (!cond) ok = false; };

try {
  const db = await getDb();
  for (const t of [clients, devis, factures, interventions, fournisseurs]) {
    await db.delete(t).where(eq(t.artisanId, A));
    await db.delete(t).where(eq(t.artisanId, OTHER));
  }

  const cli = await createClient(A, { nom: "Évrard", prenom: "Sophie", email: "sophie@evrard.fr", telephone: "0612345678", ville: "Lyon" });
  await db.insert(devis).values({ artisanId: A, clientId: cli.id, numero: "DEV-2026-001", objet: "Rénovation cuisine", statut: "envoye", totalHT: "1000", totalTVA: "200", totalTTC: "1234.56" });
  await createFacture(A, { clientId: cli.id, numero: "FAC-2026-001", objet: "Plomberie salle de bain", statut: "validee", totalHT: "800", totalTVA: "160", totalTTC: "960.00" });
  await db.insert(interventions).values({ artisanId: A, clientId: cli.id, titre: "Dépannage chaudière", description: "Urgence", statut: "planifiee", dateDebut: new Date("2026-07-15T09:00:00Z") });
  await db.insert(fournisseurs).values({ artisanId: A, nom: "Plombelec Pro", email: "contact@plombelec.fr", telephone: "0498765432" });

  // autre artisan (ne doit jamais apparaître)
  const cliOther = await createClient(OTHER, { nom: "Évrard", prenom: "Autre", email: "autre@x.fr" });

  // recherche "evrard" : insensible à la casse (ilike) → trouve le client
  let res = await searchGlobal(A, "evrard");
  const cliRes = res.find((r) => r.type === "client");
  check(`client trouvé par 'evrard' (ilike insensible casse) → ${cliRes?.title}`, cliRes?.title === "Sophie Évrard");
  check(`client subtitle = email → ${cliRes?.subtitle}`, cliRes?.subtitle === "sophie@evrard.fr");
  check(`client url → ${cliRes?.url}`, cliRes?.url === `/clients/${cli.id}`);

  // scope artisan : le client de OTHER n'apparaît pas
  check(`scope artisan : 1 seul client (pas celui d'OTHER) → ${res.filter((r) => r.type === "client").length}`, res.filter((r) => r.type === "client").length === 1);

  // recherche devis par numéro + format montant
  res = await searchGlobal(A, "DEV-2026");
  const devRes = res.find((r) => r.type === "devis");
  check(`devis trouvé → ${devRes?.title}`, devRes?.title === "DEV-2026-001 — Rénovation cuisine");
  check(`devis subtitle format montant (1,234.56 €) → ${devRes?.subtitle}`, devRes?.subtitle === "envoye — 1,234.56 €");

  // recherche par objet (facture)
  res = await searchGlobal(A, "plomberie");
  check(`facture trouvée par objet → ${res.find((r) => r.type === "facture")?.title}`, res.find((r) => r.type === "facture")?.title === "FAC-2026-001 — Plomberie salle de bain");

  // intervention : date formatée dd/mm/yyyy
  res = await searchGlobal(A, "chaudière");
  const intRes = res.find((r) => r.type === "intervention");
  check(`intervention trouvée → ${intRes?.title}`, intRes?.title === "Dépannage chaudière");
  check(`intervention subtitle date 15/07/2026 → ${intRes?.subtitle}`, intRes?.subtitle === "planifiee — 15/07/2026");

  // fournisseur
  res = await searchGlobal(A, "plombelec");
  check(`fournisseur trouvé → ${res.find((r) => r.type === "fournisseur")?.title}`, res.find((r) => r.type === "fournisseur")?.title === "Plombelec Pro");

  // requête sans match → vide
  res = await searchGlobal(A, "zzzznomatch");
  check(`aucun match → résultats vides → ${res.length}`, res.length === 0);

  // cleanup
  for (const t of [clients, devis, factures, interventions, fournisseurs]) {
    await db.delete(t).where(eq(t.artisanId, A));
    await db.delete(t).where(eq(t.artisanId, OTHER));
  }
} catch (e) {
  console.error("❌ EXCEPTION", e);
  ok = false;
}

console.log(ok ? "\n=== ✅ SEARCH PG OK ===" : "\n=== ❌ SEARCH PG FAIL ===");
process.exit(ok ? 0 : 1);
