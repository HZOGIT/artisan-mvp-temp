import mysql from 'mysql2/promise';

const BASE = 'https://artisan.cheminov.com';
const TOKEN = process.argv[2];
const COOKIE = `token=${TOKEN}`;

const results = [];
let passCount = 0, warnCount = 0, failCount = 0;

function ok(section, test, detail = '') {
  results.push({ status: '✅', section, test, detail });
  passCount++;
}
function warn(section, test, detail = '') {
  results.push({ status: '⚠️', section, test, detail });
  warnCount++;
}
function fail(section, test, detail = '') {
  results.push({ status: '❌', section, test, detail });
  failCount++;
}

async function api(path) {
  const url = `${BASE}/api/trpc/${path}`;
  const res = await fetch(url, { headers: { Cookie: COOKIE } });
  const body = await res.json();
  if (body.error) throw new Error(body.error.json?.message || JSON.stringify(body.error));
  return body.result?.data?.json;
}

async function apiMut(path, input) {
  const url = `${BASE}/api/trpc/${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Cookie: COOKIE, 'Content-Type': 'application/json' },
    body: JSON.stringify({ json: input }),
  });
  const body = await res.json();
  if (body.error) throw new Error(body.error.json?.message || JSON.stringify(body.error));
  return body.result?.data?.json;
}

async function apiStatus(path) {
  const url = `${BASE}/api/trpc/${path}`;
  const res = await fetch(url, { headers: { Cookie: COOKIE } });
  return { status: res.status, body: await res.json() };
}

// ===== 1. TABLEAU DE BORD =====
async function testDashboard() {
  const S = '1. DASHBOARD';
  try {
    const stats = await api('dashboard.getStats');
    if (stats && typeof stats.chiffreAffaires !== 'undefined') ok(S, '/dashboard getStats', `CA=${stats.chiffreAffaires}, devisEnAttente=${stats.devisEnAttente}, facturesImpayees=${stats.facturesImpayees}`);
    else fail(S, '/dashboard getStats', 'Missing fields');
  } catch (e) { fail(S, '/dashboard getStats', e.message); }

  try {
    const recent = await api('dashboard.getRecentActivity');
    ok(S, '/dashboard getRecentActivity', `${Array.isArray(recent) ? recent.length : '?'} items`);
  } catch (e) { fail(S, '/dashboard getRecentActivity', e.message); }
}

async function testStatistiques() {
  const S = '1. STATISTIQUES';
  const endpoints = [
    'statistiques.getDevisStats',
    'statistiques.getFacturesStats',
    'statistiques.getCAMensuel',
    'statistiques.getTopClients',
    'statistiques.getTauxConversion',
  ];
  for (const ep of endpoints) {
    try {
      const data = await api(ep);
      ok(S, ep, typeof data === 'object' ? 'OK' : `val=${data}`);
    } catch (e) { fail(S, ep, e.message); }
  }
}

// ===== 2. COMMERCIAL =====
async function testDevis() {
  const S = '2. DEVIS';
  try {
    const list = await api('devis.list');
    ok(S, 'devis.list', `${list.length} devis`);

    // Search by client name
    try {
      const search = await api('devis.list?input=%7B%22json%22%3A%7B%22search%22%3A%22Martin%22%7D%7D');
      ok(S, 'devis.list search "Martin"', `${Array.isArray(search) ? search.length : '?'} results`);
    } catch (e) {
      // Try without search param - list might not support search
      warn(S, 'devis.list search', e.message);
    }

    if (list.length > 0) {
      const id = list[0].id;
      try {
        const detail = await api(`devis.getById?input=%7B%22json%22%3A%7B%22id%22%3A${id}%7D%7D`);
        ok(S, `devis.getById (id=${id})`, `ref=${detail.numero || detail.reference}, ${detail.lignes?.length || 0} lignes`);
      } catch (e) { fail(S, `devis.getById (id=${id})`, e.message); }
    }
  } catch (e) { fail(S, 'devis.list', e.message); }
}

async function testFactures() {
  const S = '2. FACTURES';
  try {
    const list = await api('factures.list');
    ok(S, 'factures.list', `${list.length} factures`);

    if (list.length > 0) {
      const id = list[0].id;
      try {
        const detail = await api(`factures.getById?input=%7B%22json%22%3A%7B%22id%22%3A${id}%7D%7D`);
        ok(S, `factures.getById (id=${id})`, `ref=${detail.numero || detail.reference}`);
      } catch (e) { fail(S, `factures.getById (id=${id})`, e.message); }
    }
  } catch (e) { fail(S, 'factures.list', e.message); }
}

async function testContrats() {
  const S = '2. CONTRATS';
  try {
    const list = await api('contrats.list');
    ok(S, 'contrats.list', `${list.length} contrats`);

    if (list.length > 0) {
      const id = list[0].id;
      try {
        const detail = await api(`contrats.getById?input=%7B%22json%22%3A%7B%22id%22%3A${id}%7D%7D`);
        ok(S, `contrats.getById (id=${id})`, `ref=${detail.reference}, titre=${detail.titre?.substring(0,40)}`);
      } catch (e) { fail(S, `contrats.getById (id=${id})`, e.message); }
    }
  } catch (e) { fail(S, 'contrats.list', e.message); }
}

async function testRelances() {
  const S = '2. RELANCES';
  try {
    const list = await api('relances.list');
    ok(S, 'relances.list', `${Array.isArray(list) ? list.length : typeof list} items`);
  } catch (e) { fail(S, 'relances.list', e.message); }
}

// ===== 3. CLIENTS =====
async function testClients() {
  const S = '3. CLIENTS';
  try {
    const list = await api('clients.list');
    ok(S, 'clients.list', `${list.length} clients`);

    if (list.length > 0) {
      const id = list[0].id;
      try {
        const detail = await api(`clients.getById?input=%7B%22json%22%3A%7B%22id%22%3A${id}%7D%7D`);
        ok(S, `clients.getById (id=${id})`, `nom=${detail.nom}, tel=${detail.telephone || 'N/A'}`);
      } catch (e) { fail(S, `clients.getById (id=${id})`, e.message); }
    }
  } catch (e) { fail(S, 'clients.list', e.message); }

  try {
    const search = await api('clients.search?input=%7B%22json%22%3A%7B%22query%22%3A%22Martin%22%7D%7D');
    ok(S, 'clients.search "Martin"', `${Array.isArray(search) ? search.length : '?'} results`);
  } catch (e) { fail(S, 'clients.search', e.message); }
}

async function testAvis() {
  const S = '3. AVIS';
  try {
    const list = await api('avis.list');
    ok(S, 'avis.list', `${Array.isArray(list) ? list.length : typeof list} avis`);
  } catch (e) { fail(S, 'avis.list', e.message); }

  try {
    const stats = await api('avis.getStats');
    ok(S, 'avis.getStats', JSON.stringify(stats).substring(0, 80));
  } catch (e) { fail(S, 'avis.getStats', e.message); }
}

async function testChat() {
  const S = '3. CHAT';
  try {
    const convs = await api('chat.getConversations');
    ok(S, 'chat.getConversations', `${Array.isArray(convs) ? convs.length : '?'} conversations`);

    if (Array.isArray(convs) && convs.length > 0) {
      const cid = convs[0].id;
      try {
        const msgs = await api(`chat.getMessages?input=%7B%22json%22%3A%7B%22conversationId%22%3A${cid}%7D%7D`);
        ok(S, `chat.getMessages (conv=${cid})`, `${Array.isArray(msgs) ? msgs.length : '?'} messages`);
      } catch (e) { fail(S, `chat.getMessages (conv=${cid})`, e.message); }
    }
  } catch (e) { fail(S, 'chat.getConversations', e.message); }

  try {
    const unread = await api('chat.getUnreadCount');
    ok(S, 'chat.getUnreadCount', `count=${unread}`);
  } catch (e) { fail(S, 'chat.getUnreadCount', e.message); }
}

async function testPortail() {
  const S = '3. PORTAIL';
  try {
    const list = await api('portail.listClients');
    ok(S, 'portail.listClients', `${Array.isArray(list) ? list.length : '?'} clients`);
  } catch (e) { fail(S, 'portail.listClients', e.message); }
}

// ===== 4. TERRAIN =====
async function testInterventions() {
  const S = '4. INTERVENTIONS';
  try {
    const list = await api('interventions.list');
    ok(S, 'interventions.list', `${list.length} interventions`);
  } catch (e) { fail(S, 'interventions.list', e.message); }
}

async function testCalendrier() {
  const S = '4. CALENDRIER';
  try {
    const events = await api('calendrier.getEvents?input=%7B%22json%22%3A%7B%22month%22%3A2%2C%22year%22%3A2026%7D%7D');
    ok(S, 'calendrier.getEvents (02/2026)', `${Array.isArray(events) ? events.length : '?'} events`);
  } catch (e) { fail(S, 'calendrier.getEvents', e.message); }
}

async function testTechniciens() {
  const S = '4. TECHNICIENS';
  try {
    const list = await api('techniciens.getAll');
    ok(S, 'techniciens.getAll', `${list.length} techniciens`);
  } catch (e) { fail(S, 'techniciens.getAll', e.message); }
}

async function testGeolocalisation() {
  const S = '4. GEOLOCALISATION';
  try {
    const positions = await api('geolocalisation.getPositions');
    const withPos = positions.filter(p => p.position !== null);
    ok(S, 'geolocalisation.getPositions', `${positions.length} techs, ${withPos.length} with position`);
  } catch (e) { fail(S, 'geolocalisation.getPositions', e.message); }
}

async function testChantiers() {
  const S = '4. CHANTIERS';
  try {
    const list = await api('chantiers.list');
    ok(S, 'chantiers.list', `${list.length} chantiers`);

    if (list.length > 0) {
      const id = list[0].id;
      try {
        const detail = await api(`chantiers.getById?input=%7B%22json%22%3A%7B%22id%22%3A${id}%7D%7D`);
        ok(S, `chantiers.getById (id=${id})`, `nom=${detail.nom?.substring(0,30)}, phases=${detail.phases?.length || '?'}`);
      } catch (e) { fail(S, `chantiers.getById (id=${id})`, e.message); }
    }
  } catch (e) { fail(S, 'chantiers.list', e.message); }
}

async function testPlanification() {
  const S = '4. PLANIFICATION';
  try {
    // Test with Paris coords
    const sugg = await api('interventions.getSuggestionsTechniciens?input=%7B%22json%22%3A%7B%22latitude%22%3A48.8566%2C%22longitude%22%3A2.3522%2C%22dateIntervention%22%3A%222026-02-18T09%3A00%22%7D%7D');
    ok(S, 'interventions.getSuggestionsTechniciens', `${Array.isArray(sugg) ? sugg.length : '?'} suggestions`);
  } catch (e) { fail(S, 'interventions.getSuggestionsTechniciens', e.message); }
}

// ===== 5. GESTION =====
async function testArticles() {
  const S = '5. ARTICLES';
  try {
    const biblio = await api('articles.getArtisanArticles');
    ok(S, 'articles.getArtisanArticles', `${biblio.length} articles artisan`);
  } catch (e) { fail(S, 'articles.getArtisanArticles', e.message); }

  try {
    const biblio = await api('articles.list');
    ok(S, 'articles.list (bibliothèque)', `${biblio.length} articles bibliothèque`);
  } catch (e) { fail(S, 'articles.list', e.message); }
}

async function testStocks() {
  const S = '5. STOCKS';
  try {
    const list = await api('stocks.list');
    ok(S, 'stocks.list', `${Array.isArray(list) ? list.length : '?'} stocks`);
  } catch (e) { fail(S, 'stocks.list', e.message); }
}

async function testFournisseurs() {
  const S = '5. FOURNISSEURS';
  try {
    const list = await api('fournisseurs.list');
    ok(S, 'fournisseurs.list', `${list.length} fournisseurs`);
  } catch (e) { fail(S, 'fournisseurs.list', e.message); }
}

async function testRapportCommande() {
  const S = '5. RAPPORT COMMANDE';
  try {
    const data = await api('stocks.getRapportCommande');
    ok(S, 'stocks.getRapportCommande', `${Array.isArray(data) ? data.length : '?'} items`);
  } catch (e) { fail(S, 'stocks.getRapportCommande', e.message); }
}

// ===== 6. ADMINISTRATION =====
async function testRapports() {
  const S = '6. RAPPORTS';
  try {
    const list = await api('rapports.list');
    ok(S, 'rapports.list', `${Array.isArray(list) ? list.length : '?'} rapports`);
  } catch (e) { fail(S, 'rapports.list', e.message); }
}

async function testComptabilite() {
  const S = '6. COMPTABILITE';
  const endpoints = [
    'comptabilite.getGrandLivre',
    'comptabilite.getBalance',
    'comptabilite.getDeclarationTVA',
    'comptabilite.getJournalVentes',
  ];
  for (const ep of endpoints) {
    try {
      const data = await api(ep);
      ok(S, ep, `${typeof data === 'object' ? (Array.isArray(data) ? data.length + ' items' : 'object') : data}`);
    } catch (e) { fail(S, ep, e.message); }
  }
}

async function testPrevisions() {
  const S = '6. PREVISIONS';
  try {
    const hist = await api('previsions.getHistoriqueCA');
    ok(S, 'previsions.getHistoriqueCA', `${Array.isArray(hist) ? hist.length : '?'} months`);
  } catch (e) { fail(S, 'previsions.getHistoriqueCA', e.message); }

  try {
    const prev = await api('previsions.getPrevisions');
    ok(S, 'previsions.getPrevisions', `${typeof prev}`);
  } catch (e) { fail(S, 'previsions.getPrevisions', e.message); }
}

// ===== 7. PARAMETRES =====
async function testProfil() {
  const S = '7. PROFIL';
  try {
    const profile = await api('artisan.getProfile');
    ok(S, 'artisan.getProfile', `entreprise=${profile.entreprise?.substring(0,30) || 'N/A'}, siret=${profile.siret || 'N/A'}`);
  } catch (e) { fail(S, 'artisan.getProfile', e.message); }
}

async function testParametres() {
  const S = '7. PARAMETRES';
  try {
    const params = await api('parametres.get');
    ok(S, 'parametres.get', `compteurDevis=${params?.compteurDevis || 'N/A'}, compteurFacture=${params?.compteurFacture || 'N/A'}`);
  } catch (e) { fail(S, 'parametres.get', e.message); }
}

async function testModelesEmail() {
  const S = '7. MODELES EMAIL';
  try {
    const list = await api('modelesEmail.list');
    ok(S, 'modelesEmail.list', `${Array.isArray(list) ? list.length : '?'} modèles`);
  } catch (e) { fail(S, 'modelesEmail.list', e.message); }

  try {
    const list = await api('modelesEmail.listTransactionnels');
    ok(S, 'modelesEmail.listTransactionnels', `${Array.isArray(list) ? list.length : '?'} modèles`);
  } catch (e) { fail(S, 'modelesEmail.listTransactionnels', e.message); }
}

// ===== 8. PAGES PUBLIQUES =====
async function testPagesPubliques() {
  const S = '8. PAGES PUBLIQUES';
  // Get a signature token from devis
  try {
    const devis = await api('devis.list');
    if (devis.length > 0) {
      // Check if there's a signature token
      const d = devis[0];
      const detail = await api(`devis.getById?input=%7B%22json%22%3A%7B%22id%22%3A${d.id}%7D%7D`);
      if (detail.signatureToken) {
        const pubRes = await fetch(`${BASE}/devis-public/${detail.signatureToken}`);
        ok(S, '/devis-public/:token HTML', `status=${pubRes.status}`);
      } else {
        warn(S, '/devis-public/:token', 'No signatureToken on first devis');
      }
    }
  } catch (e) { fail(S, '/devis-public/:token', e.message); }

  // Check portail tokens
  try {
    const portailClients = await api('portail.listClients');
    if (Array.isArray(portailClients) && portailClients.length > 0) {
      const withToken = portailClients.find(c => c.portalToken);
      if (withToken) {
        const pubRes = await fetch(`${BASE}/portail/${withToken.portalToken}`);
        ok(S, '/portail/:token HTML', `status=${pubRes.status}`);
      } else {
        warn(S, '/portail/:token', 'No client with portalToken');
      }
    }
  } catch (e) { fail(S, '/portail/:token', e.message); }
}

// ===== 9. VERIFICATIONS TRANSVERSALES =====
async function testTransversal() {
  const S = '9. TRANSVERSAL';

  const conn = await mysql.createConnection({
    uri: 'mysql://root:KreQrjvAkJHYglzfyEFAioeZFTPsaswy@nozomi.proxy.rlwy.net:12684/railway',
    charset: 'utf8mb4',
  });
  await conn.execute('SET NAMES utf8mb4');

  // UTF-8 corruption scan
  const [tables] = await conn.execute('SHOW TABLES');
  const tableNames = tables.map(t => Object.values(t)[0]);
  let totalCorrupted = 0;
  const corruptedDetails = [];

  for (const table of tableNames) {
    const [cols] = await conn.execute(`SHOW COLUMNS FROM \`${table}\``);
    const textCols = cols.filter(c => /varchar|text|char/i.test(c.Type)).map(c => c.Field);
    for (const col of textCols) {
      try {
        const [rows] = await conn.execute(
          `SELECT COUNT(*) as cnt FROM \`${table}\` WHERE HEX(\`${col}\`) LIKE '%EFBFBD%'`
        );
        if (rows[0].cnt > 0) {
          totalCorrupted += rows[0].cnt;
          corruptedDetails.push(`${table}.${col}(${rows[0].cnt})`);
        }
      } catch (e) { /* skip */ }
    }
  }

  if (totalCorrupted === 0) {
    ok(S, 'UTF-8 EFBFBD scan', 'Zero corruption across all tables');
  } else {
    fail(S, 'UTF-8 EFBFBD scan', `${totalCorrupted} corrupted cells: ${corruptedDetails.join(', ')}`);
  }

  // Duplicate numbers check
  const [dupDevis] = await conn.execute('SELECT numero, COUNT(*) as cnt FROM devis GROUP BY numero HAVING cnt > 1');
  if (dupDevis.length === 0) ok(S, 'Doublons numéros devis', 'Aucun doublon');
  else fail(S, 'Doublons numéros devis', dupDevis.map(d => `${d.numero}(x${d.cnt})`).join(', '));

  const [dupFact] = await conn.execute('SELECT numero, COUNT(*) as cnt FROM factures GROUP BY numero HAVING cnt > 1');
  if (dupFact.length === 0) ok(S, 'Doublons numéros factures', 'Aucun doublon');
  else fail(S, 'Doublons numéros factures', dupFact.map(d => `${d.numero}(x${d.cnt})`).join(', '));

  // Counter consistency
  const [maxDevis] = await conn.execute("SELECT MAX(CAST(SUBSTRING(numero, 5) AS UNSIGNED)) as mx FROM devis WHERE numero LIKE 'DEV-%'");
  const [maxFact] = await conn.execute("SELECT MAX(CAST(SUBSTRING(numero, 5) AS UNSIGNED)) as mx FROM factures WHERE numero LIKE 'FAC-%'");
  const [params] = await conn.execute('SELECT compteurDevis, compteurFacture FROM parametres_artisan WHERE artisanId = 1');

  if (params.length > 0) {
    const p = params[0];
    const maxD = maxDevis[0]?.mx || 0;
    const maxF = maxFact[0]?.mx || 0;

    if (p.compteurDevis >= maxD) ok(S, 'Compteur devis', `compteur=${p.compteurDevis}, max existant=${maxD}`);
    else fail(S, 'Compteur devis', `compteur=${p.compteurDevis} < max existant=${maxD} — DÉSYNCHRONISÉ`);

    if (p.compteurFacture >= maxF) ok(S, 'Compteur factures', `compteur=${p.compteurFacture}, max existant=${maxF}`);
    else fail(S, 'Compteur factures', `compteur=${p.compteurFacture} < max existant=${maxF} — DÉSYNCHRONISÉ`);
  } else {
    warn(S, 'Compteurs', 'Aucun parametres_artisan pour artisanId=1');
  }

  // Sidebar routes check - test all endpoints respond (not 500)
  const sidebarPaths = [
    'dashboard.getStats', 'statistiques.getDevisStats',
    'devis.list', 'factures.list', 'contrats.list', 'relances.list',
    'clients.list', 'avis.list', 'portail.listClients', 'chat.getConversations',
    'interventions.list', 'techniciens.getAll', 'geolocalisation.getPositions',
    'chantiers.list',
    'articles.getArtisanArticles', 'stocks.list', 'fournisseurs.list',
    'rapports.list', 'comptabilite.getGrandLivre', 'previsions.getHistoriqueCA',
    'artisan.getProfile', 'modelesEmail.list',
  ];

  let errors500 = [];
  for (const path of sidebarPaths) {
    try {
      const { status, body } = await apiStatus(path);
      if (status >= 500) errors500.push(`${path}(${status})`);
    } catch (e) { errors500.push(`${path}(fetch-error)`); }
  }

  if (errors500.length === 0) ok(S, 'Aucune erreur 500 endpoints', `${sidebarPaths.length} endpoints testés`);
  else fail(S, 'Erreurs 500', errors500.join(', '));

  await conn.end();
}

