// Seed du profil démo « Électricité Duval » (Lyon) — PostgreSQL / nouvelle approche clean-archi :
// driver `pg` + Drizzle (schéma source unique `drizzle/schema.pg`). Insère un graphe tenant complet
// (artisan → params → clients → techniciens → articles → devis → factures → chantiers → interventions
// → contrats → fournisseurs → notifications). Idempotent : purge du graphe de l'artisan démo (repéré
// par l'openId de l'utilisateur) avant ré-insertion.
//   DATABASE_URL=postgres://artisan_user:artisan_password@localhost:5432/artisan_mvp \
//   pnpm exec tsx scripts/seed-electricien.ts
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import {
  users, artisans, parametresArtisan, clients, techniciens, articlesArtisan,
  devis, factures, chantiers, interventions, contratsMaintenance, fournisseurs, notifications,
} from "../drizzle/schema.pg";

const OPEN_ID = "electricien-demo-001";

const clientsData = [
  { nom: "Rousseau", prenom: "Alain", email: "alain.rousseau@email.fr", telephone: "06 11 22 33 44", adresse: "15 Rue de la Part-Dieu", codePostal: "69003", ville: "Lyon", notes: "Appartement T4 - Rénovation complète" },
  { nom: "Blanc", prenom: "Christine", email: "christine.blanc@gmail.com", telephone: "06 22 33 44 55", adresse: "8 Avenue Jean Jaurès", codePostal: "69007", ville: "Lyon", notes: "Maison individuelle" },
  { nom: "Garnier", prenom: "Patrick", email: "p.garnier@entreprise.fr", telephone: "06 33 44 55 66", adresse: "25 Cours Lafayette", codePostal: "69006", ville: "Lyon", notes: "Bureaux entreprise" },
  { nom: "Fournier", prenom: "Sylvie", email: "sylvie.fournier@outlook.fr", telephone: "06 44 55 66 77", adresse: "12 Place Bellecour", codePostal: "69002", ville: "Lyon", notes: "Commerce centre-ville" },
  { nom: "Morel", prenom: "Jacques", email: "jacques.morel@free.fr", telephone: "06 55 66 77 88", adresse: "56 Rue de la République", codePostal: "69001", ville: "Lyon", notes: "Immeuble ancien - Mise aux normes" },
  { nom: "Lambert", prenom: "Véronique", email: "veronique.lambert@wanadoo.fr", telephone: "06 66 77 88 99", adresse: "3 Quai Claude Bernard", codePostal: "69007", ville: "Lyon", notes: "Loft bord de Rhône" },
  { nom: "Roux", prenom: "Olivier", email: "o.roux@societe.com", telephone: "06 77 88 99 00", adresse: "78 Boulevard des Belges", codePostal: "69006", ville: "Lyon", notes: "Villa avec piscine" },
  { nom: "Vincent", prenom: "Martine", email: "martine.vincent@orange.fr", telephone: "06 88 99 00 11", adresse: "45 Rue Garibaldi", codePostal: "69003", ville: "Lyon", notes: "Appartement neuf" },
];

const techniciensData = [
  { nom: "Perrin", prenom: "Maxime", email: "maxime.perrin@electricite-duval.fr", telephone: "06 10 20 30 40", specialite: "Installation neuve", couleur: "#3b82f6" },
  { nom: "Chevalier", prenom: "Romain", email: "romain.chevalier@electricite-duval.fr", telephone: "06 20 30 40 50", specialite: "Dépannage", couleur: "#ef4444" },
  { nom: "Marchand", prenom: "Kevin", email: "kevin.marchand@electricite-duval.fr", telephone: "06 30 40 50 60", specialite: "Domotique", couleur: "#22c55e" },
  { nom: "Renaud", prenom: "Sébastien", email: "sebastien.renaud@electricite-duval.fr", telephone: "06 40 50 60 70", specialite: "Photovoltaïque", couleur: "#f59e0b" },
];

