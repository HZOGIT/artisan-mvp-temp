// Seed du jeu de données de démo principal « Plomberie Martin & Fils » (Paris) — PostgreSQL /
// nouvelle approche clean-archi : driver `pg` + Drizzle (schéma source unique `drizzle/schema.pg`).
// Insère un graphe tenant complet (artisan → params → clients → techniciens → articles → devis →
// factures → chantiers → interventions → contrats → fournisseurs → notifications).
//
// NB divergence vs l'ancien `seed-data.mjs` : celui-ci attachait le graphe au « 1er user existant »
// (non idempotent : ré-exécution = doublons d'enfants) ; on porte avec un UTILISATEUR DÉMO DÉDIÉ
// (`plombier-demo-001`) → self-contained, idempotent (purge du graphe avant ré-insertion), et non
// destructif pour les autres comptes (cohérent avec seed-electricien.ts).
//   DATABASE_URL=postgres://artisan_user:artisan_password@localhost:5432/artisan_mvp \
//   pnpm exec tsx scripts/seed-data.ts
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import {
  users, artisans, parametresArtisan, clients, techniciens, articlesArtisan,
  devis, factures, chantiers, interventions, contratsMaintenance, fournisseurs, notifications,
} from "../drizzle/schema.pg";

const OPEN_ID = "plombier-demo-001";

const clientsData = [
  { nom: "Dupont", prenom: "Jean", email: "jean.dupont@email.fr", telephone: "06 12 34 56 78", adresse: "25 Avenue des Champs-Élysées", codePostal: "75008", ville: "Paris", notes: "Client fidèle depuis 2020" },
  { nom: "Martin", prenom: "Marie", email: "marie.martin@gmail.com", telephone: "06 23 45 67 89", adresse: "12 Rue de la Paix", codePostal: "75002", ville: "Paris", notes: "Appartement haussmannien" },
  { nom: "Bernard", prenom: "Pierre", email: "p.bernard@entreprise.fr", telephone: "06 34 56 78 90", adresse: "8 Boulevard Haussmann", codePostal: "75009", ville: "Paris", notes: "Gérant de restaurant" },
  { nom: "Petit", prenom: "Sophie", email: "sophie.petit@outlook.fr", telephone: "06 45 67 89 01", adresse: "45 Rue du Commerce", codePostal: "75015", ville: "Paris", notes: "Maison individuelle" },
  { nom: "Robert", prenom: "Michel", email: "michel.robert@free.fr", telephone: "06 56 78 90 12", adresse: "3 Place de la République", codePostal: "75003", ville: "Paris", notes: "Syndic copropriété" },
  { nom: "Richard", prenom: "Isabelle", email: "isabelle.richard@wanadoo.fr", telephone: "06 67 89 01 23", adresse: "78 Avenue de la Grande Armée", codePostal: "75017", ville: "Paris", notes: "Bureau professionnel" },
  { nom: "Durand", prenom: "François", email: "f.durand@societe.com", telephone: "06 78 90 12 34", adresse: "156 Rue de Rivoli", codePostal: "75001", ville: "Paris", notes: "Boutique centre-ville" },
  { nom: "Leroy", prenom: "Catherine", email: "catherine.leroy@orange.fr", telephone: "06 89 01 23 45", adresse: "22 Rue Montmartre", codePostal: "75018", ville: "Paris", notes: "Immeuble ancien" },
  { nom: "Moreau", prenom: "Philippe", email: "philippe.moreau@sfr.fr", telephone: "06 90 12 34 56", adresse: "67 Boulevard Saint-Germain", codePostal: "75005", ville: "Paris", notes: "Appartement de standing" },
  { nom: "Simon", prenom: "Nathalie", email: "nathalie.simon@laposte.net", telephone: "06 01 23 45 67", adresse: "34 Rue de Belleville", codePostal: "75020", ville: "Paris", notes: "Loft rénové" },
];

const techniciensData = [
  { nom: "Lefebvre", prenom: "Thomas", email: "thomas.lefebvre@plomberie-martin.fr", telephone: "06 11 22 33 44", specialite: "Plomberie générale", couleur: "#3b82f6" },
  { nom: "Girard", prenom: "Antoine", email: "antoine.girard@plomberie-martin.fr", telephone: "06 22 33 44 55", specialite: "Chauffage", couleur: "#ef4444" },
  { nom: "Bonnet", prenom: "Lucas", email: "lucas.bonnet@plomberie-martin.fr", telephone: "06 33 44 55 66", specialite: "Sanitaires", couleur: "#22c55e" },
  { nom: "Mercier", prenom: "Hugo", email: "hugo.mercier@plomberie-martin.fr", telephone: "06 44 55 66 77", specialite: "Dépannage urgence", couleur: "#f59e0b" },
  { nom: "Faure", prenom: "Julien", email: "julien.faure@plomberie-martin.fr", telephone: "06 55 66 77 88", specialite: "Installation neuve", couleur: "#8b5cf6" },
];

