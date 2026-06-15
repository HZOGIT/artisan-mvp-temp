// Seed de démo « riche » — PostgreSQL / nouvelle approche clean-archi : driver `pg` + Drizzle
// (schéma source unique `drizzle/schema.pg`). Crée un profil artisan plombier (Lyon) complet AVEC
// LIGNES DE DOCUMENTS : 3 clients, 4 fournisseurs, 8 devis (+ devis_lignes), 6 factures (+ factures_
// lignes, copiées des devis acceptés ou autonomes), interventions, 4 commandes fournisseurs (+ lignes)
// et 15 stocks (dont des articles sous le seuil d'alerte).
//
// Invariant préservé : pour chaque devis/facture/commande, Σ(montantHT des lignes) == totalHT, et la
// TVA = 20 % (montantTVA = montantHT × 0.20). Mappé au schéma PG (enums, dates timestamp = Date).
//
// NB divergence vs l'ancien `seed-demo.mjs` (qui s'attachait au « 1er artisan existant » + 3 clients
// repérés par email, et faisait du top-up par seuils) : porté SELF-CONTAINED avec un utilisateur démo
// DÉDIÉ (`demo-plombier-lyon-001`) → idempotent (purge du graphe avant ré-insertion), non destructif.
//   DATABASE_URL=postgres://artisan_user:artisan_password@localhost:5432/artisan_mvp \
//   pnpm exec tsx scripts/seed-demo.ts
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import {
  users, artisans, parametresArtisan, clients, fournisseurs,
  devis, devisLignes, factures, facturesLignes, interventions,
  commandesFournisseurs, lignesCommandesFournisseurs, stocks,
} from "../drizzle/schema.pg";

const OPEN_ID = "demo-plombier-lyon-001";
const n2 = (n: number) => n.toFixed(2);

const clientsData = [
  { nom: "Doudihab", prenom: "Karim", email: "doudihab@gmail.com", telephone: "06 12 00 00 01", adresse: "15 Rue Garibaldi", codePostal: "69006", ville: "Lyon", notes: "Chaudière gaz, accès chaufferie facile." },
  { nom: "Locapacx", prenom: "Marc", email: "locapacx@gmail.com", telephone: "06 12 00 00 02", adresse: "8 Cours Lafayette", codePostal: "69003", ville: "Lyon", notes: "Appartement T4, radiateurs." },
  { nom: "Zouiten", prenom: "Yassine", email: "zouiten@cheminov.com", telephone: "06 12 00 00 03", adresse: "22 Avenue Jean Jaurès", codePostal: "69007", ville: "Lyon", notes: "Maison individuelle." },
];

const fournisseursData = [
  { nom: "Point P Lyon", contact: "Service commercial", email: "contact@pointp-lyon.fr", telephone: "04 72 00 11 22", adresse: "45 Rue de la Chimie", codePostal: "69100", ville: "Villeurbanne" },
  { nom: "Rexel Lyon Sud", contact: "Agence commerciale", email: "rexel.lyonsud@rexel.fr", telephone: "04 78 00 33 44", adresse: "12 Avenue Berthelot", codePostal: "69007", ville: "Lyon" },
  { nom: "Sonepar Rhône", contact: "Service pro", email: "agence.rhone@sonepar.fr", telephone: "04 72 00 55 66", adresse: "78 Boulevard Vivier Merle", codePostal: "69003", ville: "Lyon" },
  { nom: "Leborgne Outillage", contact: "Département ventes", email: "commercial@leborgne.fr", telephone: "04 78 00 77 88", adresse: "23 Zone Industrielle", codePostal: "69200", ville: "Vénissieux" },
];

type Ligne = { designation: string; pu: number; qty: number; unite: string };
type DevisDef = { clientIdx: number; objet: string; statut: "brouillon" | "envoye" | "accepte" | "refuse"; notes: string; lignes: Ligne[] };

