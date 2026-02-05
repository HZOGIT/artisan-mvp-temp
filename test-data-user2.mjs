#!/usr/bin/env node

/**
 * Test Data Creation Script for User 2 (zouiten@biopp.fr)
 * Direct database insertion to bypass authentication issues
 * Creates 3 clients, 2 devis per client, 3 factures per client, 2 interventions per client
 */

import mysql from 'mysql2/promise';

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'artisan_mvp',
};

const EMAIL = 'zouiten@biopp.fr';

// Test data
const clients = [
  {
    nom: "Plomberie Express",
    email: "contact@plomberie-express.fr",
    telephone: "0612345678",
    adresse: "10 Rue de la République",
    codePostal: "75002",
    ville: "Paris",
    siret: "11111111111111"
  },
  {
    nom: "Électricité Pro Services",
    email: "info@electricite-pro.fr",
    telephone: "0698765432",
    adresse: "50 Avenue Montaigne",
    codePostal: "75008",
    ville: "Paris",
    siret: "22222222222222"
  },
  {
    nom: "Chauffage & Climatisation",
    email: "devis@chauffage-clim.fr",
    telephone: "0655443322",
    adresse: "200 Boulevard Saint-Germain",
    codePostal: "75006",
    ville: "Paris",
    siret: "33333333333333"
  }
];

// Results tracking
const results = {
  userId: null,
  artisanId: null,
  clients: [],
  devis: [],
  factures: [],
  interventions: [],
  errors: []
};

async function getConnection() {
  return await mysql.createConnection(DB_CONFIG);
}

async function findUserByEmail(connection, email) {
  try {
    const [rows] = await connection.query('SELECT id FROM users WHERE email = ?', [email]);
    return rows.length > 0 ? rows[0].id : null;
  } catch (error) {
    console.error('Error finding user:', error);
    return null;
  }
}

async function findArtisanByUserId(connection, userId) {
  try {
    const [rows] = await connection.query('SELECT id FROM artisans WHERE userId = ?', [userId]);
    return rows.length > 0 ? rows[0].id : null;
  } catch (error) {
    console.error('Error finding artisan:', error);
    return null;
  }
}

async function createClient(connection, artisanId, clientData) {
  try {
    const [result] = await connection.query(
      'INSERT INTO clients (artisanId, nom, prenom, email, telephone, adresse, codePostal, ville, siret, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
      [artisanId, clientData.nom, null, clientData.email, clientData.telephone, clientData.adresse, clientData.codePostal, clientData.ville, clientData.siret]
    );
    return result.insertId;
  } catch (error) {
    console.error('Error creating client:', error);
    return null;
  }
}

async function createDevis(connection, artisanId, clientId, index) {
  try {
    const montantHT = 1000 + (index * 500);
    const montantTVA = montantHT * 0.20;
    const montantTTC = montantHT * 1.20;
    
    const [result] = await connection.query(
      'INSERT INTO devis (artisanId, clientId, numero, dateCreation, montantHT, montantTVA, montantTTC, statut, createdAt, updatedAt) VALUES (?, ?, ?, NOW(), ?, ?, ?, ?, NOW(), NOW())',
      [artisanId, clientId, `DEV-${Date.now()}-${index}`, montantHT, montantTVA, montantTTC, 'brouillon']
    );
    return result.insertId;
  } catch (error) {
    console.error('Error creating devis:', error);
    return null;
  }
}

async function createFacture(connection, artisanId, clientId, index) {
  try {
    const montantHT = 800 + (index * 400);
    const montantTVA = montantHT * 0.20;
    const montantTTC = montantHT * 1.20;
    
    const [result] = await connection.query(
      'INSERT INTO factures (artisanId, clientId, numero, dateCreation, dateEcheance, montantHT, montantTVA, montantTTC, statut, createdAt, updatedAt) VALUES (?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 30 DAY), ?, ?, ?, ?, NOW(), NOW())',
      [artisanId, clientId, `FAC-${Date.now()}-${index}`, montantHT, montantTVA, montantTTC, 'brouillon']
    );
    return result.insertId;
  } catch (error) {
    console.error('Error creating facture:', error);
    return null;
  }
}

async function createIntervention(connection, artisanId, clientId, clientData, index) {
  try {
    const dateIntervention = new Date(Date.now() + (index * 7 * 24 * 60 * 60 * 1000));
    
    const [result] = await connection.query(
      'INSERT INTO interventions (artisanId, clientId, titre, description, dateIntervention, statut, adresse, ville, codePostal, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
      [artisanId, clientId, `Intervention ${index} - ${clientData.nom}`, `Description de l'intervention ${index}`, dateIntervention, 'planifiée', clientData.adresse, clientData.ville, clientData.codePostal]
    );
    return result.insertId;
  } catch (error) {
    console.error('Error creating intervention:', error);
    return null;
  }
}

