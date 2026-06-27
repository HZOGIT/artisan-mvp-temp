/* Seed du jeu de données de démo — PostgreSQL / nouvelle approche clean-archi : driver `pg` + Drizzle.
   Insère un graphe tenant complet (artisan → params → clients → techniciens → articles → devis →
   factures → chantiers → interventions → contrats → fournisseurs → notifications).

   Mode simple (défaut) : Plomberie Martin & Fils (Paris)
   Mode riche (--riche) : Plomberie Démo Lyon (avec lignes de documents + commandes + stocks)

   DATABASE_URL=postgres://artisan_user:artisan_password@localhost:5432/artisan_mvp \
   pnpm exec tsx scripts/seed-data.ts [--riche]
*/

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import {
  users, artisans, parametresArtisan, clients, techniciens, articlesArtisan,
  devis, factures, chantiers, interventions, contratsMaintenance, fournisseurs, notifications,
  devisLignes, facturesLignes, commandesFournisseurs, lignesCommandesFournisseurs, stocks,
} from "../drizzle/schema.pg";

const isRiche = process.argv.includes("--riche");
const OPEN_ID = isRiche ? "demo-plombier-lyon-001" : "plombier-demo-001";
const n2 = (n: number) => n.toFixed(2);

const clientsDataSimple = [
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

const clientsDataRiche = [
  { nom: "Doudihab", prenom: "Karim", email: "doudihab@gmail.com", telephone: "06 12 00 00 01", adresse: "15 Rue Garibaldi", codePostal: "69006", ville: "Lyon", notes: "Chaudière gaz, accès chaufferie facile." },
  { nom: "Locapacx", prenom: "Marc", email: "locapacx@gmail.com", telephone: "06 12 00 00 02", adresse: "8 Cours Lafayette", codePostal: "69003", ville: "Lyon", notes: "Appartement T4, radiateurs." },
  { nom: "Zouiten", prenom: "Yassine", email: "zouiten@cheminov.com", telephone: "06 12 00 00 03", adresse: "22 Avenue Jean Jaurès", codePostal: "69007", ville: "Lyon", notes: "Maison individuelle." },
];

const techniciensDataSimple = [
  { nom: "Lefebvre", prenom: "Thomas", email: "thomas.lefebvre@plomberie-martin.fr", telephone: "06 11 22 33 44", specialite: "Plomberie générale", couleur: "#3b82f6" },
  { nom: "Girard", prenom: "Antoine", email: "antoine.girard@plomberie-martin.fr", telephone: "06 22 33 44 55", specialite: "Chauffage", couleur: "#ef4444" },
  { nom: "Bonnet", prenom: "Lucas", email: "lucas.bonnet@plomberie-martin.fr", telephone: "06 33 44 55 66", specialite: "Sanitaires", couleur: "#22c55e" },
  { nom: "Mercier", prenom: "Hugo", email: "hugo.mercier@plomberie-martin.fr", telephone: "06 44 55 66 77", specialite: "Dépannage urgence", couleur: "#f59e0b" },
  { nom: "Faure", prenom: "Julien", email: "julien.faure@plomberie-martin.fr", telephone: "06 55 66 77 88", specialite: "Installation neuve", couleur: "#8b5cf6" },
];

const articlesDataSimple = [
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

const devisDataSimple = [
  { clientIdx: 0, numero: "DEV-2026-001", statut: "accepte" as const, objet: "Rénovation salle de bain complète", totalHT: "3500.00", totalTVA: "700.00", totalTTC: "4200.00" },
  { clientIdx: 1, numero: "DEV-2026-002", statut: "envoye" as const, objet: "Remplacement chauffe-eau", totalHT: "1200.00", totalTVA: "240.00", totalTTC: "1440.00" },
  { clientIdx: 2, numero: "DEV-2026-003", statut: "accepte" as const, objet: "Installation cuisine professionnelle", totalHT: "5800.00", totalTVA: "1160.00", totalTTC: "6960.00" },
  { clientIdx: 3, numero: "DEV-2026-004", statut: "brouillon" as const, objet: "Réparation fuite toiture", totalHT: "450.00", totalTVA: "90.00", totalTTC: "540.00" },
  { clientIdx: 4, numero: "DEV-2026-005", statut: "envoye" as const, objet: "Mise aux normes colonnes montantes", totalHT: "8500.00", totalTVA: "1700.00", totalTTC: "10200.00" },
  { clientIdx: 5, numero: "DEV-2026-006", statut: "refuse" as const, objet: "Installation climatisation", totalHT: "3200.00", totalTVA: "640.00", totalTTC: "3840.00" },
  { clientIdx: 6, numero: "DEV-2026-007", statut: "accepte" as const, objet: "Rénovation sanitaires boutique", totalHT: "2100.00", totalTVA: "420.00", totalTTC: "2520.00" },
  { clientIdx: 7, numero: "DEV-2026-008", statut: "envoye" as const, objet: "Détartrage et entretien annuel", totalHT: "280.00", totalTVA: "56.00", totalTTC: "336.00" },
];

const facturesDataSimple = [
  { clientIdx: 0, devisIdx: 0, numero: "FAC-2026-001", statut: "payee" as const, objet: "Rénovation salle de bain complète", totalHT: "3500.00", totalTVA: "700.00", totalTTC: "4200.00", montantPaye: "4200.00" },
  { clientIdx: 2, devisIdx: 2, numero: "FAC-2026-002", statut: "envoyee" as const, objet: "Installation cuisine professionnelle", totalHT: "5800.00", totalTVA: "1160.00", totalTTC: "6960.00", montantPaye: "3000.00" },
  { clientIdx: 6, devisIdx: 6, numero: "FAC-2026-003", statut: "payee" as const, objet: "Rénovation sanitaires boutique", totalHT: "2100.00", totalTVA: "420.00", totalTTC: "2520.00", montantPaye: "2520.00" },
  { clientIdx: 3, devisIdx: null, numero: "FAC-2026-004", statut: "en_retard" as const, objet: "Dépannage urgent fuite", totalHT: "180.00", totalTVA: "36.00", totalTTC: "216.00", montantPaye: "0.00" },
  { clientIdx: 8, devisIdx: null, numero: "FAC-2026-005", statut: "envoyee" as const, objet: "Entretien annuel chauffage", totalHT: "150.00", totalTVA: "30.00", totalTTC: "180.00", montantPaye: "0.00" },
];

type Ligne = { designation: string; pu: number; qty: number; unite: string };
type DevisDef = { clientIdx: number; objet: string; statut: "brouillon" | "envoye" | "accepte" | "refuse"; notes: string; lignes: Ligne[] };
const devisDefsRiche: DevisDef[] = [
  { clientIdx: 0, objet: "Remplacement chaudière gaz condensation", statut: "accepte", notes: "Chaudière murale Saunier Duval ThemaPlus. Accès chaufferie facile.", lignes: [
    { designation: "Chaudière gaz condensation murale", pu: 2800, qty: 1, unite: "unité" },
    { designation: "Kit raccordement fumisterie", pu: 185, qty: 1, unite: "unité" },
    { designation: "Thermostat connecté", pu: 220, qty: 1, unite: "unité" },
    { designation: "Main d'oeuvre installation chaudière", pu: 650, qty: 1, unite: "forfait" },
    { designation: "Mise en service et réglages", pu: 150, qty: 1, unite: "forfait" } ] },
  { clientIdx: 1, objet: "Installation 6 radiateurs fonte", statut: "envoye", notes: "Radiateurs acier design pour appartement T4. Pose sur murs porteurs.", lignes: [
    { designation: "Radiateur acier double panneau 1000W", pu: 145, qty: 6, unite: "unité" },
    { designation: "Kit raccordement radiateur", pu: 18, qty: 6, unite: "unité" },
    { designation: "Robinet thermostatique", pu: 28, qty: 6, unite: "unité" },
    { designation: "Main d'oeuvre pose radiateur", pu: 85, qty: 6, unite: "unité" } ] },
  { clientIdx: 2, objet: "Dépannage fuite salle de bain", statut: "accepte", notes: "Fuite sous lavabo, joint de siphon usé + flexible à remplacer.", lignes: [
    { designation: "Déplacement et diagnostic", pu: 65, qty: 1, unite: "forfait" },
    { designation: "Siphon laiton chromé 32mm", pu: 38, qty: 1, unite: "unité" },
    { designation: "Flexible alimentation 50cm", pu: 12, qty: 2, unite: "unité" },
    { designation: "Joint fibre et téflon", pu: 5, qty: 1, unite: "lot" },
    { designation: "Main d'oeuvre réparation", pu: 85, qty: 2, unite: "heure" } ] },
  { clientIdx: 0, objet: "Entretien annuel chaudière gaz", statut: "brouillon", notes: "Contrat entretien annuel chaudière. Ramonage conduit inclus.", lignes: [
    { designation: "Entretien annuel chaudière gaz", pu: 95, qty: 1, unite: "forfait" },
    { designation: "Ramonage conduit fumée", pu: 55, qty: 1, unite: "forfait" },
    { designation: "Analyse combustion et réglages", pu: 35, qty: 1, unite: "forfait" } ] },
  { clientIdx: 1, objet: "Rénovation salle de bain complète", statut: "refuse", notes: "Rénovation totale SDB 6m². Client a finalement choisi un autre prestataire.", lignes: [
    { designation: "Dépose sanitaires existants", pu: 450, qty: 1, unite: "forfait" },
    { designation: "Receveur de douche 120x80", pu: 380, qty: 1, unite: "unité" },
    { designation: "Paroi de douche vitrée", pu: 520, qty: 1, unite: "unité" },
    { designation: "Meuble vasque 80cm", pu: 650, qty: 1, unite: "unité" },
    { designation: "Robinetterie mitigeur douche", pu: 185, qty: 1, unite: "unité" },
    { designation: "Main d'oeuvre plomberie", pu: 120, qty: 24, unite: "heure" } ] },
  { clientIdx: 2, objet: "Installation adoucisseur eau", statut: "envoye", notes: "Adoucisseur 22L pour maison. Bypass à prévoir.", lignes: [
    { designation: "Adoucisseur d'eau 22 litres", pu: 890, qty: 1, unite: "unité" },
    { designation: "Kit bypass adoucisseur", pu: 65, qty: 1, unite: "unité" },
    { designation: "Raccordement et mise en service", pu: 280, qty: 1, unite: "forfait" } ] },
  { clientIdx: 0, objet: "Remplacement cumulus 200L", statut: "accepte", notes: "Ballon ECS thermodynamique Atlantic. Pose en cave.", lignes: [
    { designation: "Chauffe-eau thermodynamique 200L", pu: 1450, qty: 1, unite: "unité" },
    { designation: "Kit raccordement hydraulique", pu: 75, qty: 1, unite: "lot" },
    { designation: "Groupe de sécurité", pu: 42, qty: 1, unite: "unité" },
    { designation: "Main d'oeuvre dépose + pose", pu: 350, qty: 1, unite: "forfait" } ] },
  { clientIdx: 1, objet: "Débouchage canalisation cuisine", statut: "accepte", notes: "Canalisation bouchée depuis 2 jours. Intervention rapide demandée.", lignes: [
    { designation: "Déplacement urgent", pu: 85, qty: 1, unite: "forfait" },
    { designation: "Débouchage haute pression", pu: 180, qty: 1, unite: "forfait" },
    { designation: "Inspection caméra", pu: 95, qty: 1, unite: "forfait" } ] },
];

const fournisseursDataRiche = [
  { nom: "Point P Lyon", contact: "Service commercial", email: "contact@pointp-lyon.fr", telephone: "04 72 00 11 22", adresse: "45 Rue de la Chimie", codePostal: "69100", ville: "Villeurbanne" },
  { nom: "Rexel Lyon Sud", contact: "Agence commerciale", email: "rexel.lyonsud@rexel.fr", telephone: "04 78 00 33 44", adresse: "12 Avenue Berthelot", codePostal: "69007", ville: "Lyon" },
  { nom: "Sonepar Rhône", contact: "Service pro", email: "agence.rhone@sonepar.fr", telephone: "04 72 00 55 66", adresse: "78 Boulevard Vivier Merle", codePostal: "69003", ville: "Lyon" },
  { nom: "Leborgne Outillage", contact: "Département ventes", email: "commercial@leborgne.fr", telephone: "04 78 00 77 88", adresse: "23 Zone Industrielle", codePostal: "69200", ville: "Vénissieux" },
];

const factureStatutsAcceptes: Array<"payee" | "envoyee" | "en_retard"> = ["payee", "payee", "envoyee", "envoyee"];
const facturesStandalone = [
  { clientIdx: 2, objet: "Dépannage urgent ballon eau chaude", totalHT: 245, statut: "envoyee" as const },
  { clientIdx: 0, objet: "Remplacement robinet cuisine", totalHT: 165, statut: "en_retard" as const },
];

type CmdLigne = { designation: string; ref: string; qty: number; pu: number; unite: string };
type CmdDef = { fournisseurIdx: number; statut: "confirmee" | "envoyee" | "brouillon" | "livree"; delai: string; notes: string; lignes: CmdLigne[] };
const commandesDefsRiche: CmdDef[] = [
  { fournisseurIdx: 0, statut: "confirmee", delai: "5 jours ouvrés", notes: "Livraison à confirmer la veille.", lignes: [
    { designation: "Tube cuivre 22mm (barre 4m)", ref: "CU-22-4M", qty: 10, pu: 28.5, unite: "barre" },
    { designation: "Raccord laiton T 22mm", ref: "RL-T22", qty: 20, pu: 4.8, unite: "unité" },
    { designation: "Coude cuivre 90° 22mm", ref: "CC-90-22", qty: 15, pu: 2.4, unite: "unité" },
    { designation: "Flux décapant 250ml", ref: "FD-250", qty: 5, pu: 8.9, unite: "flacon" } ] },
  { fournisseurIdx: 1, statut: "envoyee", delai: "3 jours ouvrés", notes: "Commande urgente pour chantier en cours.", lignes: [
    { designation: "Chauffe-eau thermodynamique 200L Atlantic", ref: "CET-200-ATL", qty: 1, pu: 980, unite: "unité" },
    { designation: "Groupe de sécurité", ref: "GS-20", qty: 1, pu: 22, unite: "unité" },
    { designation: "Kit raccordement hydraulique", ref: "KRH-20", qty: 1, pu: 45, unite: "lot" } ] },
  { fournisseurIdx: 2, statut: "brouillon", delai: "7 jours ouvrés", notes: "Réapprovisionnement stock mensuel.", lignes: [
    { designation: "Joint fibre 20/27 (lot 100)", ref: "JF-2027-100", qty: 2, pu: 12.5, unite: "lot" },
    { designation: "Téflon 12mm x 12m", ref: "TEF-12", qty: 10, pu: 2.8, unite: "rouleau" },
    { designation: "Siphon laiton 32mm", ref: "SL-32", qty: 5, pu: 18.5, unite: "unité" },
    { designation: "Flexible inox 50cm", ref: "FI-50", qty: 10, pu: 8.9, unite: "unité" },
    { designation: "Vanne d'arrêt 1/4 tour 20/27", ref: "VA-2027", qty: 5, pu: 12.8, unite: "unité" } ] },
  { fournisseurIdx: 0, statut: "livree", delai: "5 jours ouvrés", notes: "Commande livrée complète. RAS.", lignes: [
    { designation: "Robinet thermostatique Danfoss", ref: "RT-DAN", qty: 8, pu: 24.5, unite: "unité" },
    { designation: "Radiateur acier double 1000W", ref: "RAD-1000", qty: 6, pu: 98, unite: "unité" },
    { designation: "Kit raccordement radiateur", ref: "KRR-15", qty: 6, pu: 12.5, unite: "kit" } ] },
];

const stocksDefsRiche = [
  { ref: "CU-22-4M", designation: "Tube cuivre 22mm (barre 4m)", qty: 18, seuil: 5, prix: 28.5, emplacement: "Étagère A1", fournisseur: "Point P Lyon" },
  { ref: "CU-15-4M", designation: "Tube cuivre 15mm (barre 4m)", qty: 12, seuil: 5, prix: 22.0, emplacement: "Étagère A1", fournisseur: "Point P Lyon" },
  { ref: "PER-16", designation: "Tube PER 16mm (couronne 50m)", qty: 3, seuil: 1, prix: 45.0, emplacement: "Étagère A2", fournisseur: "Rexel Lyon Sud" },
  { ref: "RL-T22", designation: "Raccord laiton T 22mm", qty: 35, seuil: 10, prix: 4.8, emplacement: "Tiroir B1", fournisseur: "Point P Lyon" },
  { ref: "CC-90-22", designation: "Coude cuivre 90° 22mm", qty: 28, seuil: 10, prix: 2.4, emplacement: "Tiroir B1", fournisseur: "Point P Lyon" },
  { ref: "VA-2027", designation: "Vanne d'arrêt 1/4 tour 20/27", qty: 8, seuil: 3, prix: 12.8, emplacement: "Tiroir B2", fournisseur: "Sonepar Rhône" },
  { ref: "SL-32", designation: "Siphon laiton chromé 32mm", qty: 6, seuil: 3, prix: 18.5, emplacement: "Étagère C1", fournisseur: "Rexel Lyon Sud" },
  { ref: "FI-50", designation: "Flexible inox alimentation 50cm", qty: 14, seuil: 5, prix: 8.9, emplacement: "Tiroir C2", fournisseur: "Sonepar Rhône" },
  { ref: "GS-20", designation: "Groupe de sécurité 20x27", qty: 4, seuil: 2, prix: 22.0, emplacement: "Étagère D1", fournisseur: "Point P Lyon" },
  { ref: "JF-2027", designation: "Joint fibre 20/27 (lot 10)", qty: 1, seuil: 5, prix: 3.5, emplacement: "Tiroir B3", fournisseur: "Leborgne Outillage" },
  { ref: "TEF-12", designation: "Téflon PTFE 12mm x 12m", qty: 2, seuil: 5, prix: 2.8, emplacement: "Tiroir B3", fournisseur: "Leborgne Outillage" },
  { ref: "FD-250", designation: "Flux décapant brasure 250ml", qty: 0, seuil: 2, prix: 8.9, emplacement: "Étagère A3", fournisseur: "Point P Lyon" },
  { ref: "RT-DAN", designation: "Robinet thermostatique Danfoss", qty: 3, seuil: 2, prix: 24.5, emplacement: "Étagère D2", fournisseur: "Rexel Lyon Sud" },
  { ref: "CC-90-15", designation: "Coude cuivre 90° 15mm", qty: 22, seuil: 10, prix: 1.9, emplacement: "Tiroir B1", fournisseur: "Point P Lyon" },
  { ref: "MAN-001", designation: "Manomètre 0-10 bar radial", qty: 2, seuil: 1, prix: 15.0, emplacement: "Étagère D1", fournisseur: "Sonepar Rhône" },
];

const chantiersDataSimple = [
  { clientIdx: 0, reference: "CHT-2026-001", nom: "Rénovation appartement Champs-Élysées", description: "Rénovation complète plomberie et sanitaires", adresse: "25 Avenue des Champs-Élysées", codePostal: "75008", ville: "Paris", budgetPrevisionnel: "15000.00", statut: "en_cours" as const, avancement: 45, priorite: "haute" as const },
  { clientIdx: 2, reference: "CHT-2026-002", nom: "Installation restaurant Haussmann", description: "Installation cuisine professionnelle complète", adresse: "8 Boulevard Haussmann", codePostal: "75009", ville: "Paris", budgetPrevisionnel: "25000.00", statut: "en_cours" as const, avancement: 70, priorite: "urgente" as const },
  { clientIdx: 4, reference: "CHT-2026-003", nom: "Mise aux normes copropriété", description: "Remplacement colonnes montantes immeuble", adresse: "3 Place de la République", codePostal: "75003", ville: "Paris", budgetPrevisionnel: "45000.00", statut: "planifie" as const, avancement: 10, priorite: "normale" as const },
  { clientIdx: 9, reference: "CHT-2026-004", nom: "Aménagement loft Belleville", description: "Création salle de bain et cuisine", adresse: "34 Rue de Belleville", codePostal: "75020", ville: "Paris", budgetPrevisionnel: "12000.00", statut: "en_cours" as const, avancement: 30, priorite: "normale" as const },
];

const interventionsDataSimple = [
  { clientIdx: 0, techIdx: 0, titre: "Démolition ancienne salle de bain", statut: "terminee" as const, daysOffset: -10 },
  { clientIdx: 0, techIdx: 1, titre: "Installation nouvelle tuyauterie", statut: "terminee" as const, daysOffset: -7 },
  { clientIdx: 0, techIdx: 2, titre: "Pose sanitaires neufs", statut: "en_cours" as const, daysOffset: 0 },
  { clientIdx: 2, techIdx: 0, titre: "Installation éviers professionnels", statut: "terminee" as const, daysOffset: -5 },
  { clientIdx: 2, techIdx: 3, titre: "Raccordement gaz cuisine", statut: "en_cours" as const, daysOffset: 1 },
  { clientIdx: 2, techIdx: 1, titre: "Test et mise en service", statut: "planifiee" as const, daysOffset: 5 },
  { clientIdx: 4, techIdx: 4, titre: "Diagnostic colonnes montantes", statut: "planifiee" as const, daysOffset: 7 },
  { clientIdx: 9, techIdx: 2, titre: "Création arrivée eau salle de bain", statut: "en_cours" as const, daysOffset: 2 },
  { clientIdx: 9, techIdx: 0, titre: "Installation douche italienne", statut: "planifiee" as const, daysOffset: 8 },
  { clientIdx: 1, techIdx: 3, titre: "Remplacement chauffe-eau", statut: "planifiee" as const, daysOffset: 3 },
  { clientIdx: 3, techIdx: 4, titre: "Réparation fuite urgente", statut: "terminee" as const, daysOffset: -2 },
  { clientIdx: 7, techIdx: 1, titre: "Entretien annuel chauffage", statut: "planifiee" as const, daysOffset: 10 },
];

type InterDef = { clientIdx: number; titre: string; desc: string; statut: "terminee" | "planifiee" | "en_cours"; daysAgo?: number; daysAhead?: number; dureeH: number };
const interventionsDefsRiche: InterDef[] = [
  { clientIdx: 0, titre: "Installation chaudière gaz", desc: "Dépose ancienne chaudière et pose nouvelle Saunier Duval ThemaPlus.", statut: "terminee", daysAgo: 25, dureeH: 6 },
  { clientIdx: 2, titre: "Réparation fuite salle de bain", desc: "Remplacement siphon et flexibles sous lavabo.", statut: "terminee", daysAgo: 18, dureeH: 2 },
  { clientIdx: 1, titre: "Pose radiateur chambre 1", desc: "Installation radiateur acier 1000W + robinet thermostatique.", statut: "terminee", daysAgo: 12, dureeH: 3 },
  { clientIdx: 0, titre: "Entretien chaudière annuel", desc: "Contrôle brûleur, nettoyage échangeur, analyse combustion.", statut: "planifiee", daysAhead: 15, dureeH: 2 },
  { clientIdx: 1, titre: "Pose radiateur chambre 2", desc: "Suite installation radiateurs appartement T4.", statut: "planifiee", daysAhead: 8, dureeH: 3 },
  { clientIdx: 2, titre: "Installation adoucisseur eau", desc: "Pose adoucisseur 22L avec bypass.", statut: "planifiee", daysAhead: 22, dureeH: 4 },
  { clientIdx: 0, titre: "Remplacement cumulus", desc: "Dépose ballon 150L et pose chauffe-eau thermodynamique 200L.", statut: "en_cours", daysAgo: 0, dureeH: 5 },
  { clientIdx: 1, titre: "Débouchage canalisation", desc: "Débouchage haute pression canalisation cuisine.", statut: "terminee", daysAgo: 5, dureeH: 2 },
];

const fournisseursDataSimple = [
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

const contratsDataSimple = [
  { clientIdx: 0, reference: "CTR-2026-001", titre: "Contrat entretien annuel chauffage", montantHT: "180.00", periodicite: "annuel" as const },
  { clientIdx: 2, reference: "CTR-2026-002", titre: "Maintenance équipements cuisine", montantHT: "350.00", periodicite: "trimestriel" as const },
  { clientIdx: 4, reference: "CTR-2026-003", titre: "Entretien colonnes copropriété", montantHT: "1200.00", periodicite: "semestriel" as const },
];

const jour = (d: Date) => d.toISOString().split("T")[0];

async function seed() {
  const url = process.env.DATABASE_URL || "postgres://artisan_user:artisan_password@localhost:5432/artisan_mvp";
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool);

  const mode = isRiche ? "riche (Lyon)" : "simple (Paris)";
  console.log(`🌱 Insertion données de test ${mode}…`);
  try {
    const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.openId, OPEN_ID)).limit(1);
    if (existingUser) {
      const [a] = await db.select({ id: artisans.id }).from(artisans).where(eq(artisans.userId, existingUser.id)).limit(1);
      if (a) {
        const aId = a.id;
        if (isRiche) {
          const cmd = await db.select({ id: commandesFournisseurs.id }).from(commandesFournisseurs).where(eq(commandesFournisseurs.artisanId, aId));
          for (const c of cmd) await db.delete(lignesCommandesFournisseurs).where(eq(lignesCommandesFournisseurs.commandeId, c.id));
          const dv = await db.select({ id: devis.id }).from(devis).where(eq(devis.artisanId, aId));
          for (const d of dv) await db.delete(devisLignes).where(eq(devisLignes.devisId, d.id));
          const fa = await db.select({ id: factures.id }).from(factures).where(eq(factures.artisanId, aId));
          for (const f of fa) await db.delete(facturesLignes).where(eq(facturesLignes.factureId, f.id));
          for (const t of [stocks, commandesFournisseurs, interventions, factures, devis, fournisseurs, parametresArtisan, clients]) {
            await db.delete(t).where(eq((t as typeof clients).artisanId, aId));
          }
        } else {
          for (const t of [notifications, interventions, contratsMaintenance, chantiers, factures, devis, articlesArtisan, techniciens, clients, parametresArtisan, fournisseurs]) {
            await db.delete(t).where(eq((t as typeof clients).artisanId, a.id));
          }
        }
        await db.delete(artisans).where(eq(artisans.id, a.id));
      }
      await db.delete(users).where(eq(users.id, existingUser.id));
      console.log("♻️  Ancien graphe purgé.");
    }

    const artisanName = isRiche ? "Plomberie Démo Lyon" : "Plomberie Martin & Fils";
    const artisanEmail = isRiche ? "demo@plomberie-lyon.fr" : "contact@plomberie-martin.fr";
    const artisanAddr = isRiche ? "15 Rue des Artisans" : "15 Rue des Artisans";
    const artisanZip = isRiche ? "69001" : "75011";
    const artisanCity = isRiche ? "Lyon" : "Paris";
    const artisanPhone = isRiche ? "04 72 00 00 00" : "01 42 56 78 90";

    const [user] = await db.insert(users).values({ openId: OPEN_ID, name: artisanName, email: artisanEmail, loginMethod: "demo", role: "artisan" }).returning({ id: users.id });
    const [artisan] = await db.insert(artisans).values({
      userId: user.id, siret: isRiche ? "45678901234567" : "12345678901234", nomEntreprise: artisanName, adresse: artisanAddr,
      codePostal: artisanZip, ville: artisanCity, telephone: artisanPhone, email: artisanEmail,
      specialite: "plomberie", metier: "plombier", tauxTVA: "20.00",
    }).returning({ id: artisans.id });
    const artisanId = artisan.id;
    console.log(`✅ Artisan créé: ID ${artisanId}`);

    const mentions = isRiche ? "Garantie décennale - Assurance RC Pro" : "TVA non applicable, art. 293 B du CGI";
    await db.insert(parametresArtisan).values({ artisanId, prefixeDevis: "DEV", prefixeFacture: "FAC", compteurDevis: 1, compteurFacture: 1, mentionsLegales: mentions });

    if (isRiche) {
      const clientRows = await db.insert(clients).values(clientsDataRiche.map((c) => ({ artisanId, ...c }))).returning({ id: clients.id });
      const fournRows = await db.insert(fournisseurs).values(fournisseursDataRiche.map((f) => ({ artisanId, ...f }))).returning({ id: fournisseurs.id });
      console.log(`✅ ${clientRows.length} clients + ${fournRows.length} fournisseurs`);

      const now = new Date();
      const plusJours = (base: Date, n: number) => { const d = new Date(base); d.setDate(d.getDate() + n); return d; };

      const devisCreated: Array<{ id: number; def: DevisDef; totalHT: number; totalTVA: number; totalTTC: number; numero: string }> = [];
      for (let i = 0; i < devisDefsRiche.length; i++) {
        const def = devisDefsRiche[i];
        const totalHT = def.lignes.reduce((s, l) => s + l.pu * l.qty, 0);
        const totalTVA = totalHT * 0.2;
        const totalTTC = totalHT + totalTVA;
        const numero = `DEV-${String(i + 1).padStart(5, "0")}`;
        const dateDevis = new Date(2025, 10 + Math.floor(i / 3), 5 + i * 3);
        const [d] = await db.insert(devis).values({
          artisanId, clientId: clientRows[def.clientIdx].id, numero, dateDevis, dateValidite: plusJours(dateDevis, 30),
          statut: def.statut, objet: def.objet, notes: def.notes, totalHT: n2(totalHT), totalTVA: n2(totalTVA), totalTTC: n2(totalTTC),
        }).returning({ id: devis.id });
        await db.insert(devisLignes).values(def.lignes.map((l, j) => {
          const mHT = l.pu * l.qty;
          return { devisId: d.id, ordre: j + 1, designation: l.designation, quantite: n2(l.qty), unite: l.unite, prixUnitaireHT: n2(l.pu), tauxTVA: "20.00", montantHT: n2(mHT), montantTVA: n2(mHT * 0.2), montantTTC: n2(mHT * 1.2) };
        }));
        devisCreated.push({ id: d.id, def, totalHT, totalTVA, totalTTC, numero });
      }
      console.log(`✅ ${devisCreated.length} devis (+ lignes)`);

      let facCounter = 1;
      const acceptes = devisCreated.filter((d) => d.def.statut === "accepte");
      for (let i = 0; i < acceptes.length; i++) {
        const dv = acceptes[i];
        const statut = factureStatutsAcceptes[i] ?? "envoyee";
        const numero = `FAC-${String(facCounter++).padStart(5, "0")}`;
        const dateFacture = new Date(2025, 11, 1 + i * 5);
        const dateEcheance = statut === "en_retard" ? new Date(2025, 10, 15) : plusJours(dateFacture, 30);
        const payee = statut === "payee";
        const [f] = await db.insert(factures).values({
          artisanId, clientId: clientRows[dv.def.clientIdx].id, devisId: dv.id, numero, dateFacture, dateEcheance, statut,
          objet: dv.def.objet, totalHT: n2(dv.totalHT), totalTVA: n2(dv.totalTVA), totalTTC: n2(dv.totalTTC),
          montantPaye: payee ? n2(dv.totalTTC) : "0.00", datePaiement: payee ? plusJours(dateFacture, 15) : null, modePaiement: payee ? (i === 0 ? "virement" : "carte") : null,
        }).returning({ id: factures.id });
        await db.insert(facturesLignes).values(dv.def.lignes.map((l, j) => {
          const mHT = l.pu * l.qty;
          return { factureId: f.id, ordre: j + 1, designation: l.designation, quantite: n2(l.qty), unite: l.unite, prixUnitaireHT: n2(l.pu), tauxTVA: "20.00", montantHT: n2(mHT), montantTVA: n2(mHT * 0.2), montantTTC: n2(mHT * 1.2) };
        }));
      }
      for (let i = 0; i < facturesStandalone.length; i++) {
        const sf = facturesStandalone[i];
        const numero = `FAC-${String(facCounter++).padStart(5, "0")}`;
        const totalTVA = sf.totalHT * 0.2;
        const totalTTC = sf.totalHT + totalTVA;
        const dateFacture = new Date(2025, 11, 10 + i * 5);
        const dateEcheance = sf.statut === "en_retard" ? new Date(2025, 10, 20) : plusJours(dateFacture, 30);
        const [f] = await db.insert(factures).values({
          artisanId, clientId: clientRows[sf.clientIdx].id, numero, dateFacture, dateEcheance, statut: sf.statut, objet: sf.objet,
          totalHT: n2(sf.totalHT), totalTVA: n2(totalTVA), totalTTC: n2(totalTTC), montantPaye: "0.00",
        }).returning({ id: factures.id });
        await db.insert(facturesLignes).values({ factureId: f.id, ordre: 1, designation: sf.objet, quantite: "1.00", unite: "forfait", prixUnitaireHT: n2(sf.totalHT), tauxTVA: "20.00", montantHT: n2(sf.totalHT), montantTVA: n2(totalTVA), montantTTC: n2(totalTTC) });
      }
      console.log(`✅ ${acceptes.length + facturesStandalone.length} factures (+ lignes)`);

      await db.insert(interventions).values(interventionsDefsRiche.map((def) => {
        const debut = def.daysAgo !== undefined ? plusJours(now, -def.daysAgo) : plusJours(now, def.daysAhead ?? 0);
        debut.setHours(def.daysAgo !== undefined ? 8 : 9, 0, 0, 0);
        const fin = new Date(debut); fin.setHours(fin.getHours() + def.dureeH);
        return { artisanId, clientId: clientRows[def.clientIdx].id, titre: def.titre, description: def.desc, dateDebut: debut, dateFin: fin, statut: def.statut };
      }));
      console.log(`✅ ${interventionsDefsRiche.length} interventions`);

      for (let i = 0; i < commandesDefsRiche.length; i++) {
        const def = commandesDefsRiche[i];
        const totalHT = def.lignes.reduce((s, l) => s + l.qty * l.pu, 0);
        const totalTVA = totalHT * 0.2;
        const totalTTC = totalHT + totalTVA;
        const numero = `CMD-${String(i + 1).padStart(5, "0")}`;
        const [cmd] = await db.insert(commandesFournisseurs).values({
          artisanId, fournisseurId: fournRows[def.fournisseurIdx].id, numero, dateCommande: new Date(2025, 11, 5 + i * 7), statut: def.statut,
          totalHT: n2(totalHT), totalTVA: n2(totalTVA), totalTTC: n2(totalTTC), montantTotal: n2(totalTTC), delaiLivraison: def.delai,
          adresseLivraison: "15 Rue des Artisans, 69001 Lyon", notes: def.notes,
        }).returning({ id: commandesFournisseurs.id });
        await db.insert(lignesCommandesFournisseurs).values(def.lignes.map((l) => ({
          commandeId: cmd.id, designation: l.designation, reference: l.ref, quantite: n2(l.qty), unite: l.unite, prixUnitaire: n2(l.pu), tauxTVA: "20.00", montantTotal: n2(l.qty * l.pu),
        })));
      }
      console.log(`✅ ${commandesDefsRiche.length} commandes fournisseurs (+ lignes)`);

      await db.insert(stocks).values(stocksDefsRiche.map((s) => ({ artisanId, reference: s.ref, designation: s.designation, quantiteEnStock: n2(s.qty), seuilAlerte: n2(s.seuil), unite: "unité", prixAchat: n2(s.prix), emplacement: s.emplacement, fournisseur: s.fournisseur })));
      console.log(`✅ ${stocksDefsRiche.length} stocks`);

      console.log(`\n✅ Seed ${mode} complété (ID ${artisanId}, openId ${OPEN_ID}).`);
    } else {
      const clientRows = await db.insert(clients).values(clientsDataSimple.map((c) => ({ artisanId, ...c }))).returning({ id: clients.id });
      console.log(`✅ ${clientRows.length} clients créés`);
      const techRows = await db.insert(techniciens).values(techniciensDataSimple.map((t) => ({ artisanId, statut: "actif" as const, ...t }))).returning({ id: techniciens.id });
      console.log(`✅ ${techRows.length} techniciens créés`);

      await db.insert(articlesArtisan).values(articlesDataSimple.map((a) => ({ artisanId, ...a })));
      console.log(`✅ ${articlesDataSimple.length} articles créés`);

      const now = new Date();
      const plusJours = (n: number) => { const d = new Date(now); d.setDate(d.getDate() + n); return d; };

      const devisRows = await db.insert(devis).values(devisDataSimple.map((d) => ({
        artisanId, clientId: clientRows[d.clientIdx].id, numero: d.numero, dateDevis: now, dateValidite: plusJours(30),
        statut: d.statut, objet: d.objet, totalHT: d.totalHT, totalTVA: d.totalTVA, totalTTC: d.totalTTC,
      }))).returning({ id: devis.id });
      console.log(`✅ ${devisRows.length} devis créés`);

      await db.insert(factures).values(facturesDataSimple.map((f) => ({
        artisanId, clientId: clientRows[f.clientIdx].id, devisId: f.devisIdx !== null ? devisRows[f.devisIdx].id : null,
        numero: f.numero, dateFacture: now, dateEcheance: plusJours(30), statut: f.statut, objet: f.objet,
        totalHT: f.totalHT, totalTVA: f.totalTVA, totalTTC: f.totalTTC, montantPaye: f.montantPaye,
      })));
      console.log(`✅ ${facturesDataSimple.length} factures créées`);

      await db.insert(chantiers).values(chantiersDataSimple.map((c) => ({
        artisanId, clientId: clientRows[c.clientIdx].id, reference: c.reference, nom: c.nom, description: c.description,
        adresse: c.adresse, codePostal: c.codePostal, ville: c.ville, dateDebut: jour(plusJours(-15)), dateFinPrevue: jour(plusJours(45)),
        budgetPrevisionnel: c.budgetPrevisionnel, statut: c.statut, avancement: c.avancement, priorite: c.priorite,
      })));
      console.log(`✅ ${chantiersDataSimple.length} chantiers créés`);

      await db.insert(interventions).values(interventionsDataSimple.map((i) => {
        const debut = plusJours(i.daysOffset);
        const fin = new Date(debut); fin.setHours(fin.getHours() + 4);
        const c = clientsDataSimple[i.clientIdx];
        return {
          artisanId, clientId: clientRows[i.clientIdx].id, titre: i.titre, description: "Intervention planifiée",
          dateDebut: debut, dateFin: fin, statut: i.statut, adresse: `${c.adresse}, ${c.codePostal} ${c.ville}`,
          technicienId: techRows[i.techIdx].id,
        };
      }));
      console.log(`✅ ${interventionsDataSimple.length} interventions créées`);

      const moisDecale = (n: number) => { const d = new Date(now); d.setMonth(d.getMonth() + n); return d; };
      await db.insert(contratsMaintenance).values(contratsDataSimple.map((c) => ({
        artisanId, clientId: clientRows[c.clientIdx].id, reference: c.reference, titre: c.titre,
        description: "Contrat de maintenance préventive", montantHT: c.montantHT, periodicite: c.periodicite,
        dateDebut: moisDecale(-2), prochainFacturation: moisDecale(1), statut: "actif" as const,
      })));
      console.log(`✅ ${contratsDataSimple.length} contrats de maintenance créés`);

      const fournRows = await db.insert(fournisseurs).values(fournisseursDataSimple.map((f) => ({ artisanId, ...f }))).returning({ id: fournisseurs.id });
      console.log(`✅ ${fournRows.length} fournisseurs créés`);

      await db.insert(notifications).values(notificationsData.map((n) => ({ artisanId, type: n.type, titre: n.titre, message: n.message, lu: false })));
      console.log(`✅ ${notificationsData.length} notifications créées`);

      console.log(`\n🎉 Données de test insérées (ID ${artisanId}, openId ${OPEN_ID}).`);
    }
  } catch (error) {
    console.error("❌ Erreur:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