const devisDefs: DevisDef[] = [
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

// Factures : depuis les devis acceptés (copie des lignes) + autonomes. Statut par ordre.
const factureStatutsAcceptes: Array<"payee" | "envoyee" | "en_retard"> = ["payee", "payee", "envoyee", "envoyee"];
const facturesStandalone = [
  { clientIdx: 2, objet: "Dépannage urgent ballon eau chaude", totalHT: 245, statut: "envoyee" as const },
  { clientIdx: 0, objet: "Remplacement robinet cuisine", totalHT: 165, statut: "en_retard" as const },
];

type InterDef = { clientIdx: number; titre: string; desc: string; statut: "terminee" | "planifiee" | "en_cours"; daysAgo?: number; daysAhead?: number; dureeH: number };
const interventionsDefs: InterDef[] = [
  { clientIdx: 0, titre: "Installation chaudière gaz", desc: "Dépose ancienne chaudière et pose nouvelle Saunier Duval ThemaPlus.", statut: "terminee", daysAgo: 25, dureeH: 6 },
  { clientIdx: 2, titre: "Réparation fuite salle de bain", desc: "Remplacement siphon et flexibles sous lavabo.", statut: "terminee", daysAgo: 18, dureeH: 2 },
  { clientIdx: 1, titre: "Pose radiateur chambre 1", desc: "Installation radiateur acier 1000W + robinet thermostatique.", statut: "terminee", daysAgo: 12, dureeH: 3 },
  { clientIdx: 0, titre: "Entretien chaudière annuel", desc: "Contrôle brûleur, nettoyage échangeur, analyse combustion.", statut: "planifiee", daysAhead: 15, dureeH: 2 },
  { clientIdx: 1, titre: "Pose radiateur chambre 2", desc: "Suite installation radiateurs appartement T4.", statut: "planifiee", daysAhead: 8, dureeH: 3 },
  { clientIdx: 2, titre: "Installation adoucisseur eau", desc: "Pose adoucisseur 22L avec bypass.", statut: "planifiee", daysAhead: 22, dureeH: 4 },
  { clientIdx: 0, titre: "Remplacement cumulus", desc: "Dépose ballon 150L et pose chauffe-eau thermodynamique 200L.", statut: "en_cours", daysAgo: 0, dureeH: 5 },
  { clientIdx: 1, titre: "Débouchage canalisation", desc: "Débouchage haute pression canalisation cuisine.", statut: "terminee", daysAgo: 5, dureeH: 2 },
];

type CmdLigne = { designation: string; ref: string; qty: number; pu: number; unite: string };
type CmdDef = { fournisseurIdx: number; statut: "confirmee" | "envoyee" | "brouillon" | "livree"; delai: string; notes: string; lignes: CmdLigne[] };
const commandesDefs: CmdDef[] = [
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

const stocksDefs = [
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

async function seed() {
  const url = process.env.DATABASE_URL || "postgres://artisan_user:artisan_password@localhost:5432/artisan_mvp";
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool);

  console.log("🔧 Seed de démo riche (Plomberie Lyon)…");
  try {
    // Idempotence : purge du graphe de l'artisan démo (et de ses commandes/lignes/stocks).
    const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.openId, OPEN_ID)).limit(1);
    if (existingUser) {
      const [a] = await db.select({ id: artisans.id }).from(artisans).where(eq(artisans.userId, existingUser.id)).limit(1);
      if (a) {
        const aId = a.id;
        const cmd = await db.select({ id: commandesFournisseurs.id }).from(commandesFournisseurs).where(eq(commandesFournisseurs.artisanId, aId));
        for (const c of cmd) await db.delete(lignesCommandesFournisseurs).where(eq(lignesCommandesFournisseurs.commandeId, c.id));
        const dv = await db.select({ id: devis.id }).from(devis).where(eq(devis.artisanId, aId));
        for (const d of dv) await db.delete(devisLignes).where(eq(devisLignes.devisId, d.id));
        const fa = await db.select({ id: factures.id }).from(factures).where(eq(factures.artisanId, aId));
        for (const f of fa) await db.delete(facturesLignes).where(eq(facturesLignes.factureId, f.id));
        for (const t of [stocks, commandesFournisseurs, interventions, factures, devis, fournisseurs, parametresArtisan, clients]) {
          await db.delete(t).where(eq((t as typeof clients).artisanId, aId));
        }
        await db.delete(artisans).where(eq(artisans.id, aId));
      }
      await db.delete(users).where(eq(users.id, existingUser.id));
      console.log("♻️  Ancien graphe démo purgé.");
    }

    const [user] = await db.insert(users).values({ openId: OPEN_ID, name: "Plomberie Démo Lyon", email: "demo@plomberie-lyon.fr", loginMethod: "demo", role: "artisan" }).returning({ id: users.id });
    const [artisan] = await db.insert(artisans).values({ userId: user.id, siret: "45678901234567", nomEntreprise: "Plomberie Démo Lyon", adresse: "15 Rue des Artisans", codePostal: "69001", ville: "Lyon", telephone: "04 72 00 00 00", email: "demo@plomberie-lyon.fr", specialite: "plomberie", metier: "plombier", tauxTVA: "20.00" }).returning({ id: artisans.id });
    const artisanId = artisan.id;
    console.log(`✅ Artisan créé: ID ${artisanId}`);
    await db.insert(parametresArtisan).values({ artisanId, prefixeDevis: "DEV", prefixeFacture: "FAC", compteurDevis: 1, compteurFacture: 1, mentionsLegales: "Garantie décennale - Assurance RC Pro" });

    const clientRows = await db.insert(clients).values(clientsData.map((c) => ({ artisanId, ...c }))).returning({ id: clients.id });
    const fournRows = await db.insert(fournisseurs).values(fournisseursData.map((f) => ({ artisanId, ...f }))).returning({ id: fournisseurs.id });
    console.log(`✅ ${clientRows.length} clients + ${fournRows.length} fournisseurs`);

    const now = new Date();
    const plusJours = (base: Date, n: number) => { const d = new Date(base); d.setDate(d.getDate() + n); return d; };

    // Devis + lignes
    const devisCreated: Array<{ id: number; def: DevisDef; totalHT: number; totalTVA: number; totalTTC: number; numero: string }> = [];
    for (let i = 0; i < devisDefs.length; i++) {
      const def = devisDefs[i];
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

    // Factures : depuis les devis acceptés (copie des lignes) + autonomes
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

    // Interventions
    await db.insert(interventions).values(interventionsDefs.map((def) => {
      const debut = def.daysAgo !== undefined ? plusJours(now, -def.daysAgo) : plusJours(now, def.daysAhead ?? 0);
      debut.setHours(def.daysAgo !== undefined ? 8 : 9, 0, 0, 0);
      const fin = new Date(debut); fin.setHours(fin.getHours() + def.dureeH);
      return { artisanId, clientId: clientRows[def.clientIdx].id, titre: def.titre, description: def.desc, dateDebut: debut, dateFin: fin, statut: def.statut };
    }));
    console.log(`✅ ${interventionsDefs.length} interventions`);

    // Commandes fournisseurs + lignes
    for (let i = 0; i < commandesDefs.length; i++) {
      const def = commandesDefs[i];
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
    console.log(`✅ ${commandesDefs.length} commandes fournisseurs (+ lignes)`);

    // Stocks
    await db.insert(stocks).values(stocksDefs.map((s) => ({ artisanId, reference: s.ref, designation: s.designation, quantiteEnStock: n2(s.qty), seuilAlerte: n2(s.seuil), unite: "unité", prixAchat: n2(s.prix), emplacement: s.emplacement, fournisseur: s.fournisseur })));
    console.log(`✅ ${stocksDefs.length} stocks`);

    console.log(`\n✅ Seed démo terminé (artisan ID ${artisanId}, openId ${OPEN_ID}).`);
  } catch (error) {
    console.error("❌ Erreur:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
