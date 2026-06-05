#!/usr/bin/env node

/**
 * Test Data Creation Script v2
 * Creates 3 clients, 2 devis per client, 3 factures per client, 2 interventions per client
 * Using proper tRPC query format
 */

const BASE_URL = 'http://localhost:3000';
const API_URL = `${BASE_URL}/api/trpc`;

// Test data
const clients = [
  {
    nom: "SARL Plomberie Martin",
    email: "contact@plomberie-martin.fr",
    telephone: "0612345678",
    adresse: "123 Rue de la Paix",
    codePostal: "75001",
    ville: "Paris",
    siret: "12345678901234"
  },
  {
    nom: "Électricité Dupont EIRL",
    email: "info@electricite-dupont.fr",
    telephone: "0698765432",
    adresse: "456 Avenue du Commerce",
    codePostal: "69000",
    ville: "Lyon",
    siret: "98765432109876"
  },
  {
    nom: "Chauffage Thermique Solutions",
    email: "devis@chauffage-thermique.fr",
    telephone: "0655443322",
    adresse: "789 Boulevard de l'Industrie",
    codePostal: "13000",
    ville: "Marseille",
    siret: "55555555555555"
  }
];

// Results tracking
const results = {
  clients: [],
  devis: [],
  factures: [],
  interventions: [],
  errors: []
};

// Helper function to make tRPC API calls
async function callTRPC(procedure, input = null) {
  try {
    let url = `${API_URL}/${procedure}`;
    
    // For queries, add input as query params
    if (input && !procedure.includes('create') && !procedure.includes('update') && !procedure.includes('delete')) {
      url += `?input=${encodeURIComponent(JSON.stringify(input))}`;
    }
    
    const options = {
      method: input && (procedure.includes('create') || procedure.includes('update') || procedure.includes('delete')) ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    };
    
    if (input && (procedure.includes('create') || procedure.includes('update') || procedure.includes('delete'))) {
      options.body = JSON.stringify(input);
    }
    
    const response = await fetch(url, options);
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
  
  for (const clientData of clients) {
    try {
      const result = await callTRPC('clients.create', clientData);
      
      if (result.ok || result.data?.result?.data?.id) {
        const clientId = result.data?.result?.data?.id;
        results.clients.push({
          ...clientData,
          id: clientId
        });
        console.log(`✅ Client créé: ${clientData.nom} (ID: ${clientId})`);
      } else {
        console.log(`⚠️  Erreur création client: ${clientData.nom}`);
        console.log(`    Réponse: ${JSON.stringify(result.data)}`);
        results.errors.push(`Client ${clientData.nom}: ${JSON.stringify(result.data)}`);
      }
    } catch (error) {
      console.log(`❌ Erreur: ${error.message}`);
      results.errors.push(`Client ${clientData.nom}: ${error.message}`);
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
        
        const result = await callTRPC('devis.create', devisData);
        
        if (result.ok || result.data?.result?.data?.id) {
          const devisId = result.data?.result?.data?.id;
          results.devis.push({
            ...devisData,
            id: devisId,
            clientName: client.nom
          });
          console.log(`✅ Devis ${i} créé pour ${client.nom} (ID: ${devisId})`);
        } else {
          console.log(`⚠️  Erreur création devis ${i} pour ${client.nom}`);
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
        
        const result = await callTRPC('factures.create', factureData);
        
        if (result.ok || result.data?.result?.data?.id) {
          const factureId = result.data?.result?.data?.id;
          results.factures.push({
            ...factureData,
            id: factureId,
            clientName: client.nom
          });
          console.log(`✅ Facture ${i} créée pour ${client.nom} (ID: ${factureId})`);
        } else {
          console.log(`⚠️  Erreur création facture ${i} pour ${client.nom}`);
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
          titre: `Intervention ${i} - ${client.nom}`,
          description: `Description de l'intervention ${i}`,
          dateIntervention: new Date(Date.now() + (i * 7 * 24 * 60 * 60 * 1000)).toISOString(),
          statut: 'planifiée',
          adresse: client.adresse,
          ville: client.ville,
          codePostal: client.codePostal
        };
        
        const result = await callTRPC('interventions.create', interventionData);
        
        if (result.ok || result.data?.result?.data?.id) {
          const interventionId = result.data?.result?.data?.id;
          results.interventions.push({
            ...interventionData,
            id: interventionId,
            clientName: client.nom
          });
          console.log(`✅ Intervention ${i} créée pour ${client.nom} (ID: ${interventionId})`);
        } else {
          console.log(`⚠️  Erreur création intervention ${i} pour ${client.nom}`);
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
    results.errors.slice(0, 5).forEach(err => {
      console.log(`  - ${err}`);
    });
  }
  
  console.log('\n=====================================\n');
  
  // Print detailed results
  console.log('📋 DÉTAILS DES DONNÉES CRÉÉES\n');
  console.log('CLIENTS:');
  results.clients.forEach(c => {
    console.log(`  - ${c.nom} (${c.email}) - ID: ${c.id}`);
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
    console.log(`  - ${i.titre}`);
  });
  
  console.log('\n=====================================\n');
}

// Run the tests
runAllTests().catch(error => {
  console.error('Test script error:', error);
  process.exit(1);
});
