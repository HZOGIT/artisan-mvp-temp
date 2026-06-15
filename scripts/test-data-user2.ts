// Données de TEST pour l'utilisateur « User 2 » (zouiten@biopp.fr) — PostgreSQL / nouvelle approche
// clean-archi : driver `pg` + Drizzle (schéma source unique `drizzle/schema.pg`). Crée, pour le
// profil artisan de cet utilisateur : 3 clients, 2 devis/client (6), 3 factures/client (9),
// 2 interventions/client (6).
//
// Consolide les anciens `test-data-user2.mjs` (v1, schéma MySQL OBSOLÈTE : montantHT/dateCreation/
// dateIntervention/ville — colonnes inexistantes) et `test-data-user2-v2.mjs` (v2, schéma correct)
// en un seul script PG. Requiert que l'utilisateur existe (sinon sortie gracieuse) ; crée le profil
// artisan si absent. Idempotent : purge des entités de test de cet artisan avant ré-insertion.
//   DATABASE_URL=postgres://artisan_user:artisan_password@localhost:5432/artisan_mvp \
//   pnpm exec tsx scripts/test-data-user2.ts
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { users, artisans, clients, devis, factures, interventions } from "../drizzle/schema.pg";

const EMAIL = "zouiten@biopp.fr";

const clientsData = [
  { nom: "Plomberie Express", email: "contact@plomberie-express.fr", telephone: "0612345678", adresse: "10 Rue de la République", codePostal: "75002", ville: "Paris", siret: "11111111111111" },
  { nom: "Électricité Pro Services", email: "info@electricite-pro.fr", telephone: "0698765432", adresse: "50 Avenue Montaigne", codePostal: "75008", ville: "Paris", siret: "22222222222222" },
  { nom: "Chauffage & Climatisation", email: "devis@chauffage-clim.fr", telephone: "0655443322", adresse: "200 Boulevard Saint-Germain", codePostal: "75006", ville: "Paris", siret: "33333333333333" },
];

const eur = (n: number) => n.toFixed(2);

async function run() {
  const url = process.env.DATABASE_URL || "postgres://artisan_user:artisan_password@localhost:5432/artisan_mvp";
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool);

  console.log(`🧪 Données de test — ${EMAIL}…`);
  try {
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, EMAIL)).limit(1);
    if (!user) {
      console.log(`❌ Utilisateur ${EMAIL} non trouvé (crée-le d'abord, ex. scripts/create-user.ts).`);
      return;
    }
    console.log(`✅ Utilisateur trouvé (ID ${user.id})`);

    // Find-or-create du profil artisan.
    let [artisan] = await db.select({ id: artisans.id }).from(artisans).where(eq(artisans.userId, user.id)).limit(1);
    if (!artisan) {
      [artisan] = await db.insert(artisans).values({ userId: user.id, nomEntreprise: "Artisan Test", specialite: "multi-services", metier: "autre" }).returning({ id: artisans.id });
      console.log(`✅ Profil artisan créé (ID ${artisan.id})`);
    } else {
      console.log(`✅ Profil artisan trouvé (ID ${artisan.id})`);
    }
    const artisanId = artisan.id;

    // Idempotence : purge des entités de test de cet artisan avant ré-insertion.
    for (const t of [interventions, factures, devis, clients]) {
      await db.delete(t).where(eq((t as typeof clients).artisanId, artisanId));
    }

    const clientRows = await db.insert(clients).values(clientsData.map((c) => ({
      artisanId, nom: c.nom, prenom: null, email: c.email, telephone: c.telephone, adresse: c.adresse, codePostal: c.codePostal, ville: c.ville, siret: c.siret,
    }))).returning({ id: clients.id });
    console.log(`✅ ${clientRows.length} clients créés`);

    const now = new Date();
    const devisValues = [];
    const facturesValues = [];
    const interventionsValues = [];
    for (let ci = 0; ci < clientRows.length; ci++) {
      const clientId = clientRows[ci].id;
      const c = clientsData[ci];
      for (let i = 1; i <= 2; i++) {
        const ht = 1000 + i * 500;
        devisValues.push({ artisanId, clientId, numero: `DEV-TEST2-${ci}-${i}`, dateDevis: now, totalHT: eur(ht), totalTVA: eur(ht * 0.2), totalTTC: eur(ht * 1.2), statut: "brouillon" as const });
      }
      for (let i = 1; i <= 3; i++) {
        const ht = 800 + i * 400;
        const echeance = new Date(now); echeance.setDate(echeance.getDate() + 30);
        facturesValues.push({ artisanId, clientId, numero: `FAC-TEST2-${ci}-${i}`, dateFacture: now, dateEcheance: echeance, totalHT: eur(ht), totalTVA: eur(ht * 0.2), totalTTC: eur(ht * 1.2), statut: "brouillon" as const });
      }
      for (let i = 1; i <= 2; i++) {
        const debut = new Date(now.getTime() + i * 7 * 24 * 60 * 60 * 1000);
        interventionsValues.push({ artisanId, clientId, titre: `Intervention ${i} - ${c.nom}`, description: `Description de l'intervention ${i}`, dateDebut: debut, statut: "planifiee" as const, adresse: c.adresse, notes: `${c.codePostal} ${c.ville}` });
      }
    }
    await db.insert(devis).values(devisValues);
    console.log(`✅ ${devisValues.length} devis créés`);
    await db.insert(factures).values(facturesValues);
    console.log(`✅ ${facturesValues.length} factures créées`);
    await db.insert(interventions).values(interventionsValues);
    console.log(`✅ ${interventionsValues.length} interventions créées`);

    console.log(`\n📊 Total: ${clientRows.length + devisValues.length + facturesValues.length + interventionsValues.length} éléments (artisan ID ${artisanId}).`);
  } catch (error) {
    console.error("❌ Erreur:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
