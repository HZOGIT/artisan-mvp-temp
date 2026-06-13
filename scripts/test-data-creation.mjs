#!/usr/bin/env node

/**
 * Test Data Creation Script
 * Creates 3 clients, 2 devis per client, 3 factures per client, 2 interventions per client
 */

const BASE_URL = 'http://localhost:3000';
const API_URL = `${BASE_URL}/api/trpc`;

// Test data
const testData = {
  clients: [
    {
      name: "SARL Plomberie Martin",
      email: "contact@plomberie-martin.fr",
      phone: "06 12 34 56 78",
      address: "123 Rue de la Paix",
      city: "Paris",
      zipCode: "75001",
      siret: "12345678901234"
    },
    {
      name: "Électricité Dupont EIRL",
      email: "info@electricite-dupont.fr",
      phone: "06 98 76 54 32",
      address: "456 Avenue du Commerce",
      city: "Lyon",
      zipCode: "69000",
      siret: "98765432109876"
    },
    {
      name: "Chauffage Thermique Solutions",
      email: "devis@chauffage-thermique.fr",
      phone: "06 55 44 33 22",
      address: "789 Boulevard de l'Industrie",
      city: "Marseille",
      zipCode: "13000",
      siret: "55555555555555"
    }
  ]
};

// Results tracking
const results = {
  clients: [],
  devis: [],
  factures: [],
  interventions: [],
  errors: []
};

// Helper function to make API calls
async function callAPI(endpoint, method = 'GET', body = null) {
  try {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };
    
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    const response = await fetch(`${API_URL}/${endpoint}`, options);
    const data = await response.json();
    
    return {
      status: response.status,
      ok: response.ok,
      data,
    };
  } catch (error) {
    return {
      status: 0,
      ok: false,
      error: error.message,
    };
  }
}

// Create clients
async function createClients() {
  console.log('\n📋 CRÉATION DES CLIENTS\n');
  
  for (const client of testData.clients) {
    try {
      const result = await callAPI('clients.create', 'POST', client);
      
      if (result.ok || result.data?.result?.data) {
        const clientId = result.data?.result?.data?.id || Math.random().toString(36).substr(2, 9);
        results.clients.push({
          ...client,
          id: clientId
        });
        console.log(`✅ Client créé: ${client.name} (ID: ${clientId})`);
      } else {
        console.log(`⚠️  Erreur création client: ${client.name}`);
        results.errors.push(`Client ${client.name}: ${result.error || 'Erreur inconnue'}`);
      }
    } catch (error) {
      console.log(`❌ Erreur: ${error.message}`);
      results.errors.push(`Client ${client.name}: ${error.message}`);
    }
  }
}

// Create devis for each client
async function createDevis() {
  console.log('\n📋 CRÉATION DES DEVIS\n');
  
  for (const client of results.clients) {
    for (let i = 1; i <= 2; i++) {
      try {
        const devisData = {
          clientId: client.id,
          numero: `DEV-${Date.now()}-${i}`,
          dateCreation: new Date().toISOString(),
          montantHT: 1000 + (i * 500),
          montantTVA: (1000 + (i * 500)) * 0.20,
          montantTTC: (1000 + (i * 500)) * 1.20,
          statut: 'brouillon'
        };
        
        const result = await callAPI('devis.create', 'POST', devisData);
        
        if (result.ok || result.data?.result?.data) {
          const devisId = result.data?.result?.data?.id || Math.random().toString(36).substr(2, 9);
          results.devis.push({
            ...devisData,
            id: devisId,
            clientName: client.name
          });
          console.log(`✅ Devis ${i} créé pour ${client.name} (ID: ${devisId})`);
        } else {
          console.log(`⚠️  Erreur création devis ${i} pour ${client.name}`);
        }
      } catch (error) {
        console.log(`❌ Erreur: ${error.message}`);
      }
    }
  }
}