const articlesData = [
  { reference: "PLB-001", designation: "Remplacement robinet mitigeur", description: "Fourniture et pose d'un robinet mitigeur standard", unite: "unité", prixUnitaireHT: "85.00", categorie: "Robinetterie" },
  { reference: "PLB-002", designation: "Débouchage canalisation", description: "Débouchage mécanique ou chimique", unite: "intervention", prixUnitaireHT: "120.00", categorie: "Débouchage" },
  { reference: "PLB-003", designation: "Installation WC complet", description: "Fourniture et pose WC avec réservoir", unite: "unité", prixUnitaireHT: "350.00", categorie: "Sanitaires" },
  { reference: "PLB-004", designation: "Réparation fuite eau", description: "Recherche et réparation de fuite", unite: "intervention", prixUnitaireHT: "95.00", categorie: "Réparation" },
  { reference: "PLB-005", designation: "Remplacement chauffe-eau 200L", description: "Fourniture et pose chauffe-eau électrique", unite: "unité", prixUnitaireHT: "890.00", categorie: "Chauffage" },
  { reference: "PLB-006", designation: "Installation douche italienne", description: "Création douche à l'italienne complète", unite: "forfait", prixUnitaireHT: "2500.00", categorie: "Sanitaires" },
  { reference: "PLB-007", designation: "Remplacement siphon", description: "Fourniture et pose siphon évier/lavabo", unite: "unité", prixUnitaireHT: "45.00", categorie: "Robinetterie" },
  { reference: "PLB-008", designation: "Détartrage chauffe-eau", description: "Entretien et détartrage complet", unite: "intervention", prixUnitaireHT: "150.00", categorie: "Entretien" },
  { reference: "PLB-009", designation: "Installation lave-vaisselle", description: "Raccordement eau et évacuation", unite: "intervention", prixUnitaireHT: "75.00", categorie: "Installation" },
  { reference: "PLB-010", designation: "Remplacement joint robinet", description: "Fourniture et pose joint", unite: "unité", prixUnitaireHT: "35.00", categorie: "Réparation" },
  { reference: "PLB-011", designation: "Main d'œuvre horaire", description: "Taux horaire intervention", unite: "heure", prixUnitaireHT: "55.00", categorie: "Main d'œuvre" },
  { reference: "PLB-012", designation: "Déplacement zone Paris", description: "Frais de déplacement Paris intra-muros", unite: "forfait", prixUnitaireHT: "30.00", categorie: "Déplacement" },
  { reference: "PLB-013", designation: "Remplacement radiateur", description: "Dépose ancien et pose nouveau radiateur", unite: "unité", prixUnitaireHT: "280.00", categorie: "Chauffage" },
  { reference: "PLB-014", designation: "Purge circuit chauffage", description: "Purge complète installation", unite: "intervention", prixUnitaireHT: "85.00", categorie: "Entretien" },
  { reference: "PLB-015", designation: "Installation baignoire", description: "Pose baignoire avec robinetterie", unite: "forfait", prixUnitaireHT: "450.00", categorie: "Sanitaires" },
];

const devisData = [
  { clientIdx: 0, numero: "DEV-2026-001", statut: "accepte", objet: "Rénovation salle de bain complète", totalHT: "3500.00", totalTVA: "700.00", totalTTC: "4200.00" },
  { clientIdx: 1, numero: "DEV-2026-002", statut: "envoye", objet: "Remplacement chauffe-eau", totalHT: "1200.00", totalTVA: "240.00", totalTTC: "1440.00" },
  { clientIdx: 2, numero: "DEV-2026-003", statut: "accepte", objet: "Installation cuisine professionnelle", totalHT: "5800.00", totalTVA: "1160.00", totalTTC: "6960.00" },
  { clientIdx: 3, numero: "DEV-2026-004", statut: "brouillon", objet: "Réparation fuite toiture", totalHT: "450.00", totalTVA: "90.00", totalTTC: "540.00" },
  { clientIdx: 4, numero: "DEV-2026-005", statut: "envoye", objet: "Mise aux normes colonnes montantes", totalHT: "8500.00", totalTVA: "1700.00", totalTTC: "10200.00" },
  { clientIdx: 5, numero: "DEV-2026-006", statut: "refuse", objet: "Installation climatisation", totalHT: "3200.00", totalTVA: "640.00", totalTTC: "3840.00" },
  { clientIdx: 6, numero: "DEV-2026-007", statut: "accepte", objet: "Rénovation sanitaires boutique", totalHT: "2100.00", totalTVA: "420.00", totalTTC: "2520.00" },
  { clientIdx: 7, numero: "DEV-2026-008", statut: "envoye", objet: "Détartrage et entretien annuel", totalHT: "280.00", totalTVA: "56.00", totalTTC: "336.00" },
];