const articlesData = [
  { reference: "EL-001", designation: "Installation tableau électrique", description: "Fourniture et pose tableau électrique complet", unite: "unité", prixUnitaireHT: "850.00", categorie: "Tableau" },
  { reference: "EL-002", designation: "Remplacement disjoncteur", description: "Fourniture et pose disjoncteur différentiel", unite: "unité", prixUnitaireHT: "120.00", categorie: "Protection" },
  { reference: "EL-003", designation: "Installation prise électrique", description: "Pose prise 16A avec terre", unite: "unité", prixUnitaireHT: "65.00", categorie: "Prises" },
  { reference: "EL-004", designation: "Installation interrupteur", description: "Pose interrupteur simple allumage", unite: "unité", prixUnitaireHT: "55.00", categorie: "Interrupteurs" },
  { reference: "EL-005", designation: "Pose luminaire plafonnier", description: "Installation luminaire avec raccordement", unite: "unité", prixUnitaireHT: "75.00", categorie: "Éclairage" },
  { reference: "EL-006", designation: "Installation spot encastré", description: "Fourniture et pose spot LED", unite: "unité", prixUnitaireHT: "45.00", categorie: "Éclairage" },
  { reference: "EL-007", designation: "Tirage de câble", description: "Passage câble électrique", unite: "mètre", prixUnitaireHT: "15.00", categorie: "Câblage" },
  { reference: "EL-008", designation: "Mise aux normes NF C 15-100", description: "Mise en conformité installation", unite: "forfait", prixUnitaireHT: "1500.00", categorie: "Normes" },
  { reference: "EL-009", designation: "Installation borne recharge VE", description: "Pose borne véhicule électrique 7kW", unite: "unité", prixUnitaireHT: "1200.00", categorie: "Mobilité" },
  { reference: "EL-010", designation: "Installation VMC", description: "Pose VMC simple flux", unite: "unité", prixUnitaireHT: "450.00", categorie: "Ventilation" },
  { reference: "EL-011", designation: "Diagnostic électrique", description: "Diagnostic complet installation", unite: "intervention", prixUnitaireHT: "180.00", categorie: "Diagnostic" },
  { reference: "EL-012", designation: "Dépannage électrique", description: "Intervention dépannage urgence", unite: "intervention", prixUnitaireHT: "95.00", categorie: "Dépannage" },
  { reference: "EL-013", designation: "Installation panneau solaire", description: "Pose panneau photovoltaïque 400W", unite: "unité", prixUnitaireHT: "350.00", categorie: "Solaire" },
  { reference: "EL-014", designation: "Main d'œuvre horaire", description: "Taux horaire électricien", unite: "heure", prixUnitaireHT: "55.00", categorie: "Main d'œuvre" },
  { reference: "EL-015", designation: "Déplacement zone Lyon", description: "Frais de déplacement Lyon métropole", unite: "forfait", prixUnitaireHT: "35.00", categorie: "Déplacement" },
];

const devisData = [
  { clientIdx: 0, numero: "EL-DEV-2026-001", statut: "accepte", objet: "Rénovation électrique complète appartement", totalHT: "4500.00", totalTVA: "900.00", totalTTC: "5400.00" },
  { clientIdx: 1, numero: "EL-DEV-2026-002", statut: "envoye", objet: "Installation domotique maison", totalHT: "3200.00", totalTVA: "640.00", totalTTC: "3840.00" },
  { clientIdx: 2, numero: "EL-DEV-2026-003", statut: "accepte", objet: "Mise aux normes bureaux", totalHT: "6800.00", totalTVA: "1360.00", totalTTC: "8160.00" },
  { clientIdx: 4, numero: "EL-DEV-2026-004", statut: "brouillon", objet: "Rénovation tableau électrique immeuble", totalHT: "12500.00", totalTVA: "2500.00", totalTTC: "15000.00" },
  { clientIdx: 6, numero: "EL-DEV-2026-005", statut: "accepte", objet: "Installation panneaux solaires villa", totalHT: "8900.00", totalTVA: "1780.00", totalTTC: "10680.00" },
  { clientIdx: 7, numero: "EL-DEV-2026-006", statut: "envoye", objet: "Installation borne recharge VE", totalHT: "1450.00", totalTVA: "290.00", totalTTC: "1740.00" },
];

const facturesData = [
  { clientIdx: 0, devisIdx: 0, numero: "EL-FAC-2026-001", statut: "payee", objet: "Rénovation électrique complète appartement", totalHT: "4500.00", totalTVA: "900.00", totalTTC: "5400.00", montantPaye: "5400.00" },
  { clientIdx: 2, devisIdx: 2, numero: "EL-FAC-2026-002", statut: "envoyee", objet: "Mise aux normes bureaux", totalHT: "6800.00", totalTVA: "1360.00", totalTTC: "8160.00", montantPaye: "4000.00" },
  { clientIdx: 6, devisIdx: 4, numero: "EL-FAC-2026-003", statut: "envoyee", objet: "Installation panneaux solaires villa", totalHT: "8900.00", totalTVA: "1780.00", totalTTC: "10680.00", montantPaye: "0.00" },
  { clientIdx: 3, devisIdx: null, numero: "EL-FAC-2026-004", statut: "payee", objet: "Dépannage urgent commerce", totalHT: "220.00", totalTVA: "44.00", totalTTC: "264.00", montantPaye: "264.00" },
];