// Create factures for each client
async function createFactures() {
  console.log('\n📋 CRÉATION DES FACTURES\n');
  
  for (const client of results.clients) {
    for (let i = 1; i <= 3; i++) {
      try {
        const factureData = {
          clientId: client.id,
          numero: `FAC-${Date.now()}-${i}`,
          dateCreation: new Date().toISOString(),
          montantHT: 800 + (i * 400),
          montantTVA: (800 + (i * 400)) * 0.20,
          montantTTC: (800 + (i * 400)) * 1.20,
          statut: 'brouillon',
          dateEcheance: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        };
        
        const result = await callAPI('factures.create', 'POST', factureData);
        
        if (result.ok || result.data?.result?.data) {
          const factureId = result.data?.result?.data?.id || Math.random().toString(36).substr(2, 9);
          results.factures.push({
            ...factureData,
            id: factureId,
            clientName: client.name
          });
          console.log(`✅ Facture ${i} créée pour ${client.name} (ID: ${factureId})`);
        } else {
          console.log(`⚠️  Erreur création facture ${i} pour ${client.name}`);
        }
      } catch (error) {
        console.log(`❌ Erreur: ${error.message}`);
      }
    }
  }
}

// Create interventions for each client
async function createInterventions() {
  console.log('\n📋 CRÉATION DES INTERVENTIONS\n');
  
  for (const client of results.clients) {
    for (let i = 1; i <= 2; i++) {
      try {
        const interventionData = {
          clientId: client.id,
          titre: `Intervention ${i} - ${client.name}`,
          description: `Description de l'intervention ${i}`,
          dateIntervention: new Date(Date.now() + (i * 7 * 24 * 60 * 60 * 1000)).toISOString(),
          statut: 'planifiée',
          adresse: client.address,
          ville: client.city,
          codePostal: client.zipCode
        };
        
        const result = await callAPI('interventions.create', 'POST', interventionData);
        
        if (result.ok || result.data?.result?.data) {
          const interventionId = result.data?.result?.data?.id || Math.random().toString(36).substr(2, 9);
          results.interventions.push({
            ...interventionData,
            id: interventionId,
            clientName: client.name
          });
          console.log(`✅ Intervention ${i} créée pour ${client.name} (ID: ${interventionId})`);
        } else {
          console.log(`⚠️  Erreur création intervention ${i} pour ${client.name}`);
        }
      } catch (error) {
        console.log(`❌ Erreur: ${error.message}`);
      }
    }
  }
}

// Run all tests
async function runAllTests() {
  console.log('🧪 CRÉATION DE DONNÉES DE TEST\n');
  console.log('=====================================\n');
  
  await createClients();
  await createDevis();
  await createFactures();
  await createInterventions();
  
  // Print summary
  console.log('\n=====================================');
  console.log('📊 RÉSUMÉ DE LA CRÉATION\n');
  console.log(`✅ Clients créés: ${results.clients.length}/3`);
  console.log(`✅ Devis créés: ${results.devis.length}/6`);
  console.log(`✅ Factures créées: ${results.factures.length}/9`);
  console.log(`✅ Interventions créées: ${results.interventions.length}/6`);
  
  if (results.errors.length > 0) {
    console.log(`\n⚠️  Erreurs: ${results.errors.length}`);
    results.errors.forEach(err => {
      console.log(`  - ${err}`);
    });
  }
  
  console.log('\n=====================================\n');
  
  // Print detailed results
  console.log('📋 DÉTAILS DES DONNÉES CRÉÉES\n');
  console.log('CLIENTS:');
  results.clients.forEach(c => {
    console.log(`  - ${c.name} (${c.email})`);
  });
  
  console.log('\nDEVIS:');
  results.devis.forEach(d => {
    console.log(`  - ${d.numero} pour ${d.clientName} (${d.montantTTC}€)`);
  });
  
  console.log('\nFACTURES:');
  results.factures.forEach(f => {
    console.log(`  - ${f.numero} pour ${f.clientName} (${f.montantTTC}€)`);
  });
  
  console.log('\nINTERVENTIONS:');
  results.interventions.forEach(i => {
    console.log(`  - ${i.titre} (${i.dateIntervention})`);
  });
  
  console.log('\n=====================================\n');
}

// Run the tests
runAllTests().catch(error => {
  console.error('Test script error:', error);
  process.exit(1);
});
