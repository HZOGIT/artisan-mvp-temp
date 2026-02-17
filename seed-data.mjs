import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;

async function seed() {
  const connection = await mysql.createConnection({ uri: DATABASE_URL, charset: 'utf8mb4' });
  await connection.execute('SET NAMES utf8mb4');

  console.log('🌱 Insertion des données de test...');
  
  try {
    // Récupérer l'utilisateur existant
    const [users] = await connection.execute('SELECT id FROM users LIMIT 1');
    if (users.length === 0) {
      console.log('❌ Aucun utilisateur trouvé. Veuillez vous connecter d\'abord.');
      return;
    }
    const userId = users[0].id;
    console.log(`✅ Utilisateur trouvé: ID ${userId}`);
    
    // Créer l'artisan principal
    await connection.execute(`
      INSERT INTO artisans (userId, siret, nomEntreprise, adresse, codePostal, ville, telephone, email, specialite, tauxTVA)
      VALUES (?, '12345678901234', 'Plomberie Martin & Fils', '15 Rue des Artisans', '75011', 'Paris', '01 42 56 78 90', 'contact@plomberie-martin.fr', 'plomberie', '20.00')
      ON DUPLICATE KEY UPDATE nomEntreprise = VALUES(nomEntreprise)
    `, [userId]);
    
    const [artisans] = await connection.execute('SELECT id FROM artisans WHERE userId = ?', [userId]);
    const artisanId = artisans[0].id;
    console.log(`✅ Artisan créé: ID ${artisanId}`);
    
    // Créer les paramètres artisan
    await connection.execute(`
      INSERT INTO parametres_artisan (artisanId, prefixeDevis, prefixeFacture, compteurDevis, compteurFacture, mentionsLegales)
      VALUES (?, 'DEV', 'FAC', 1, 1, 'TVA non applicable, art. 293 B du CGI')
      ON DUPLICATE KEY UPDATE prefixeDevis = VALUES(prefixeDevis)
    `, [artisanId]);
    
    // ============================================================================
    // CLIENTS (10 clients variés)
    // ============================================================================
    const clientsData = [
      { nom: 'Dupont', prenom: 'Jean', email: 'jean.dupont@email.fr', telephone: '06 12 34 56 78', adresse: '25 Avenue des Champs-Élysées', codePostal: '75008', ville: 'Paris', notes: 'Client fidèle depuis 2020' },
      { nom: 'Martin', prenom: 'Marie', email: 'marie.martin@gmail.com', telephone: '06 23 45 67 89', adresse: '12 Rue de la Paix', codePostal: '75002', ville: 'Paris', notes: 'Appartement haussmannien' },
      { nom: 'Bernard', prenom: 'Pierre', email: 'p.bernard@entreprise.fr', telephone: '06 34 56 78 90', adresse: '8 Boulevard Haussmann', codePostal: '75009', ville: 'Paris', notes: 'Gérant de restaurant' },
      { nom: 'Petit', prenom: 'Sophie', email: 'sophie.petit@outlook.fr', telephone: '06 45 67 89 01', adresse: '45 Rue du Commerce', codePostal: '75015', ville: 'Paris', notes: 'Maison individuelle' },
      { nom: 'Robert', prenom: 'Michel', email: 'michel.robert@free.fr', telephone: '06 56 78 90 12', adresse: '3 Place de la République', codePostal: '75003', ville: 'Paris', notes: 'Syndic copropriété' },
      { nom: 'Richard', prenom: 'Isabelle', email: 'isabelle.richard@wanadoo.fr', telephone: '06 67 89 01 23', adresse: '78 Avenue de la Grande Armée', codePostal: '75017', ville: 'Paris', notes: 'Bureau professionnel' },
      { nom: 'Durand', prenom: 'François', email: 'f.durand@societe.com', telephone: '06 78 90 12 34', adresse: '156 Rue de Rivoli', codePostal: '75001', ville: 'Paris', notes: 'Boutique centre-ville' },
      { nom: 'Leroy', prenom: 'Catherine', email: 'catherine.leroy@orange.fr', telephone: '06 89 01 23 45', adresse: '22 Rue Montmartre', codePostal: '75018', ville: 'Paris', notes: 'Immeuble ancien' },
      { nom: 'Moreau', prenom: 'Philippe', email: 'philippe.moreau@sfr.fr', telephone: '06 90 12 34 56', adresse: '67 Boulevard Saint-Germain', codePostal: '75005', ville: 'Paris', notes: 'Appartement de standing' },
      { nom: 'Simon', prenom: 'Nathalie', email: 'nathalie.simon@laposte.net', telephone: '06 01 23 45 67', adresse: '34 Rue de Belleville', codePostal: '75020', ville: 'Paris', notes: 'Loft rénové' }
    ];
    
    for (const client of clientsData) {
      await connection.execute(`
        INSERT INTO clients (artisanId, nom, prenom, email, telephone, adresse, codePostal, ville, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [artisanId, client.nom, client.prenom, client.email, client.telephone, client.adresse, client.codePostal, client.ville, client.notes]);
    }
    console.log(`✅ ${clientsData.length} clients créés`);
    
    // Récupérer les IDs des clients
    const [clients] = await connection.execute('SELECT id, nom FROM clients WHERE artisanId = ?', [artisanId]);
    
    // ============================================================================
    // TECHNICIENS (5 techniciens)
    // ============================================================================
    const techniciensData = [
      { nom: 'Lefebvre', prenom: 'Thomas', email: 'thomas.lefebvre@plomberie-martin.fr', telephone: '06 11 22 33 44', specialite: 'Plomberie générale', couleur: '#3b82f6' },
      { nom: 'Girard', prenom: 'Antoine', email: 'antoine.girard@plomberie-martin.fr', telephone: '06 22 33 44 55', specialite: 'Chauffage', couleur: '#ef4444' },
      { nom: 'Bonnet', prenom: 'Lucas', email: 'lucas.bonnet@plomberie-martin.fr', telephone: '06 33 44 55 66', specialite: 'Sanitaires', couleur: '#22c55e' },
      { nom: 'Mercier', prenom: 'Hugo', email: 'hugo.mercier@plomberie-martin.fr', telephone: '06 44 55 66 77', specialite: 'Dépannage urgence', couleur: '#f59e0b' },
      { nom: 'Faure', prenom: 'Julien', email: 'julien.faure@plomberie-martin.fr', telephone: '06 55 66 77 88', specialite: 'Installation neuve', couleur: '#8b5cf6' }
    ];
    
    for (const tech of techniciensData) {
      await connection.execute(`
        INSERT INTO techniciens (artisanId, nom, prenom, email, telephone, specialite, couleur, statut)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'actif')
      `, [artisanId, tech.nom, tech.prenom, tech.email, tech.telephone, tech.specialite, tech.couleur]);
    }
    console.log(`✅ ${techniciensData.length} techniciens créés`);
    
    // Récupérer les IDs des techniciens
    const [techniciens] = await connection.execute('SELECT id, nom FROM techniciens WHERE artisanId = ?', [artisanId]);
    
    // ============================================================================
    // ARTICLES ARTISAN (15 articles)
    // ============================================================================
    const articlesData = [
      { reference: 'PLB-001', designation: 'Remplacement robinet mitigeur', description: 'Fourniture et pose d\'un robinet mitigeur standard', unite: 'unité', prixUnitaireHT: '85.00', categorie: 'Robinetterie' },
      { reference: 'PLB-002', designation: 'Débouchage canalisation', description: 'Débouchage mécanique ou chimique', unite: 'intervention', prixUnitaireHT: '120.00', categorie: 'Débouchage' },
      { reference: 'PLB-003', designation: 'Installation WC complet', description: 'Fourniture et pose WC avec réservoir', unite: 'unité', prixUnitaireHT: '350.00', categorie: 'Sanitaires' },
      { reference: 'PLB-004', designation: 'Réparation fuite eau', description: 'Recherche et réparation de fuite', unite: 'intervention', prixUnitaireHT: '95.00', categorie: 'Réparation' },
      { reference: 'PLB-005', designation: 'Remplacement chauffe-eau 200L', description: 'Fourniture et pose chauffe-eau électrique', unite: 'unité', prixUnitaireHT: '890.00', categorie: 'Chauffage' },
      { reference: 'PLB-006', designation: 'Installation douche italienne', description: 'Création douche à l\'italienne complète', unite: 'forfait', prixUnitaireHT: '2500.00', categorie: 'Sanitaires' },
      { reference: 'PLB-007', designation: 'Remplacement siphon', description: 'Fourniture et pose siphon évier/lavabo', unite: 'unité', prixUnitaireHT: '45.00', categorie: 'Robinetterie' },
      { reference: 'PLB-008', designation: 'Détartrage chauffe-eau', description: 'Entretien et détartrage complet', unite: 'intervention', prixUnitaireHT: '150.00', categorie: 'Entretien' },
      { reference: 'PLB-009', designation: 'Installation lave-vaisselle', description: 'Raccordement eau et évacuation', unite: 'intervention', prixUnitaireHT: '75.00', categorie: 'Installation' },
      { reference: 'PLB-010', designation: 'Remplacement joint robinet', description: 'Fourniture et pose joint', unite: 'unité', prixUnitaireHT: '35.00', categorie: 'Réparation' },
      { reference: 'PLB-011', designation: 'Main d\'œuvre horaire', description: 'Taux horaire intervention', unite: 'heure', prixUnitaireHT: '55.00', categorie: 'Main d\'œuvre' },
      { reference: 'PLB-012', designation: 'Déplacement zone Paris', description: 'Frais de déplacement Paris intra-muros', unite: 'forfait', prixUnitaireHT: '30.00', categorie: 'Déplacement' },
      { reference: 'PLB-013', designation: 'Remplacement radiateur', description: 'Dépose ancien et pose nouveau radiateur', unite: 'unité', prixUnitaireHT: '280.00', categorie: 'Chauffage' },
      { reference: 'PLB-014', designation: 'Purge circuit chauffage', description: 'Purge complète installation', unite: 'intervention', prixUnitaireHT: '85.00', categorie: 'Entretien' },
      { reference: 'PLB-015', designation: 'Installation baignoire', description: 'Pose baignoire avec robinetterie', unite: 'forfait', prixUnitaireHT: '450.00', categorie: 'Sanitaires' }
    ];
    
    for (const article of articlesData) {
      await connection.execute(`
        INSERT INTO articles_artisan (artisanId, reference, designation, description, unite, prixUnitaireHT, categorie)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [artisanId, article.reference, article.designation, article.description, article.unite, article.prixUnitaireHT, article.categorie]);
    }
    console.log(`✅ ${articlesData.length} articles créés`);
    
    // ============================================================================
    // DEVIS (8 devis variés)
    // ============================================================================
    const now = new Date();
    const devisData = [
      { clientIdx: 0, numero: 'DEV-2026-001', statut: 'accepte', objet: 'Rénovation salle de bain complète', totalHT: '3500.00', totalTVA: '700.00', totalTTC: '4200.00' },
      { clientIdx: 1, numero: 'DEV-2026-002', statut: 'envoye', objet: 'Remplacement chauffe-eau', totalHT: '1200.00', totalTVA: '240.00', totalTTC: '1440.00' },
      { clientIdx: 2, numero: 'DEV-2026-003', statut: 'accepte', objet: 'Installation cuisine professionnelle', totalHT: '5800.00', totalTVA: '1160.00', totalTTC: '6960.00' },
      { clientIdx: 3, numero: 'DEV-2026-004', statut: 'brouillon', objet: 'Réparation fuite toiture', totalHT: '450.00', totalTVA: '90.00', totalTTC: '540.00' },
      { clientIdx: 4, numero: 'DEV-2026-005', statut: 'envoye', objet: 'Mise aux normes colonnes montantes', totalHT: '8500.00', totalTVA: '1700.00', totalTTC: '10200.00' },
      { clientIdx: 5, numero: 'DEV-2026-006', statut: 'refuse', objet: 'Installation climatisation', totalHT: '3200.00', totalTVA: '640.00', totalTTC: '3840.00' },
      { clientIdx: 6, numero: 'DEV-2026-007', statut: 'accepte', objet: 'Rénovation sanitaires boutique', totalHT: '2100.00', totalTVA: '420.00', totalTTC: '2520.00' },
      { clientIdx: 7, numero: 'DEV-2026-008', statut: 'envoye', objet: 'Détartrage et entretien annuel', totalHT: '280.00', totalTVA: '56.00', totalTTC: '336.00' }
    ];
    
    for (const devis of devisData) {
      const clientId = clients[devis.clientIdx].id;
      const dateValidite = new Date(now);
      dateValidite.setDate(dateValidite.getDate() + 30);
      
      await connection.execute(`
        INSERT INTO devis (artisanId, clientId, numero, dateDevis, dateValidite, statut, objet, totalHT, totalTVA, totalTTC)
        VALUES (?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?)
      `, [artisanId, clientId, devis.numero, dateValidite, devis.statut, devis.objet, devis.totalHT, devis.totalTVA, devis.totalTTC]);
    }
    console.log(`✅ ${devisData.length} devis créés`);
    
    // Récupérer les IDs des devis
    const [devisList] = await connection.execute('SELECT id, numero FROM devis WHERE artisanId = ?', [artisanId]);
    
    // ============================================================================
    // FACTURES (5 factures)
    // ============================================================================
    const facturesData = [
      { clientIdx: 0, devisIdx: 0, numero: 'FAC-2026-001', statut: 'payee', objet: 'Rénovation salle de bain complète', totalHT: '3500.00', totalTVA: '700.00', totalTTC: '4200.00', montantPaye: '4200.00' },
      { clientIdx: 2, devisIdx: 2, numero: 'FAC-2026-002', statut: 'envoyee', objet: 'Installation cuisine professionnelle', totalHT: '5800.00', totalTVA: '1160.00', totalTTC: '6960.00', montantPaye: '3000.00' },
      { clientIdx: 6, devisIdx: 6, numero: 'FAC-2026-003', statut: 'payee', objet: 'Rénovation sanitaires boutique', totalHT: '2100.00', totalTVA: '420.00', totalTTC: '2520.00', montantPaye: '2520.00' },
      { clientIdx: 3, devisIdx: null, numero: 'FAC-2026-004', statut: 'en_retard', objet: 'Dépannage urgent fuite', totalHT: '180.00', totalTVA: '36.00', totalTTC: '216.00', montantPaye: '0.00' },
      { clientIdx: 8, devisIdx: null, numero: 'FAC-2026-005', statut: 'envoyee', objet: 'Entretien annuel chauffage', totalHT: '150.00', totalTVA: '30.00', totalTTC: '180.00', montantPaye: '0.00' }
    ];
    
    for (const facture of facturesData) {
      const clientId = clients[facture.clientIdx].id;
      const devisId = facture.devisIdx !== null ? devisList[facture.devisIdx].id : null;
      const dateEcheance = new Date(now);
      dateEcheance.setDate(dateEcheance.getDate() + 30);
      
      await connection.execute(`
        INSERT INTO factures (artisanId, clientId, devisId, numero, dateFacture, dateEcheance, statut, objet, totalHT, totalTVA, totalTTC, montantPaye)
        VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?)
      `, [artisanId, clientId, devisId, facture.numero, dateEcheance, facture.statut, facture.objet, facture.totalHT, facture.totalTVA, facture.totalTTC, facture.montantPaye]);
    }
    console.log(`✅ ${facturesData.length} factures créées`);
    
    // ============================================================================
    // CHANTIERS (4 chantiers)
    // ============================================================================
    const chantiersData = [
      { clientIdx: 0, reference: 'CHT-2026-001', nom: 'Rénovation appartement Champs-Élysées', description: 'Rénovation complète plomberie et sanitaires', adresse: '25 Avenue des Champs-Élysées', codePostal: '75008', ville: 'Paris', budgetPrevisionnel: '15000.00', statut: 'en_cours', avancement: 45, priorite: 'haute' },
      { clientIdx: 2, reference: 'CHT-2026-002', nom: 'Installation restaurant Haussmann', description: 'Installation cuisine professionnelle complète', adresse: '8 Boulevard Haussmann', codePostal: '75009', ville: 'Paris', budgetPrevisionnel: '25000.00', statut: 'en_cours', avancement: 70, priorite: 'urgente' },
      { clientIdx: 4, reference: 'CHT-2026-003', nom: 'Mise aux normes copropriété', description: 'Remplacement colonnes montantes immeuble', adresse: '3 Place de la République', codePostal: '75003', ville: 'Paris', budgetPrevisionnel: '45000.00', statut: 'planifie', avancement: 10, priorite: 'normale' },
      { clientIdx: 9, reference: 'CHT-2026-004', nom: 'Aménagement loft Belleville', description: 'Création salle de bain et cuisine', adresse: '34 Rue de Belleville', codePostal: '75020', ville: 'Paris', budgetPrevisionnel: '12000.00', statut: 'en_cours', avancement: 30, priorite: 'normale' }
    ];
    
    for (const chantier of chantiersData) {
      const clientId = clients[chantier.clientIdx].id;
      const dateDebut = new Date(now);
      dateDebut.setDate(dateDebut.getDate() - 15);
      const dateFinPrevue = new Date(now);
      dateFinPrevue.setDate(dateFinPrevue.getDate() + 45);
      
      await connection.execute(`
        INSERT INTO chantiers (artisanId, clientId, reference, nom, description, adresse, codePostal, ville, dateDebut, dateFinPrevue, budgetPrevisionnel, statut, avancement, priorite)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [artisanId, clientId, chantier.reference, chantier.nom, chantier.description, chantier.adresse, chantier.codePostal, chantier.ville, dateDebut.toISOString().split('T')[0], dateFinPrevue.toISOString().split('T')[0], chantier.budgetPrevisionnel, chantier.statut, chantier.avancement, chantier.priorite]);
    }
    console.log(`✅ ${chantiersData.length} chantiers créés`);
    
    // Récupérer les IDs des chantiers
    const [chantiers] = await connection.execute('SELECT id, nom FROM chantiers WHERE artisanId = ?', [artisanId]);
    
    // ============================================================================
    // INTERVENTIONS (12 interventions)
    // ============================================================================
    const interventionsData = [
      { clientIdx: 0, techIdx: 0, titre: 'Démolition ancienne salle de bain', statut: 'terminee', daysOffset: -10 },
      { clientIdx: 0, techIdx: 1, titre: 'Installation nouvelle tuyauterie', statut: 'terminee', daysOffset: -7 },
      { clientIdx: 0, techIdx: 2, titre: 'Pose sanitaires neufs', statut: 'en_cours', daysOffset: 0 },
      { clientIdx: 2, techIdx: 0, titre: 'Installation éviers professionnels', statut: 'terminee', daysOffset: -5 },
      { clientIdx: 2, techIdx: 3, titre: 'Raccordement gaz cuisine', statut: 'en_cours', daysOffset: 1 },
      { clientIdx: 2, techIdx: 1, titre: 'Test et mise en service', statut: 'planifiee', daysOffset: 5 },
      { clientIdx: 4, techIdx: 4, titre: 'Diagnostic colonnes montantes', statut: 'planifiee', daysOffset: 7 },
      { clientIdx: 9, techIdx: 2, titre: 'Création arrivée eau salle de bain', statut: 'en_cours', daysOffset: 2 },
      { clientIdx: 9, techIdx: 0, titre: 'Installation douche italienne', statut: 'planifiee', daysOffset: 8 },
      { clientIdx: 1, techIdx: 3, titre: 'Remplacement chauffe-eau', statut: 'planifiee', daysOffset: 3 },
      { clientIdx: 3, techIdx: 4, titre: 'Réparation fuite urgente', statut: 'terminee', daysOffset: -2 },
      { clientIdx: 7, techIdx: 1, titre: 'Entretien annuel chauffage', statut: 'planifiee', daysOffset: 10 }
    ];
    
    for (const intervention of interventionsData) {
      const clientId = clients[intervention.clientIdx].id;
      const technicienId = techniciens[intervention.techIdx].id;
      const dateDebut = new Date(now);
      dateDebut.setDate(dateDebut.getDate() + intervention.daysOffset);
      const dateFin = new Date(dateDebut);
      dateFin.setHours(dateFin.getHours() + 4);
      
      const adresse = clientsData[intervention.clientIdx].adresse + ', ' + clientsData[intervention.clientIdx].codePostal + ' ' + clientsData[intervention.clientIdx].ville;
      
      await connection.execute(`
        INSERT INTO interventions (artisanId, clientId, titre, description, dateDebut, dateFin, statut, adresse, technicienId)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [artisanId, clientId, intervention.titre, 'Intervention planifiée', dateDebut, dateFin, intervention.statut, adresse, technicienId]);
    }
    console.log(`✅ ${interventionsData.length} interventions créées`);
    
    // ============================================================================
    // CONTRATS MAINTENANCE (3 contrats)
    // ============================================================================
    const contratsData = [
      { clientIdx: 0, reference: 'CTR-2026-001', titre: 'Contrat entretien annuel chauffage', montantHT: '180.00', periodicite: 'annuel' },
      { clientIdx: 2, reference: 'CTR-2026-002', titre: 'Maintenance équipements cuisine', montantHT: '350.00', periodicite: 'trimestriel' },
      { clientIdx: 4, reference: 'CTR-2026-003', titre: 'Entretien colonnes copropriété', montantHT: '1200.00', periodicite: 'semestriel' }
    ];
    
    for (const contrat of contratsData) {
      const clientId = clients[contrat.clientIdx].id;
      const dateDebut = new Date(now);
      dateDebut.setMonth(dateDebut.getMonth() - 2);
      const prochainFacturation = new Date(now);
      prochainFacturation.setMonth(prochainFacturation.getMonth() + 1);
      
      await connection.execute(`
        INSERT INTO contrats_maintenance (artisanId, clientId, reference, titre, description, montantHT, periodicite, dateDebut, prochainFacturation, statut)
        VALUES (?, ?, ?, ?, 'Contrat de maintenance préventive', ?, ?, ?, ?, 'actif')
      `, [artisanId, clientId, contrat.reference, contrat.titre, contrat.montantHT, contrat.periodicite, dateDebut, prochainFacturation]);
    }
    console.log(`✅ ${contratsData.length} contrats de maintenance créés`);
    
    // ============================================================================
    // FOURNISSEURS (4 fournisseurs)
    // ============================================================================
    const fournisseursData = [
      { nom: 'Cedeo', contact: 'Service commercial', email: 'pro@cedeo.fr', telephone: '01 40 50 60 70', adresse: '15 Zone Industrielle', codePostal: '93100', ville: 'Montreuil' },
      { nom: 'Point P', contact: 'Marc Dubois', email: 'contact@pointp.fr', telephone: '01 41 51 61 71', adresse: '25 Avenue des Matériaux', codePostal: '94200', ville: 'Ivry-sur-Seine' },
      { nom: 'Brossette', contact: 'Service pro', email: 'pro@brossette.fr', telephone: '01 42 52 62 72', adresse: '8 Rue du Commerce', codePostal: '92100', ville: 'Boulogne' },
      { nom: 'Thermador', contact: 'Anne Martin', email: 'anne.martin@thermador.fr', telephone: '01 43 53 63 73', adresse: '45 Boulevard Industriel', codePostal: '95100', ville: 'Argenteuil' }
    ];
    
    for (const fournisseur of fournisseursData) {
      await connection.execute(`
        INSERT INTO fournisseurs (artisanId, nom, contact, email, telephone, adresse, codePostal, ville)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [artisanId, fournisseur.nom, fournisseur.contact, fournisseur.email, fournisseur.telephone, fournisseur.adresse, fournisseur.codePostal, fournisseur.ville]);
    }
    console.log(`✅ ${fournisseursData.length} fournisseurs créés`);
    
    // ============================================================================
    // NOTIFICATIONS (5 notifications)
    // ============================================================================
    const notificationsData = [
      { type: 'info', titre: 'Bienvenue sur Artisan MVP', message: 'Votre compte a été créé avec succès. Explorez les fonctionnalités !' },
      { type: 'rappel', titre: 'Devis en attente de signature', message: 'Le devis DEV-2026-002 attend la signature du client depuis 5 jours.' },
      { type: 'alerte', titre: 'Facture en retard', message: 'La facture FAC-2026-004 est en retard de paiement.' },
      { type: 'succes', titre: 'Paiement reçu', message: 'Le paiement de 4200€ pour la facture FAC-2026-001 a été reçu.' },
      { type: 'info', titre: 'Nouvelle intervention planifiée', message: 'Une intervention a été planifiée pour demain chez M. Martin.' }
    ];
    
    for (const notif of notificationsData) {
      await connection.execute(`
        INSERT INTO notifications (artisanId, type, titre, message, lu)
        VALUES (?, ?, ?, ?, false)
      `, [artisanId, notif.type, notif.titre, notif.message]);
    }
    console.log(`✅ ${notificationsData.length} notifications créées`);
    
    console.log('');
    console.log('🎉 Données de test insérées avec succès !');
    console.log('');
    console.log('📊 Résumé:');
    console.log('   - 1 artisan (Plomberie Martin & Fils)');
    console.log('   - 10 clients');
    console.log('   - 5 techniciens');
    console.log('   - 15 articles');
    console.log('   - 8 devis');
    console.log('   - 5 factures');
    console.log('   - 4 chantiers');
    console.log('   - 12 interventions');
    console.log('   - 3 contrats de maintenance');
    console.log('   - 4 fournisseurs');
    console.log('   - 5 notifications');
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    throw error;
  } finally {
    await connection.end();
  }
}

seed().catch(console.error);