const chantiersData = [
  { clientIdx: 0, reference: "EL-CHT-2026-001", nom: "Rénovation appartement Part-Dieu", description: "Rénovation électrique complète T4", adresse: "15 Rue de la Part-Dieu", codePostal: "69003", ville: "Lyon", budgetPrevisionnel: "5500.00", statut: "en_cours", avancement: 60, priorite: "haute" },
  { clientIdx: 2, reference: "EL-CHT-2026-002", nom: "Mise aux normes bureaux Lafayette", description: "Mise en conformité NF C 15-100", adresse: "25 Cours Lafayette", codePostal: "69006", ville: "Lyon", budgetPrevisionnel: "8500.00", statut: "en_cours", avancement: 35, priorite: "normale" },
  { clientIdx: 6, reference: "EL-CHT-2026-003", nom: "Installation solaire villa Belges", description: "Installation 12 panneaux photovoltaïques", adresse: "78 Boulevard des Belges", codePostal: "69006", ville: "Lyon", budgetPrevisionnel: "12000.00", statut: "planifie", avancement: 5, priorite: "normale" },
];

const interventionsData = [
  { clientIdx: 0, techIdx: 0, titre: "Dépose ancien tableau électrique", statut: "terminee", daysOffset: -8 },
  { clientIdx: 0, techIdx: 0, titre: "Installation nouveau tableau", statut: "terminee", daysOffset: -5 },
  { clientIdx: 0, techIdx: 1, titre: "Tirage câbles et pose prises", statut: "en_cours", daysOffset: 0 },
  { clientIdx: 2, techIdx: 2, titre: "Diagnostic installation existante", statut: "terminee", daysOffset: -3 },
  { clientIdx: 2, techIdx: 0, titre: "Remplacement disjoncteurs", statut: "planifiee", daysOffset: 2 },
  { clientIdx: 6, techIdx: 3, titre: "Étude implantation panneaux", statut: "terminee", daysOffset: -1 },
  { clientIdx: 6, techIdx: 3, titre: "Installation structure support", statut: "planifiee", daysOffset: 5 },
  { clientIdx: 1, techIdx: 2, titre: "Installation domotique salon", statut: "planifiee", daysOffset: 4 },
  { clientIdx: 7, techIdx: 1, titre: "Installation borne recharge", statut: "planifiee", daysOffset: 6 },
  { clientIdx: 3, techIdx: 1, titre: "Dépannage panne électrique", statut: "terminee", daysOffset: -2 },
];

const contratsData = [
  { clientIdx: 2, reference: "EL-CTR-2026-001", titre: "Maintenance électrique bureaux", montantHT: "450.00", periodicite: "semestriel" },
  { clientIdx: 6, reference: "EL-CTR-2026-002", titre: "Entretien installation solaire", montantHT: "280.00", periodicite: "annuel" },
];

const notificationsData = [
  { type: "info", titre: "Bienvenue chez Électricité Duval", message: "Votre espace professionnel est prêt !" },
  { type: "rappel", titre: "Devis en attente", message: "Le devis EL-DEV-2026-002 attend la réponse du client." },
  { type: "succes", titre: "Paiement reçu", message: "Le paiement de 5400€ pour la facture EL-FAC-2026-001 a été reçu." },
];

const jour = (d: Date) => d.toISOString().split("T")[0];