const facturesData = [
  { clientIdx: 0, devisIdx: 0, numero: "FAC-2026-001", statut: "payee", objet: "Rénovation salle de bain complète", totalHT: "3500.00", totalTVA: "700.00", totalTTC: "4200.00", montantPaye: "4200.00" },
  { clientIdx: 2, devisIdx: 2, numero: "FAC-2026-002", statut: "envoyee", objet: "Installation cuisine professionnelle", totalHT: "5800.00", totalTVA: "1160.00", totalTTC: "6960.00", montantPaye: "3000.00" },
  { clientIdx: 6, devisIdx: 6, numero: "FAC-2026-003", statut: "payee", objet: "Rénovation sanitaires boutique", totalHT: "2100.00", totalTVA: "420.00", totalTTC: "2520.00", montantPaye: "2520.00" },
  { clientIdx: 3, devisIdx: null, numero: "FAC-2026-004", statut: "en_retard", objet: "Dépannage urgent fuite", totalHT: "180.00", totalTVA: "36.00", totalTTC: "216.00", montantPaye: "0.00" },
  { clientIdx: 8, devisIdx: null, numero: "FAC-2026-005", statut: "envoyee", objet: "Entretien annuel chauffage", totalHT: "150.00", totalTVA: "30.00", totalTTC: "180.00", montantPaye: "0.00" },
];

const chantiersData = [
  { clientIdx: 0, reference: "CHT-2026-001", nom: "Rénovation appartement Champs-Élysées", description: "Rénovation complète plomberie et sanitaires", adresse: "25 Avenue des Champs-Élysées", codePostal: "75008", ville: "Paris", budgetPrevisionnel: "15000.00", statut: "en_cours", avancement: 45, priorite: "haute" },
  { clientIdx: 2, reference: "CHT-2026-002", nom: "Installation restaurant Haussmann", description: "Installation cuisine professionnelle complète", adresse: "8 Boulevard Haussmann", codePostal: "75009", ville: "Paris", budgetPrevisionnel: "25000.00", statut: "en_cours", avancement: 70, priorite: "urgente" },
  { clientIdx: 4, reference: "CHT-2026-003", nom: "Mise aux normes copropriété", description: "Remplacement colonnes montantes immeuble", adresse: "3 Place de la République", codePostal: "75003", ville: "Paris", budgetPrevisionnel: "45000.00", statut: "planifie", avancement: 10, priorite: "normale" },
  { clientIdx: 9, reference: "CHT-2026-004", nom: "Aménagement loft Belleville", description: "Création salle de bain et cuisine", adresse: "34 Rue de Belleville", codePostal: "75020", ville: "Paris", budgetPrevisionnel: "12000.00", statut: "en_cours", avancement: 30, priorite: "normale" },
];

const interventionsData = [
  { clientIdx: 0, techIdx: 0, titre: "Démolition ancienne salle de bain", statut: "terminee", daysOffset: -10 },
  { clientIdx: 0, techIdx: 1, titre: "Installation nouvelle tuyauterie", statut: "terminee", daysOffset: -7 },
  { clientIdx: 0, techIdx: 2, titre: "Pose sanitaires neufs", statut: "en_cours", daysOffset: 0 },
  { clientIdx: 2, techIdx: 0, titre: "Installation éviers professionnels", statut: "terminee", daysOffset: -5 },
  { clientIdx: 2, techIdx: 3, titre: "Raccordement gaz cuisine", statut: "en_cours", daysOffset: 1 },
  { clientIdx: 2, techIdx: 1, titre: "Test et mise en service", statut: "planifiee", daysOffset: 5 },
  { clientIdx: 4, techIdx: 4, titre: "Diagnostic colonnes montantes", statut: "planifiee", daysOffset: 7 },
  { clientIdx: 9, techIdx: 2, titre: "Création arrivée eau salle de bain", statut: "en_cours", daysOffset: 2 },
  { clientIdx: 9, techIdx: 0, titre: "Installation douche italienne", statut: "planifiee", daysOffset: 8 },
  { clientIdx: 1, techIdx: 3, titre: "Remplacement chauffe-eau", statut: "planifiee", daysOffset: 3 },
  { clientIdx: 3, techIdx: 4, titre: "Réparation fuite urgente", statut: "terminee", daysOffset: -2 },
  { clientIdx: 7, techIdx: 1, titre: "Entretien annuel chauffage", statut: "planifiee", daysOffset: 10 },
];