async function runTests() {
  console.log('🧪 CRÉATION DE DONNÉES DE TEST - USER 2 (zouiten@biopp.fr)\n');
  console.log('=====================================\n');
  
  const connection = await getConnection();
  
  try {
    // Find user
    console.log('🔍 Recherche de l\'utilisateur...\n');
    results.userId = await findUserByEmail(connection, EMAIL);
    
    if (!results.userId) {
      console.log(`❌ Utilisateur ${EMAIL} non trouvé`);
      process.exit(1);
    }
    console.log(`✅ Utilisateur trouvé (ID: ${results.userId})`);
    
    // Find or create artisan
    console.log('\n🔍 Recherche du profil artisan...\n');
    results.artisanId = await findArtisanByUserId(connection, results.userId);
    
    if (!results.artisanId) {
      console.log(`❌ Profil artisan non trouvé pour l'utilisateur`);
      process.exit(1);
    }
    console.log(`✅ Profil artisan trouvé (ID: ${results.artisanId})`);
    
    // Create clients
    console.log('\n📋 CRÉATION DES CLIENTS\n');
    for (const clientData of clients) {
      const clientId = await createClient(connection, results.artisanId, clientData);
      if (clientId) {
        results.clients.push({ ...clientData, id: clientId });
        console.log(`✅ Client créé: ${clientData.nom} (ID: ${clientId})`);
      } else {
        console.log(`❌ Erreur création client: ${clientData.nom}`);
        results.errors.push(`Client ${clientData.nom}`);
      }
    }
    
    // Create devis
    console.log('\n📋 CRÉATION DES DEVIS\n');
    for (const client of results.clients) {
      for (let i = 1; i <= 2; i++) {
        const devisId = await createDevis(connection, results.artisanId, client.id, i);
        if (devisId) {
          results.devis.push({ id: devisId, clientName: client.nom });
          console.log(`✅ Devis ${i} créé pour ${client.nom} (ID: ${devisId})`);
        } else {
          console.log(`❌ Erreur création devis ${i} pour ${client.nom}`);
        }
      }
    }
    
    // Create factures
    console.log('\n📋 CRÉATION DES FACTURES\n');
    for (const client of results.clients) {
      for (let i = 1; i <= 3; i++) {
        const factureId = await createFacture(connection, results.artisanId, client.id, i);
        if (factureId) {
          results.factures.push({ id: factureId, clientName: client.nom });
          console.log(`✅ Facture ${i} créée pour ${client.nom} (ID: ${factureId})`);
        } else {
          console.log(`❌ Erreur création facture ${i} pour ${client.nom}`);
        }
      }
    }
    
    // Create interventions
    console.log('\n📋 CRÉATION DES INTERVENTIONS\n');
    for (const client of results.clients) {
      for (let i = 1; i <= 2; i++) {
        const interventionId = await createIntervention(connection, results.artisanId, client.id, client, i);
        if (interventionId) {
          results.interventions.push({ id: interventionId, clientName: client.nom });
          console.log(`✅ Intervention ${i} créée pour ${client.nom} (ID: ${interventionId})`);
        } else {
          console.log(`❌ Erreur création intervention ${i} pour ${client.nom}`);
        }
      }
    }
    
    // Print summary
    console.log('\n=====================================');
    console.log('📊 RÉSUMÉ DE LA CRÉATION\n');
    console.log(`✅ Utilisateur: ${EMAIL}`);
    console.log(`✅ Clients créés: ${results.clients.length}/3`);
    console.log(`✅ Devis créés: ${results.devis.length}/6`);
    console.log(`✅ Factures créées: ${results.factures.length}/9`);
    console.log(`✅ Interventions créées: ${results.interventions.length}/6`);
    console.log(`📊 Total: ${results.clients.length + results.devis.length + results.factures.length + results.interventions.length} éléments créés`);
    
    if (results.errors.length > 0) {
      console.log(`\n⚠️  Erreurs: ${results.errors.length}`);
    }
    
    console.log('\n=====================================\n');
    
  } catch (error) {
    console.error('Error:', error);
    results.errors.push(error.message);
  } finally {
    await connection.end();
  }
}

runTests().catch(error => {
  console.error('Test script error:', error);
  process.exit(1);
});