async function seedElectricien() {
  const url = process.env.DATABASE_URL || "postgres://artisan_user:artisan_password@localhost:5432/artisan_mvp";
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool);

  console.log("⚡ Insertion des données pour l'artisan électricien…");
  try {
    // Idempotence : purge du graphe de l'artisan démo s'il existe déjà (repéré par l'openId).
    const [existingUser] = await db.select({ id: users.id, artisanId: users.artisanId }).from(users).where(eq(users.openId, OPEN_ID)).limit(1);
    if (existingUser) {
      const [a] = await db.select({ id: artisans.id }).from(artisans).where(eq(artisans.userId, existingUser.id)).limit(1);
      if (a) {
        const aId = a.id;
        for (const t of [notifications, interventions, contratsMaintenance, chantiers, factures, devis, articlesArtisan, techniciens, clients, parametresArtisan, fournisseurs]) {
          await db.delete(t).where(eq((t as typeof clients).artisanId, aId));
        }
        await db.delete(artisans).where(eq(artisans.id, aId));
      }
      await db.delete(users).where(eq(users.id, existingUser.id));
      console.log("♻️  Ancien graphe démo purgé.");
    }

    // Utilisateur + artisan (role 'user' MySQL → 'artisan' enum PG).
    const [user] = await db.insert(users).values({ openId: OPEN_ID, name: "Électricité Duval", email: "contact@electricite-duval.fr", loginMethod: "demo", role: "artisan" }).returning({ id: users.id });
    const [artisan] = await db.insert(artisans).values({
      userId: user.id, siret: "98765432109876", nomEntreprise: "Électricité Duval SARL", adresse: "42 Rue Ampère",
      codePostal: "69003", ville: "Lyon", telephone: "04 72 34 56 78", email: "contact@electricite-duval.fr",
      specialite: "electricite", metier: "electricien", tauxTVA: "20.00",
    }).returning({ id: artisans.id });
    const artisanId = artisan.id;
    console.log(`✅ Artisan créé: ID ${artisanId}`);

    await db.insert(parametresArtisan).values({ artisanId, prefixeDevis: "EL-DEV", prefixeFacture: "EL-FAC", compteurDevis: 1, compteurFacture: 1, mentionsLegales: "Garantie décennale - Assurance RC Pro" });

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
      adresse: c.adresse, codePostal: c.codePostal, ville: c.ville, dateDebut: jour(plusJours(-10)), dateFinPrevue: jour(plusJours(30)),
      budgetPrevisionnel: c.budgetPrevisionnel, statut: c.statut as "en_cours", avancement: c.avancement, priorite: c.priorite as "normale",
    })));
    console.log(`✅ ${chantiersData.length} chantiers créés`);

    await db.insert(interventions).values(interventionsData.map((i) => {
      const debut = plusJours(i.daysOffset);
      const fin = new Date(debut); fin.setHours(fin.getHours() + 4);
      const c = clientsData[i.clientIdx];
      return {
        artisanId, clientId: clientRows[i.clientIdx].id, titre: i.titre, description: "Intervention électricité",
        dateDebut: debut, dateFin: fin, statut: i.statut as "terminee", adresse: `${c.adresse}, ${c.codePostal} ${c.ville}`,
        technicienId: techRows[i.techIdx].id,
      };
    }));
    console.log(`✅ ${interventionsData.length} interventions créées`);

    const moisDecale = (n: number) => { const d = new Date(now); d.setMonth(d.getMonth() + n); return d; };
    await db.insert(contratsMaintenance).values(contratsData.map((c) => ({
      artisanId, clientId: clientRows[c.clientIdx].id, reference: c.reference, titre: c.titre,
      description: "Contrat de maintenance préventive", montantHT: c.montantHT, periodicite: c.periodicite as "annuel",
      dateDebut: moisDecale(-1), prochainFacturation: moisDecale(2), statut: "actif" as const,
    })));
    console.log(`✅ ${contratsData.length} contrats de maintenance créés`);

    await db.insert(fournisseurs).values([
      { artisanId, nom: "Rexel", contact: "Service pro Lyon", email: "lyon@rexel.fr", telephone: "04 72 10 20 30", adresse: "10 Zone Industrielle Est", codePostal: "69800", ville: "Saint-Priest" },
      { artisanId, nom: "Sonepar", contact: "Jean-Marc Dupuis", email: "jm.dupuis@sonepar.fr", telephone: "04 72 20 30 40", adresse: "25 Avenue des Entreprises", codePostal: "69100", ville: "Villeurbanne" },
      { artisanId, nom: "Legrand", contact: "Service commercial", email: "pro@legrand.fr", telephone: "04 72 30 40 50", adresse: "5 Rue de l'Innovation", codePostal: "69007", ville: "Lyon" },
    ]);
    console.log("✅ 3 fournisseurs créés");

    await db.insert(notifications).values(notificationsData.map((n) => ({ artisanId, type: n.type, titre: n.titre, message: n.message, lu: false })));
    console.log(`✅ ${notificationsData.length} notifications créées`);

    console.log(`\n⚡ Données électricien insérées (artisan ID ${artisanId}, openId ${OPEN_ID}).`);
  } catch (error) {
    console.error("❌ Erreur:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seedElectricien();