const contratsData = [
  { clientIdx: 0, reference: "CTR-2026-001", titre: "Contrat entretien annuel chauffage", montantHT: "180.00", periodicite: "annuel" },
  { clientIdx: 2, reference: "CTR-2026-002", titre: "Maintenance équipements cuisine", montantHT: "350.00", periodicite: "trimestriel" },
  { clientIdx: 4, reference: "CTR-2026-003", titre: "Entretien colonnes copropriété", montantHT: "1200.00", periodicite: "semestriel" },
];

const fournisseursData = [
  { nom: "Cedeo", contact: "Service commercial", email: "pro@cedeo.fr", telephone: "01 40 50 60 70", adresse: "15 Zone Industrielle", codePostal: "93100", ville: "Montreuil" },
  { nom: "Point P", contact: "Marc Dubois", email: "contact@pointp.fr", telephone: "01 41 51 61 71", adresse: "25 Avenue des Matériaux", codePostal: "94200", ville: "Ivry-sur-Seine" },
  { nom: "Brossette", contact: "Service pro", email: "pro@brossette.fr", telephone: "01 42 52 62 72", adresse: "8 Rue du Commerce", codePostal: "92100", ville: "Boulogne" },
  { nom: "Thermador", contact: "Anne Martin", email: "anne.martin@thermador.fr", telephone: "01 43 53 63 73", adresse: "45 Boulevard Industriel", codePostal: "95100", ville: "Argenteuil" },
];

const notificationsData = [
  { type: "info", titre: "Bienvenue sur Artisan MVP", message: "Votre compte a été créé avec succès. Explorez les fonctionnalités !" },
  { type: "rappel", titre: "Devis en attente de signature", message: "Le devis DEV-2026-002 attend la signature du client depuis 5 jours." },
  { type: "alerte", titre: "Facture en retard", message: "La facture FAC-2026-004 est en retard de paiement." },
  { type: "succes", titre: "Paiement reçu", message: "Le paiement de 4200€ pour la facture FAC-2026-001 a été reçu." },
  { type: "info", titre: "Nouvelle intervention planifiée", message: "Une intervention a été planifiée pour demain chez M. Martin." },
];

const jour = (d: Date) => d.toISOString().split("T")[0];

