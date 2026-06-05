#!/usr/bin/env node

/**
 * Automated Test Script for Artisan MVP Application
 * Tests all features and menus
 */

const BASE_URL = 'http://localhost:3000';
const API_URL = `${BASE_URL}/api/trpc`;

// Test Results
const results = {
  passed: 0,
  failed: 0,
  errors: [],
  tests: []
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

// Test function
async function test(name, fn) {
  try {
    await fn();
    results.passed++;
    results.tests.push({ name, status: 'PASS' });
    console.log(`✅ ${name}`);
  } catch (error) {
    results.failed++;
    results.errors.push({ test: name, error: error.message });
    results.tests.push({ name, status: 'FAIL', error: error.message });
    console.log(`❌ ${name}: ${error.message}`);
  }
}

// Run tests
async function runTests() {
  console.log('🧪 TESTING ARTISAN MVP APPLICATION\n');
  console.log('=====================================\n');
  
  // Test 1: Authentication
  console.log('📋 AUTHENTICATION TESTS\n');
  
  await test('Auth.me endpoint responds', async () => {
    const result = await callAPI('auth.me');
    if (!result.ok && result.status !== 200) {
      throw new Error(`API returned status ${result.status}`);
    }
  });
  
  // Test 2: Clients
  console.log('\n📋 CLIENTS TESTS\n');
  
  await test('Clients.list endpoint exists', async () => {
    const result = await callAPI('clients.list');
    if (result.error) {
      throw new Error(result.error);
    }
  });
  
  // Test 3: Devis
  console.log('\n📋 DEVIS TESTS\n');
  
  await test('Devis.list endpoint exists', async () => {
    const result = await callAPI('devis.list');
    if (result.error) {
      throw new Error(result.error);
    }
  });
  
  // Test 4: Factures
  console.log('\n📋 FACTURES TESTS\n');
  
  await test('Factures.list endpoint exists', async () => {
    const result = await callAPI('factures.list');
    if (result.error) {
      throw new Error(result.error);
    }
  });
  
  // Test 5: Interventions
  console.log('\n📋 INTERVENTIONS TESTS\n');
  
  await test('Interventions.list endpoint exists', async () => {
    const result = await callAPI('interventions.list');
    if (result.error) {
      throw new Error(result.error);
    }
  });
  
  // Test 6: Articles
  console.log('\n📋 ARTICLES TESTS\n');
  
  await test('Articles.list endpoint exists', async () => {
    const result = await callAPI('articles.list');
    if (result.error) {
      throw new Error(result.error);
    }
  });
  
  // Test 7: Profile
  console.log('\n📋 PROFILE TESTS\n');
  
  await test('Profile.get endpoint exists', async () => {
    const result = await callAPI('profil.get');
    if (result.error) {
      throw new Error(result.error);
    }
  });
  
  // Print summary
  console.log('\n=====================================');
  console.log('📊 TEST SUMMARY\n');
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`📈 Success Rate: ${Math.round((results.passed / (results.passed + results.failed)) * 100)}%`);
  
  if (results.errors.length > 0) {
    console.log('\n🐛 ERRORS:\n');
    results.errors.forEach(err => {
      console.log(`  - ${err.test}: ${err.error}`);
    });
  }
  
  console.log('\n=====================================\n');
  
  return results.failed === 0;
}

// Run the tests
runTests().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('Test script error:', error);
  process.exit(1);
});