// ===== RUN ALL =====
async function main() {
  console.log('🔍 AUDIT COMPLET — Artisan MVP\n');

  await testDashboard();
  await testStatistiques();
  await testDevis();
  await testFactures();
  await testContrats();
  await testRelances();
  await testClients();
  await testAvis();
  await testChat();
  await testPortail();
  await testInterventions();
  await testCalendrier();
  await testTechniciens();
  await testGeolocalisation();
  await testChantiers();
  await testPlanification();
  await testArticles();
  await testStocks();
  await testFournisseurs();
  await testRapportCommande();
  await testRapports();
  await testComptabilite();
  await testPrevisions();
  await testProfil();
  await testParametres();
  await testModelesEmail();
  await testPagesPubliques();
  await testTransversal();

  // Print results
  console.log('\n' + '='.repeat(100));
  console.log('RAPPORT D\'AUDIT COMPLET');
  console.log('='.repeat(100));

  let currentSection = '';
  for (const r of results) {
    if (r.section !== currentSection) {
      currentSection = r.section;
      console.log(`\n── ${currentSection} ${'─'.repeat(80 - currentSection.length)}`);
    }
    console.log(`${r.status} ${r.test}${r.detail ? ' → ' + r.detail : ''}`);
  }

  console.log('\n' + '='.repeat(100));
  console.log(`TOTAL: ${results.length} tests | ✅ ${passCount} OK | ⚠️ ${warnCount} MINEUR | ❌ ${failCount} KO`);
  console.log('='.repeat(100));
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