async function seed() {
  const url = process.env.DATABASE_URL || "postgres://artisan_user:artisan_password@localhost:5432/artisan_mvp";
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool);

  console.log("🌱 Insertion des données de test (Plomberie Martin & Fils)…");
  try {
    // Idempotence : purge du graphe de l'artisan démo s'il existe (repéré par l'openId).
    const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.openId, OPEN_ID)).limit(1);
    if (existingUser) {
      const [a] = await db.select({ id: artisans.id }).from(artisans).where(eq(artisans.userId, existingUser.id)).limit(1);
      if (a) {
        for (const t of [notifications, interventions, contratsMaintenance, chantiers, factures, devis, articlesArtisan, techniciens, clients, parametresArtisan, fournisseurs]) {
          await db.delete(t).where(eq((t as typeof clients).artisanId, a.id));
        }
        await db.delete(artisans).where(eq(artisans.id, a.id));
      }
      await db.delete(users).where(eq(users.id, existingUser.id));
      console.log("♻️  Ancien graphe démo purgé.");
    }

    const [user] = await db.insert(users).values({ openId: OPEN_ID, name: "Plomberie Martin & Fils", email: "contact@plomberie-martin.fr", loginMethod: "demo", role: "artisan" }).returning({ id: users.id });
    const [artisan] = await db.insert(artisans).values({
      userId: user.id, siret: "12345678901234", nomEntreprise: "Plomberie Martin & Fils", adresse: "15 Rue des Artisans",
      codePostal: "75011", ville: "Paris", telephone: "01 42 56 78 90", email: "contact@plomberie-martin.fr",
      specialite: "plomberie", metier: "plombier", tauxTVA: "20.00",
    }).returning({ id: artisans.id });
    const artisanId = artisan.id;
    console.log(`✅ Artisan créé: ID ${artisanId}`);

    await db.insert(parametresArtisan).values({ artisanId, prefixeDevis: "DEV", prefixeFacture: "FAC", compteurDevis: 1, compteurFacture: 1, mentionsLegales: "TVA non applicable, art. 293 B du CGI" });

    const clientRows = await db.insert(clients).values(clientsData.map((c) => ({ artisanId, ...c }))).returning({ id: clients.id });
    console.log(`✅ ${clientRows.length} clients créés`);
    const techRows = await db.insert(techniciens).values(techniciensData.map((t) => ({ artisanId, statut: "actif" as const, ...t }))).returning({ id: techniciens.id });
    console.log(`✅ ${techRows.length} techniciens créés`);

    await db.insert(articlesArtisan).values(articlesData.map((a) => ({ artisanId, ...a })));
    console.log(`✅ ${articlesData.length} articles créés`);

    const now = new Date();
    const plusJours = (n: number) => { const d = new Date(now); d.setDate(d.getDate() + n); return d; };

    const devisRows = await db.insert(devis).values(devisData.map((d) => ({
      artisanId, clientId: clientRows[d.clientIdx].id, numero: d.numero, dateDevis: now, dateValidite: plusJours(30),
      statut: d.statut as "brouillon", objet: d.objet, totalHT: d.totalHT, totalTVA: d.totalTVA, totalTTC: d.totalTTC,
    }))).returning({ id: devis.id });
    console.log(`✅ ${devisRows.length} devis créés`);

    await db.insert(factures).values(facturesData.map((f) => ({
      artisanId, clientId: clientRows[f.clientIdx].id, devisId: f.devisIdx !== null ? devisRows[f.devisIdx].id : null,
      numero: f.numero, dateFacture: now, dateEcheance: plusJours(30), statut: f.statut as "payee", objet: f.objet,
      totalHT: f.totalHT, totalTVA: f.totalTVA, totalTTC: f.totalTTC, montantPaye: f.montantPaye,
    })));
    console.log(`✅ ${facturesData.length} factures créées`);

    await db.insert(chantiers).values(chantiersData.map((c) => ({
      artisanId, clientId: clientRows[c.clientIdx].id, reference: c.reference, nom: c.nom, description: c.description,
      adresse: c.adresse, codePostal: c.codePostal, ville: c.ville, dateDebut: jour(plusJours(-15)), dateFinPrevue: jour(plusJours(45)),
      budgetPrevisionnel: c.budgetPrevisionnel, statut: c.statut as "en_cours", avancement: c.avancement, priorite: c.priorite as "normale",
    })));
    console.log(`✅ ${chantiersData.length} chantiers créés`);

    await db.insert(interventions).values(interventionsData.map((i) => {
      const debut = plusJours(i.daysOffset);
      const fin = new Date(debut); fin.setHours(fin.getHours() + 4);
      const c = clientsData[i.clientIdx];
      return {
        artisanId, clientId: clientRows[i.clientIdx].id, titre: i.titre, description: "Intervention planifiée",
        dateDebut: debut, dateFin: fin, statut: i.statut as "terminee", adresse: `${c.adresse}, ${c.codePostal} ${c.ville}`,
        technicienId: techRows[i.techIdx].id,
      };
    }));
    console.log(`✅ ${interventionsData.length} interventions créées`);

    const moisDecale = (n: number) => { const d = new Date(now); d.setMonth(d.getMonth() + n); return d; };
    await db.insert(contratsMaintenance).values(contratsData.map((c) => ({
      artisanId, clientId: clientRows[c.clientIdx].id, reference: c.reference, titre: c.titre,
      description: "Contrat de maintenance préventive", montantHT: c.montantHT, periodicite: c.periodicite as "annuel",
      dateDebut: moisDecale(-2), prochainFacturation: moisDecale(1), statut: "actif" as const,
    })));
    console.log(`✅ ${contratsData.length} contrats de maintenance créés`);

    await db.insert(fournisseurs).values(fournisseursData.map((f) => ({ artisanId, ...f })));
    console.log(`✅ ${fournisseursData.length} fournisseurs créés`);

    await db.insert(notifications).values(notificationsData.map((n) => ({ artisanId, type: n.type, titre: n.titre, message: n.message, lu: false })));
    console.log(`✅ ${notificationsData.length} notifications créées`);

    console.log(`\n🎉 Données de test insérées (artisan ID ${artisanId}, openId ${OPEN_ID}).`);
  } catch (error) {
    console.error("❌ Erreur:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
