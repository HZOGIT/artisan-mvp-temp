import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;

async function seedElectricien() {
  const connection = await mysql.createConnection(DATABASE_URL);
  
  console.log('⚡ Insertion des données pour l\'artisan électricien...');
  
  try {
    // Créer un nouvel utilisateur pour l'électricien
    await connection.execute(`
      INSERT INTO users (openId, name, email, loginMethod, role)
      VALUES ('electricien-demo-001', 'Électricité Duval', 'contact@electricite-duval.fr', 'demo', 'user')
    `);
    
    const [users] = await connection.execute('SELECT id FROM users WHERE openId = ?', ['electricien-demo-001']);
    const userId = users[0].id;
    console.log(`✅ Utilisateur électricien créé: ID ${userId}`);
    
    // Créer l'artisan électricien
    await connection.execute(`
      INSERT INTO artisans (userId, siret, nomEntreprise, adresse, codePostal, ville, telephone, email, specialite, tauxTVA)
      VALUES (?, '98765432109876', 'Électricité Duval SARL', '42 Rue Ampère', '69003', 'Lyon', '04 72 34 56 78', 'contact@electricite-duval.fr', 'electricite', '20.00')
    `, [userId]);
    
    const [artisans] = await connection.execute('SELECT id FROM artisans WHERE userId = ?', [userId]);
    const artisanId = artisans[0].id;
    console.log(`✅ Artisan électricien créé: ID ${artisanId}`);
    
    // Créer les paramètres artisan
    await connection.execute(`
      INSERT INTO parametres_artisan (artisanId, prefixeDevis, prefixeFacture, compteurDevis, compteurFacture, mentionsLegales)
      VALUES (?, 'EL-DEV', 'EL-FAC', 1, 1, 'Garantie décennale - Assurance RC Pro')
    `, [artisanId]);
    
    // ============================================================================
    // CLIENTS ÉLECTRICIEN (8 clients)
    // ============================================================================
    const clientsData = [
      { nom: 'Rousseau', prenom: 'Alain', email: 'alain.rousseau@email.fr', telephone: '06 11 22 33 44', adresse: '15 Rue de la Part-Dieu', codePostal: '69003', ville: 'Lyon', notes: 'Appartement T4 - Rénovation complète' },
      { nom: 'Blanc', prenom: 'Christine', email: 'christine.blanc@gmail.com', telephone: '06 22 33 44 55', adresse: '8 Avenue Jean Jaurès', codePostal: '69007', ville: 'Lyon', notes: 'Maison individuelle' },
      { nom: 'Garnier', prenom: 'Patrick', email: 'p.garnier@entreprise.fr', telephone: '06 33 44 55 66', adresse: '25 Cours Lafayette', codePostal: '69006', ville: 'Lyon', notes: 'Bureaux entreprise' },
      { nom: 'Fournier', prenom: 'Sylvie', email: 'sylvie.fournier@outlook.fr', telephone: '06 44 55 66 77', adresse: '12 Place Bellecour', codePostal: '69002', ville: 'Lyon', notes: 'Commerce centre-ville' },
      { nom: 'Morel', prenom: 'Jacques', email: 'jacques.morel@free.fr', telephone: '06 55 66 77 88', adresse: '56 Rue de la République', codePostal: '69001', ville: 'Lyon', notes: 'Immeuble ancien - Mise aux normes' },
      { nom: 'Lambert', prenom: 'Véronique', email: 'veronique.lambert@wanadoo.fr', telephone: '06 66 77 88 99', adresse: '3 Quai Claude Bernard', codePostal: '69007', ville: 'Lyon', notes: 'Loft bord de Rhône' },
      { nom: 'Roux', prenom: 'Olivier', email: 'o.roux@societe.com', telephone: '06 77 88 99 00', adresse: '78 Boulevard des Belges', codePostal: '69006', ville: 'Lyon', notes: 'Villa avec piscine' },
      { nom: 'Vincent', prenom: 'Martine', email: 'martine.vincent@orange.fr', telephone: '06 88 99 00 11', adresse: '45 Rue Garibaldi', codePostal: '69003', ville: 'Lyon', notes: 'Appartement neuf' }
    ];
    
    for (const client of clientsData) {
      await connection.execute(`
        INSERT INTO clients (artisanId, nom, prenom, email, telephone, adresse, codePostal, ville, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [artisanId, client.nom, client.prenom, client.email, client.telephone, client.adresse, client.codePostal, client.ville, client.notes]);
    }
    console.log(`✅ ${clientsData.length} clients créés`);
    
    const [clients] = await connection.execute('SELECT id, nom FROM clients WHERE artisanId = ?', [artisanId]);
    
    // ============================================================================
    // TECHNICIENS ÉLECTRICIEN (4 techniciens)
    // ============================================================================
    const techniciensData = [
      { nom: 'Perrin', prenom: 'Maxime', email: 'maxime.perrin@electricite-duval.fr', telephone: '06 10 20 30 40', specialite: 'Installation neuve', couleur: '#3b82f6' },
      { nom: 'Chevalier', prenom: 'Romain', email: 'romain.chevalier@electricite-duval.fr', telephone: '06 20 30 40 50', specialite: 'Dépannage', couleur: '#ef4444' },
      { nom: 'Marchand', prenom: 'Kevin', email: 'kevin.marchand@electricite-duval.fr', telephone: '06 30 40 50 60', specialite: 'Domotique', couleur: '#22c55e' },
      { nom: 'Renaud', prenom: 'Sébastien', email: 'sebastien.renaud@electricite-duval.fr', telephone: '06 40 50 60 70', specialite: 'Photovoltaïque', couleur: '#f59e0b' }
    ];
    
    for (const tech of techniciensData) {
      await connection.execute(`
        INSERT INTO techniciens (artisanId, nom, prenom, email, telephone, specialite, couleur, statut)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'actif')
      `, [artisanId, tech.nom, tech.prenom, tech.email, tech.telephone, tech.specialite, tech.couleur]);
    }
    console.log(`✅ ${techniciensData.length} techniciens créés`);
    
    const [techniciens] = await connection.execute('SELECT id, nom FROM techniciens WHERE artisanId = ?', [artisanId]);
    
    // ============================================================================
    // ARTICLES ÉLECTRICIEN (15 articles)
    // ============================================================================
    const articlesData = [
      { reference: 'EL-001', designation: 'Installation tableau électrique', description: 'Fourniture et pose tableau électrique complet', unite: 'unité', prixUnitaireHT: '850.00', categorie: 'Tableau' },
      { reference: 'EL-002', designation: 'Remplacement disjoncteur', description: 'Fourniture et pose disjoncteur différentiel', unite: 'unité', prixUnitaireHT: '120.00', categorie: 'Protection' },
      { reference: 'EL-003', designation: 'Installation prise électrique', description: 'Pose prise 16A avec terre', unite: 'unité', prixUnitaireHT: '65.00', categorie: 'Prises' },
      { reference: 'EL-004', designation: 'Installation interrupteur', description: 'Pose interrupteur simple allumage', unite: 'unité', prixUnitaireHT: '55.00', categorie: 'Interrupteurs' },
      { reference: 'EL-005', designation: 'Pose luminaire plafonnier', description: 'Installation luminaire avec raccordement', unite: 'unité', prixUnitaireHT: '75.00', categorie: 'Éclairage' },
      { reference: 'EL-006', designation: 'Installation spot encastré', description: 'Fourniture et pose spot LED', unite: 'unité', prixUnitaireHT: '45.00', categorie: 'Éclairage' },
      { reference: 'EL-007', designation: 'Tirage de câble', description: 'Passage câble électrique', unite: 'mètre', prixUnitaireHT: '15.00', categorie: 'Câblage' },
      { reference: 'EL-008', designation: 'Mise aux normes NF C 15-100', description: 'Mise en conformité installation', unite: 'forfait', prixUnitaireHT: '1500.00', categorie: 'Normes' },
      { reference: 'EL-009', designation: 'Installation borne recharge VE', description: 'Pose borne véhicule électrique 7kW', unite: 'unité', prixUnitaireHT: '1200.00', categorie: 'Mobilité' },
      { reference: 'EL-010', designation: 'Installation VMC', description: 'Pose VMC simple flux', unite: 'unité', prixUnitaireHT: '450.00', categorie: 'Ventilation' },
      { reference: 'EL-011', designation: 'Diagnostic électrique', description: 'Diagnostic complet installation', unite: 'intervention', prixUnitaireHT: '180.00', categorie: 'Diagnostic' },
      { reference: 'EL-012', designation: 'Dépannage électrique', description: 'Intervention dépannage urgence', unite: 'intervention', prixUnitaireHT: '95.00', categorie: 'Dépannage' },
      { reference: 'EL-013', designation: 'Installation panneau solaire', description: 'Pose panneau photovoltaïque 400W', unite: 'unité', prixUnitaireHT: '350.00', categorie: 'Solaire' },
      { reference: 'EL-014', designation: 'Main d\'œuvre horaire', description: 'Taux horaire électricien', unite: 'heure', prixUnitaireHT: '55.00', categorie: 'Main d\'œuvre' },
      { reference: 'EL-015', designation: 'Déplacement zone Lyon', description: 'Frais de déplacement Lyon métropole', unite: 'forfait', prixUnitaireHT: '35.00', categorie: 'Déplacement' }
    ];
    
    for (const article of articlesData) {
      await connection.execute(`
        INSERT INTO articles_artisan (artisanId, reference, designation, description, unite, prixUnitaireHT, categorie)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [artisanId, article.reference, article.designation, article.description, article.unite, article.prixUnitaireHT, article.categorie]);
    }
    console.log(`✅ ${articlesData.length} articles créés`);
    
    // ============================================================================
    // DEVIS ÉLECTRICIEN (6 devis)
    // ============================================================================
    const now = new Date();
    const devisData = [
      { clientIdx: 0, numero: 'EL-DEV-2026-001', statut: 'accepte', objet: 'Rénovation électrique complète appartement', totalHT: '4500.00', totalTVA: '900.00', totalTTC: '5400.00' },
      { clientIdx: 1, numero: 'EL-DEV-2026-002', statut: 'envoye', objet: 'Installation domotique maison', totalHT: '3200.00', totalTVA: '640.00', totalTTC: '3840.00' },
      { clientIdx: 2, numero: 'EL-DEV-2026-003', statut: 'accepte', objet: 'Mise aux normes bureaux', totalHT: '6800.00', totalTVA: '1360.00', totalTTC: '8160.00' },
      { clientIdx: 4, numero: 'EL-DEV-2026-004', statut: 'brouillon', objet: 'Rénovation tableau électrique immeuble', totalHT: '12500.00', totalTVA: '2500.00', totalTTC: '15000.00' },
      { clientIdx: 6, numero: 'EL-DEV-2026-005', statut: 'accepte', objet: 'Installation panneaux solaires villa', totalHT: '8900.00', totalTVA: '1780.00', totalTTC: '10680.00' },
      { clientIdx: 7, numero: 'EL-DEV-2026-006', statut: 'envoye', objet: 'Installation borne recharge VE', totalHT: '1450.00', totalTVA: '290.00', totalTTC: '1740.00' }
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
    
    const [devisList] = await connection.execute('SELECT id, numero FROM devis WHERE artisanId = ?', [artisanId]);
    
    // ============================================================================
    // FACTURES ÉLECTRICIEN (4 factures)
    // ============================================================================
    const facturesData = [
      { clientIdx: 0, devisIdx: 0, numero: 'EL-FAC-2026-001', statut: 'payee', objet: 'Rénovation électrique complète appartement', totalHT: '4500.00', totalTVA: '900.00', totalTTC: '5400.00', montantPaye: '5400.00' },
      { clientIdx: 2, devisIdx: 2, numero: 'EL-FAC-2026-002', statut: 'envoyee', objet: 'Mise aux normes bureaux', totalHT: '6800.00', totalTVA: '1360.00', totalTTC: '8160.00', montantPaye: '4000.00' },
      { clientIdx: 6, devisIdx: 4, numero: 'EL-FAC-2026-003', statut: 'envoyee', objet: 'Installation panneaux solaires villa', totalHT: '8900.00', totalTVA: '1780.00', totalTTC: '10680.00', montantPaye: '0.00' },
      { clientIdx: 3, devisIdx: null, numero: 'EL-FAC-2026-004', statut: 'payee', objet: 'Dépannage urgent commerce', totalHT: '220.00', totalTVA: '44.00', totalTTC: '264.00', montantPaye: '264.00' }
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
    // CHANTIERS ÉLECTRICIEN (3 chantiers)
    // ============================================================================
    const chantiersData = [
      { clientIdx: 0, reference: 'EL-CHT-2026-001', nom: 'Rénovation appartement Part-Dieu', description: 'Rénovation électrique complète T4', adresse: '15 Rue de la Part-Dieu', codePostal: '69003', ville: 'Lyon', budgetPrevisionnel: '5500.00', statut: 'en_cours', avancement: 60, priorite: 'haute' },
      { clientIdx: 2, reference: 'EL-CHT-2026-002', nom: 'Mise aux normes bureaux Lafayette', description: 'Mise en conformité NF C 15-100', adresse: '25 Cours Lafayette', codePostal: '69006', ville: 'Lyon', budgetPrevisionnel: '8500.00', statut: 'en_cours', avancement: 35, priorite: 'normale' },
      { clientIdx: 6, reference: 'EL-CHT-2026-003', nom: 'Installation solaire villa Belges', description: 'Installation 12 panneaux photovoltaïques', adresse: '78 Boulevard des Belges', codePostal: '69006', ville: 'Lyon', budgetPrevisionnel: '12000.00', statut: 'planifie', avancement: 5, priorite: 'normale' }
    ];
    
    for (const chantier of chantiersData) {
      const clientId = clients[chantier.clientIdx].id;
      const dateDebut = new Date(now);
      dateDebut.setDate(dateDebut.getDate() - 10);
      const dateFinPrevue = new Date(now);
      dateFinPrevue.setDate(dateFinPrevue.getDate() + 30);
      
      await connection.execute(`
        INSERT INTO chantiers (artisanId, clientId, reference, nom, description, adresse, codePostal, ville, dateDebut, dateFinPrevue, budgetPrevisionnel, statut, avancement, priorite)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [artisanId, clientId, chantier.reference, chantier.nom, chantier.description, chantier.adresse, chantier.codePostal, chantier.ville, dateDebut.toISOString().split('T')[0], dateFinPrevue.toISOString().split('T')[0], chantier.budgetPrevisionnel, chantier.statut, chantier.avancement, chantier.priorite]);
    }
    console.log(`✅ ${chantiersData.length} chantiers créés`);
    
    // ============================================================================
    // INTERVENTIONS ÉLECTRICIEN (10 interventions)
    // ============================================================================
    const interventionsData = [
      { clientIdx: 0, techIdx: 0, titre: 'Dépose ancien tableau électrique', statut: 'terminee', daysOffset: -8 },
      { clientIdx: 0, techIdx: 0, titre: 'Installation nouveau tableau', statut: 'terminee', daysOffset: -5 },
      { clientIdx: 0, techIdx: 1, titre: 'Tirage câbles et pose prises', statut: 'en_cours', daysOffset: 0 },
      { clientIdx: 2, techIdx: 2, titre: 'Diagnostic installation existante', statut: 'terminee', daysOffset: -3 },
      { clientIdx: 2, techIdx: 0, titre: 'Remplacement disjoncteurs', statut: 'planifiee', daysOffset: 2 },
      { clientIdx: 6, techIdx: 3, titre: 'Étude implantation panneaux', statut: 'terminee', daysOffset: -1 },
      { clientIdx: 6, techIdx: 3, titre: 'Installation structure support', statut: 'planifiee', daysOffset: 5 },
      { clientIdx: 1, techIdx: 2, titre: 'Installation domotique salon', statut: 'planifiee', daysOffset: 4 },
      { clientIdx: 7, techIdx: 1, titre: 'Installation borne recharge', statut: 'planifiee', daysOffset: 6 },
      { clientIdx: 3, techIdx: 1, titre: 'Dépannage panne électrique', statut: 'terminee', daysOffset: -2 }
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
      `, [artisanId, clientId, intervention.titre, 'Intervention électricité', dateDebut, dateFin, intervention.statut, adresse, technicienId]);
    }
    console.log(`✅ ${interventionsData.length} interventions créées`);
    
    // ============================================================================
    // CONTRATS MAINTENANCE ÉLECTRICIEN (2 contrats)
    // ============================================================================
    const contratsData = [
      { clientIdx: 2, reference: 'EL-CTR-2026-001', titre: 'Maintenance électrique bureaux', montantHT: '450.00', periodicite: 'semestriel' },
      { clientIdx: 6, reference: 'EL-CTR-2026-002', titre: 'Entretien installation solaire', montantHT: '280.00', periodicite: 'annuel' }
    ];
    
    for (const contrat of contratsData) {
      const clientId = clients[contrat.clientIdx].id;
      const dateDebut = new Date(now);
      dateDebut.setMonth(dateDebut.getMonth() - 1);
      const prochainFacturation = new Date(now);
      prochainFacturation.setMonth(prochainFacturation.getMonth() + 2);
      
      await connection.execute(`
        INSERT INTO contrats_maintenance (artisanId, clientId, reference, titre, description, montantHT, periodicite, dateDebut, prochainFacturation, statut)
        VALUES (?, ?, ?, ?, 'Contrat de maintenance préventive', ?, ?, ?, ?, 'actif')
      `, [artisanId, clientId, contrat.reference, contrat.titre, contrat.montantHT, contrat.periodicite, dateDebut, prochainFacturation]);
    }
    console.log(`✅ ${contratsData.length} contrats de maintenance créés`);
    
    // ============================================================================
    // FOURNISSEURS ÉLECTRICIEN (3 fournisseurs)
    // ============================================================================
    const fournisseursData = [
      { nom: 'Rexel', contact: 'Service pro Lyon', email: 'lyon@rexel.fr', telephone: '04 72 10 20 30', adresse: '10 Zone Industrielle Est', codePostal: '69800', ville: 'Saint-Priest' },
      { nom: 'Sonepar', contact: 'Jean-Marc Dupuis', email: 'jm.dupuis@sonepar.fr', telephone: '04 72 20 30 40', adresse: '25 Avenue des Entreprises', codePostal: '69100', ville: 'Villeurbanne' },
      { nom: 'Legrand', contact: 'Service commercial', email: 'pro@legrand.fr', telephone: '04 72 30 40 50', adresse: '5 Rue de l\'Innovation', codePostal: '69007', ville: 'Lyon' }
    ];
    
    for (const fournisseur of fournisseursData) {
      await connection.execute(`
        INSERT INTO fournisseurs (artisanId, nom, contact, email, telephone, adresse, codePostal, ville)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [artisanId, fournisseur.nom, fournisseur.contact, fournisseur.email, fournisseur.telephone, fournisseur.adresse, fournisseur.codePostal, fournisseur.ville]);
    }
    console.log(`✅ ${fournisseursData.length} fournisseurs créés`);
    
    // ============================================================================
    // NOTIFICATIONS ÉLECTRICIEN
    // ============================================================================
    const notificationsData = [
      { type: 'info', titre: 'Bienvenue chez Électricité Duval', message: 'Votre espace professionnel est prêt !' },
      { type: 'rappel', titre: 'Devis en attente', message: 'Le devis EL-DEV-2026-002 attend la réponse du client.' },
      { type: 'succes', titre: 'Paiement reçu', message: 'Le paiement de 5400€ pour la facture EL-FAC-2026-001 a été reçu.' }
    ];
    
    for (const notif of notificationsData) {
      await connection.execute(`
        INSERT INTO notifications (artisanId, type, titre, message, lu)
        VALUES (?, ?, ?, ?, false)
      `, [artisanId, notif.type, notif.titre, notif.message]);
    }
    console.log(`✅ ${notificationsData.length} notifications créées`);
    
    console.log('');
    console.log('⚡ Données électricien insérées avec succès !');
    console.log('');
    console.log('📊 Résumé:');
    console.log('   - 1 artisan (Électricité Duval SARL - Lyon)');
    console.log('   - 8 clients');
    console.log('   - 4 techniciens');
    console.log('   - 15 articles');
    console.log('   - 6 devis');
    console.log('   - 4 factures');
    console.log('   - 3 chantiers');
    console.log('   - 10 interventions');
    console.log('   - 2 contrats de maintenance');
    console.log('   - 3 fournisseurs');
    console.log('   - 3 notifications');
    console.log('');
    console.log('🔑 Pour accéder à ce profil:');
    console.log('   OpenID: electricien-demo-001');
    console.log('   Email: contact@electricite-duval.fr');
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    throw error;
  } finally {
    await connection.end();
  }
}

seedElectricien().catch(console.error);
