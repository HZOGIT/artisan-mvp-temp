import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL non définie');
  process.exit(1);
}

async function seed() {
  const db = await mysql.createConnection({ uri: DATABASE_URL, charset: 'utf8mb4' });
  await db.execute('SET NAMES utf8mb4');

  console.log('='.repeat(60));
  console.log('🔍 ÉTAPE 1 — AUDIT PRÉALABLE');
  console.log('='.repeat(60));

  // --- Get artisan ---
  const [artisans] = await db.execute('SELECT id FROM artisans LIMIT 1');
  if (artisans.length === 0) { console.error('❌ Aucun artisan trouvé'); process.exit(1); }
  const artisanId = artisans[0].id;
  console.log(`Artisan ID: ${artisanId}`);

  // --- Audit counts ---
  const count = async (table) => {
    const [rows] = await db.execute(`SELECT COUNT(*) as c FROM ${table} WHERE artisanId = ?`, [artisanId]);
    return rows[0].c;
  };
  const countAll = async (table) => {
    const [rows] = await db.execute(`SELECT COUNT(*) as c FROM ${table}`);
    return rows[0].c;
  };

  const counts = {
    clients: await count('clients'),
    fournisseurs: await count('fournisseurs'),
    bibliotheque: await countAll('bibliotheque_articles'),
    devis: await count('devis'),
    factures: await count('factures'),
    interventions: await count('interventions'),
    commandes: await count('commandes_fournisseurs'),
    stocks: await count('stocks'),
  };

  console.log('\n📊 État actuel de la base :');
  for (const [k, v] of Object.entries(counts)) {
    console.log(`  ${k}: ${v}`);
  }

  // --- Find the 3 priority clients ---
  const priorityEmails = ['doudihab@gmail.com', 'locapacx@gmail.com', 'zouiten@cheminov.com'];
  const clientMap = {};
  for (const email of priorityEmails) {
    const [rows] = await db.execute('SELECT id, nom, prenom, email FROM clients WHERE artisanId = ? AND email = ?', [artisanId, email]);
    if (rows.length > 0) {
      clientMap[email] = rows[0];
      console.log(`  ✅ Client trouvé: ${rows[0].prenom} ${rows[0].nom} (${email}) → ID ${rows[0].id}`);
    } else {
      console.log(`  ❌ Client NON trouvé: ${email}`);
    }
  }

  const clientIds = Object.values(clientMap).map(c => c.id);
  if (clientIds.length < 2) {
    console.error('❌ Pas assez de clients prioritaires trouvés. Arrêt.');
    await db.end();
    return;
  }

  // Assign shorthand
  const clientDoudihab = clientMap['doudihab@gmail.com'];
  const clientLocapacx = clientMap['locapacx@gmail.com'];
  const clientZouiten = clientMap['zouiten@cheminov.com'];

  // --- Get some library articles for line items ---
  const [biblioArticles] = await db.execute(
    `SELECT id, nom, prix_base, unite, metier, categorie, sous_categorie
     FROM bibliotheque_articles
     WHERE visible = 1
     ORDER BY metier, categorie
     LIMIT 100`
  );
  console.log(`\n  📚 Articles bibliothèque disponibles: ${biblioArticles.length}`);

  // Helper to pick articles by keyword
  const findArticle = (keyword) => {
    const kw = keyword.toLowerCase();
    return biblioArticles.find(a => a.nom.toLowerCase().includes(kw)) || biblioArticles[0];
  };

  console.log('\n' + '='.repeat(60));
  console.log('📝 ÉTAPE 2 — COMPLÉTER LES DONNÉES');
  console.log('='.repeat(60));

  // ============================================================================
  // FOURNISSEURS
  // ============================================================================
  const fournisseursToCreate = [
    { nom: 'Point P Lyon', contact: 'Service commercial', email: 'contact@pointp-lyon.fr', telephone: '04 72 00 11 22', adresse: '45 Rue de la Chimie', codePostal: '69100', ville: 'Villeurbanne' },
    { nom: 'Rexel Lyon Sud', contact: 'Agence commerciale', email: 'rexel.lyonsud@rexel.fr', telephone: '04 78 00 33 44', adresse: '12 Avenue Berthelot', codePostal: '69007', ville: 'Lyon' },
    { nom: 'Sonepar Rhône', contact: 'Service pro', email: 'agence.rhone@sonepar.fr', telephone: '04 72 00 55 66', adresse: '78 Boulevard Vivier Merle', codePostal: '69003', ville: 'Lyon' },
    { nom: 'Leborgne Outillage', contact: 'Département ventes', email: 'commercial@leborgne.fr', telephone: '04 78 00 77 88', adresse: '23 Zone Industrielle', codePostal: '69200', ville: 'Vénissieux' },
  ];

  let addedFournisseurs = 0;
  if (counts.fournisseurs < 3) {
    for (const f of fournisseursToCreate) {
      const [existing] = await db.execute('SELECT id FROM fournisseurs WHERE artisanId = ? AND email = ?', [artisanId, f.email]);
      if (existing.length === 0) {
        await db.execute(
          `INSERT INTO fournisseurs (artisanId, nom, contact, email, telephone, adresse, codePostal, ville)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [artisanId, f.nom, f.contact, f.email, f.telephone, f.adresse, f.codePostal, f.ville]
        );
        addedFournisseurs++;
        console.log(`  ✅ Fournisseur créé: ${f.nom}`);
      } else {
        console.log(`  ⏭️ Fournisseur existe déjà: ${f.nom}`);
      }
    }
  } else {
    console.log(`  ⏭️ Fournisseurs: ${counts.fournisseurs} existants (≥3) → skip`);
  }

  // Get fournisseur IDs for later use
  const [allFournisseurs] = await db.execute('SELECT id, nom FROM fournisseurs WHERE artisanId = ? LIMIT 10', [artisanId]);

  // ============================================================================
  // BIBLIOTHÈQUE ARTICLES — Skip if any exist
  // ============================================================================
  if (counts.bibliotheque > 0) {
    console.log(`\n  ⏭️ Bibliothèque articles: ${counts.bibliotheque} existants → skip`);
  } else {
    console.log(`\n  ⚠️ Bibliothèque vide — ce script ne crée pas d'articles bibliothèque.`);
    console.log(`     Exécutez seed-articles.mjs pour peupler la bibliothèque.`);
  }

  // ============================================================================
  // DEVIS
  // ============================================================================
  const devisToCreate = [];
  if (counts.devis < 8) {
    const needed = 8 - counts.devis;
    console.log(`\n  📄 Devis: ${counts.devis} existants, besoin de ${needed} supplémentaires`);

    const devisDefinitions = [
      {
        clientId: clientDoudihab?.id,
        objet: 'Remplacement chaudière gaz condensation',
        statut: 'accepte',
        notes: 'Chaudière murale Saunier Duval ThemaPlus. Accès chaufferie facile.',
        lignes: [
          { designation: 'Chaudière gaz condensation murale', pu: 2800, qty: 1, unite: 'unité' },
          { designation: 'Kit raccordement fumisterie', pu: 185, qty: 1, unite: 'unité' },
          { designation: 'Thermostat connecté', pu: 220, qty: 1, unite: 'unité' },
          { designation: 'Main d\'oeuvre installation chaudière', pu: 650, qty: 1, unite: 'forfait' },
          { designation: 'Mise en service et réglages', pu: 150, qty: 1, unite: 'forfait' },
        ]
      },
      {
        clientId: clientLocapacx?.id,
        objet: 'Installation 6 radiateurs fonte',
        statut: 'envoye',
        notes: 'Radiateurs acier design pour appartement T4. Pose sur murs porteurs.',
        lignes: [
          { designation: 'Radiateur acier double panneau 1000W', pu: 145, qty: 6, unite: 'unité' },
          { designation: 'Kit raccordement radiateur', pu: 18, qty: 6, unite: 'unité' },
          { designation: 'Robinet thermostatique', pu: 28, qty: 6, unite: 'unité' },
          { designation: 'Main d\'oeuvre pose radiateur', pu: 85, qty: 6, unite: 'unité' },
        ]
      },
      {
        clientId: clientZouiten?.id,
        objet: 'Dépannage fuite salle de bain',
        statut: 'accepte',
        notes: 'Fuite sous lavabo, joint de siphon usé + flexible à remplacer.',
        lignes: [
          { designation: 'Déplacement et diagnostic', pu: 65, qty: 1, unite: 'forfait' },
          { designation: 'Siphon laiton chromé 32mm', pu: 38, qty: 1, unite: 'unité' },
          { designation: 'Flexible alimentation 50cm', pu: 12, qty: 2, unite: 'unité' },
          { designation: 'Joint fibre et téflon', pu: 5, qty: 1, unite: 'lot' },
          { designation: 'Main d\'oeuvre réparation', pu: 85, qty: 2, unite: 'heure' },
        ]
      },
      {
        clientId: clientDoudihab?.id,
        objet: 'Entretien annuel chaudière gaz',
        statut: 'brouillon',
        notes: 'Contrat entretien annuel chaudière. Ramonage conduit inclus.',
        lignes: [
          { designation: 'Entretien annuel chaudière gaz', pu: 95, qty: 1, unite: 'forfait' },
          { designation: 'Ramonage conduit fumée', pu: 55, qty: 1, unite: 'forfait' },
          { designation: 'Analyse combustion et réglages', pu: 35, qty: 1, unite: 'forfait' },
        ]
      },
      {
        clientId: clientLocapacx?.id,
        objet: 'Rénovation salle de bain complète',
        statut: 'refuse',
        notes: 'Rénovation totale SDB 6m². Client a finalement choisi un autre prestataire.',
        lignes: [
          { designation: 'Dépose sanitaires existants', pu: 450, qty: 1, unite: 'forfait' },
          { designation: 'Receveur de douche 120x80', pu: 380, qty: 1, unite: 'unité' },
          { designation: 'Paroi de douche vitrée', pu: 520, qty: 1, unite: 'unité' },
          { designation: 'Meuble vasque 80cm', pu: 650, qty: 1, unite: 'unité' },
          { designation: 'Robinetterie mitigeur douche', pu: 185, qty: 1, unite: 'unité' },
          { designation: 'Main d\'oeuvre plomberie', pu: 120, qty: 24, unite: 'heure' },
        ]
      },
      {
        clientId: clientZouiten?.id,
        objet: 'Installation adoucisseur eau',
        statut: 'envoye',
        notes: 'Adoucisseur 22L pour maison. Bypass à prévoir.',
        lignes: [
          { designation: 'Adoucisseur d\'eau 22 litres', pu: 890, qty: 1, unite: 'unité' },
          { designation: 'Kit bypass adoucisseur', pu: 65, qty: 1, unite: 'unité' },
          { designation: 'Raccordement et mise en service', pu: 280, qty: 1, unite: 'forfait' },
        ]
      },
      {
        clientId: clientDoudihab?.id,
        objet: 'Remplacement cumulus 200L',
        statut: 'accepte',
        notes: 'Ballon ECS thermodynamique Atlantic. Pose en cave.',
        lignes: [
          { designation: 'Chauffe-eau thermodynamique 200L', pu: 1450, qty: 1, unite: 'unité' },
          { designation: 'Kit raccordement hydraulique', pu: 75, qty: 1, unite: 'lot' },
          { designation: 'Groupe de sécurité', pu: 42, qty: 1, unite: 'unité' },
          { designation: 'Main d\'oeuvre dépose + pose', pu: 350, qty: 1, unite: 'forfait' },
        ]
      },
      {
        clientId: clientLocapacx?.id,
        objet: 'Débouchage canalisation cuisine',
        statut: 'accepte',
        notes: 'Canalisation bouchée depuis 2 jours. Intervention rapide demandée.',
        lignes: [
          { designation: 'Déplacement urgent', pu: 85, qty: 1, unite: 'forfait' },
          { designation: 'Débouchage haute pression', pu: 180, qty: 1, unite: 'forfait' },
          { designation: 'Inspection caméra', pu: 95, qty: 1, unite: 'forfait' },
        ]
      },
    ];

    // Get next devis number
    const [devisNums] = await db.execute(
      `SELECT numero FROM devis WHERE artisanId = ? ORDER BY id DESC LIMIT 1`, [artisanId]
    );
    let devisCounter = 1;
    if (devisNums.length > 0) {
      const match = devisNums[0].numero?.match(/(\d+)$/);
      if (match) devisCounter = parseInt(match[1]) + 1;
    }

    for (let i = 0; i < Math.min(needed, devisDefinitions.length); i++) {
      const def = devisDefinitions[i];
      if (!def.clientId) { console.log(`  ⏭️ Devis "${def.objet}" — client manquant`); continue; }

      const numero = `DEV-${String(devisCounter++).padStart(5, '0')}`;
      const dateDevis = new Date(2025, 10 + Math.floor(i / 3), 5 + i * 3);
      const dateValidite = new Date(dateDevis);
      dateValidite.setDate(dateValidite.getDate() + 30);

      // Calculate totals
      let totalHT = 0;
      for (const l of def.lignes) totalHT += l.pu * l.qty;
      const totalTVA = totalHT * 0.20;
      const totalTTC = totalHT + totalTVA;

      const [result] = await db.execute(
        `INSERT INTO devis (artisanId, clientId, numero, dateDevis, dateValidite, statut, objet, notes, totalHT, totalTVA, totalTTC)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [artisanId, def.clientId, numero, dateDevis, dateValidite, def.statut, def.objet, def.notes,
         totalHT.toFixed(2), totalTVA.toFixed(2), totalTTC.toFixed(2)]
      );
      const devisId = result.insertId;

      // Create lignes
      for (let j = 0; j < def.lignes.length; j++) {
        const l = def.lignes[j];
        const montantHT = l.pu * l.qty;
        const montantTVA = montantHT * 0.20;
        const montantTTC = montantHT + montantTVA;
        await db.execute(
          `INSERT INTO devis_lignes (devisId, ordre, designation, quantite, unite, prixUnitaireHT, tauxTVA, montantHT, montantTVA, montantTTC)
           VALUES (?, ?, ?, ?, ?, ?, '20.00', ?, ?, ?)`,
          [devisId, j + 1, l.designation, l.qty.toFixed(2), l.unite, l.pu.toFixed(2),
           montantHT.toFixed(2), montantTVA.toFixed(2), montantTTC.toFixed(2)]
        );
      }

      devisToCreate.push({ id: devisId, ...def, totalHT, totalTVA, totalTTC, numero });
      console.log(`  ✅ Devis ${numero} — ${def.objet} — ${def.statut} — ${totalTTC.toFixed(2)}€ TTC`);
    }
  } else {
    console.log(`\n  ⏭️ Devis: ${counts.devis} existants (≥8) → skip`);
  }

  // ============================================================================
  // FACTURES — from accepted devis
  // ============================================================================
  if (counts.factures < 6) {
    const needed = 6 - counts.factures;
    console.log(`\n  🧾 Factures: ${counts.factures} existantes, besoin de ${needed} supplémentaires`);

    // Get all accepted devis that don't have a facture yet
    const [acceptedDevis] = await db.execute(
      `SELECT d.id, d.clientId, d.objet, d.totalHT, d.totalTVA, d.totalTTC, d.numero
       FROM devis d
       WHERE d.artisanId = ? AND d.statut = 'accepte'
       AND d.id NOT IN (SELECT COALESCE(devisId, 0) FROM factures WHERE artisanId = ? AND devisId IS NOT NULL)
       ORDER BY d.id`,
      [artisanId, artisanId]
    );

    // Get next facture number
    const [facNums] = await db.execute(
      `SELECT numero FROM factures WHERE artisanId = ? ORDER BY id DESC LIMIT 1`, [artisanId]
    );
    let facCounter = 1;
    if (facNums.length > 0) {
      const match = facNums[0].numero?.match(/(\d+)$/);
      if (match) facCounter = parseInt(match[1]) + 1;
    }

    const statuts = ['payee', 'payee', 'envoyee', 'envoyee', 'en_retard', 'envoyee'];
    let facturesCreated = 0;

    for (let i = 0; i < Math.min(needed, acceptedDevis.length); i++) {
      const dv = acceptedDevis[i];
      const numero = `FAC-${String(facCounter++).padStart(5, '0')}`;
      const statut = statuts[i] || 'envoyee';
      const dateFacture = new Date(2025, 11, 1 + i * 5);
      const dateEcheance = new Date(dateFacture);
      dateEcheance.setDate(dateEcheance.getDate() + 30);

      let datePaiement = null;
      let modePaiement = null;
      let montantPaye = '0.00';

      if (statut === 'payee') {
        datePaiement = new Date(dateFacture);
        datePaiement.setDate(datePaiement.getDate() + 15);
        modePaiement = i === 0 ? 'virement' : 'carte';
        montantPaye = dv.totalTTC;
      }

      // For en_retard, set echeance in the past
      if (statut === 'en_retard') {
        dateEcheance.setFullYear(2025);
        dateEcheance.setMonth(10); // November
        dateEcheance.setDate(15);
      }

      const [result] = await db.execute(
        `INSERT INTO factures (artisanId, clientId, devisId, numero, dateFacture, dateEcheance, statut, objet, totalHT, totalTVA, totalTTC, montantPaye, datePaiement, modePaiement)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [artisanId, dv.clientId, dv.id, numero, dateFacture, dateEcheance, statut,
         dv.objet, dv.totalHT, dv.totalTVA, dv.totalTTC, montantPaye, datePaiement, modePaiement]
      );
      const factureId = result.insertId;

      // Copy lines from devis
      const [devisLignes] = await db.execute(
        'SELECT * FROM devis_lignes WHERE devisId = ? ORDER BY ordre', [dv.id]
      );
      for (const l of devisLignes) {
        await db.execute(
          `INSERT INTO factures_lignes (factureId, ordre, reference, designation, description, quantite, unite, prixUnitaireHT, tauxTVA, montantHT, montantTVA, montantTTC)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [factureId, l.ordre, l.reference, l.designation, l.description, l.quantite, l.unite,
           l.prixUnitaireHT, l.tauxTVA, l.montantHT, l.montantTVA, l.montantTTC]
        );
      }

      facturesCreated++;
      console.log(`  ✅ Facture ${numero} — ${dv.objet} — ${statut} — ${dv.totalTTC}€ TTC`);
    }

    // If we didn't have enough accepted devis, create standalone invoices
    if (facturesCreated < needed) {
      const remaining = needed - facturesCreated;
      console.log(`  ℹ️ ${remaining} facture(s) supplémentaire(s) à créer sans devis lié`);

      const standaloneFactures = [
        { clientId: clientZouiten?.id, objet: 'Dépannage urgent ballon eau chaude', totalHT: 245, statut: 'envoyee' },
        { clientId: clientDoudihab?.id, objet: 'Remplacement robinet cuisine', totalHT: 165, statut: 'en_retard' },
        { clientId: clientLocapacx?.id, objet: 'Détartrage chauffe-eau', totalHT: 120, statut: 'payee' },
      ];

      for (let i = 0; i < Math.min(remaining, standaloneFactures.length); i++) {
        const sf = standaloneFactures[i];
        if (!sf.clientId) continue;
        const numero = `FAC-${String(facCounter++).padStart(5, '0')}`;
        const totalTVA = sf.totalHT * 0.20;
        const totalTTC = sf.totalHT + totalTVA;
        const dateFacture = new Date(2025, 11, 10 + i * 5);
        const dateEcheance = new Date(dateFacture);
        dateEcheance.setDate(dateEcheance.getDate() + 30);

        if (sf.statut === 'en_retard') {
          dateEcheance.setMonth(10);
          dateEcheance.setDate(20);
        }

        let datePaiement = null;
        let modePaiement = null;
        let montantPaye = '0.00';
        if (sf.statut === 'payee') {
          datePaiement = new Date(dateFacture);
          datePaiement.setDate(datePaiement.getDate() + 10);
          modePaiement = 'virement';
          montantPaye = totalTTC.toFixed(2);
        }

        const [result] = await db.execute(
          `INSERT INTO factures (artisanId, clientId, numero, dateFacture, dateEcheance, statut, objet, totalHT, totalTVA, totalTTC, montantPaye, datePaiement, modePaiement)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [artisanId, sf.clientId, numero, dateFacture, dateEcheance, sf.statut,
           sf.objet, sf.totalHT.toFixed(2), totalTVA.toFixed(2), totalTTC.toFixed(2),
           montantPaye, datePaiement, modePaiement]
        );

        // Create a simple line
        const factureId = result.insertId;
        await db.execute(
          `INSERT INTO factures_lignes (factureId, ordre, designation, quantite, unite, prixUnitaireHT, tauxTVA, montantHT, montantTVA, montantTTC)
           VALUES (?, 1, ?, '1.00', 'forfait', ?, '20.00', ?, ?, ?)`,
          [factureId, sf.objet, sf.totalHT.toFixed(2), sf.totalHT.toFixed(2),
           totalTVA.toFixed(2), totalTTC.toFixed(2)]
        );

        console.log(`  ✅ Facture ${numero} — ${sf.objet} — ${sf.statut} — ${totalTTC.toFixed(2)}€ TTC`);
      }
    }
  } else {
    console.log(`\n  ⏭️ Factures: ${counts.factures} existantes (≥6) → skip`);
  }

  // ============================================================================
  // INTERVENTIONS
  // ============================================================================
  if (counts.interventions < 8) {
    const needed = 8 - counts.interventions;
    console.log(`\n  🔧 Interventions: ${counts.interventions} existantes, besoin de ${needed} supplémentaires`);

    const interventionsDefs = [
      { clientId: clientDoudihab?.id, titre: 'Installation chaudière gaz', desc: 'Dépose ancienne chaudière et pose nouvelle Saunier Duval ThemaPlus. Raccordement gaz et fumisterie.', statut: 'terminee', daysAgo: 25, dureeH: 6 },
      { clientId: clientZouiten?.id, titre: 'Réparation fuite salle de bain', desc: 'Remplacement siphon et flexibles sous lavabo. Vérification étanchéité.', statut: 'terminee', daysAgo: 18, dureeH: 2 },
      { clientId: clientLocapacx?.id, titre: 'Pose radiateur chambre 1', desc: 'Installation radiateur acier 1000W + robinet thermostatique. Raccordement circuit chauffage.', statut: 'terminee', daysAgo: 12, dureeH: 3 },
      { clientId: clientDoudihab?.id, titre: 'Entretien chaudière annuel', desc: 'Contrôle brûleur, nettoyage échangeur, vérification sécurités, analyse combustion.', statut: 'planifiee', daysAhead: 15, dureeH: 2 },
      { clientId: clientLocapacx?.id, titre: 'Pose radiateur chambre 2', desc: 'Suite installation radiateurs appartement T4. Radiateur + raccordement.', statut: 'planifiee', daysAhead: 8, dureeH: 3 },
      { clientId: clientZouiten?.id, titre: 'Installation adoucisseur eau', desc: 'Pose adoucisseur 22L avec bypass. Raccordement arrivée eau principale.', statut: 'planifiee', daysAhead: 22, dureeH: 4 },
      { clientId: clientDoudihab?.id, titre: 'Remplacement cumulus', desc: 'Dépose ballon 150L et pose chauffe-eau thermodynamique 200L Atlantic.', statut: 'en_cours', daysAgo: 0, dureeH: 5 },
      { clientId: clientLocapacx?.id, titre: 'Débouchage canalisation', desc: 'Débouchage haute pression canalisation cuisine. Passage caméra inspection.', statut: 'terminee', daysAgo: 5, dureeH: 2 },
      { clientId: clientZouiten?.id, titre: 'Contrôle étanchéité gaz', desc: 'Vérification complète installation gaz. Test pression et contrôle raccords.', statut: 'planifiee', daysAhead: 30, dureeH: 3 },
      { clientId: clientDoudihab?.id, titre: 'Remplacement mitigeur cuisine', desc: 'Dépose ancien mitigeur et pose modèle Grohe avec douchette extractible.', statut: 'terminee', daysAgo: 8, dureeH: 2 },
    ];

    for (let i = 0; i < Math.min(needed, interventionsDefs.length); i++) {
      const def = interventionsDefs[i];
      if (!def.clientId) { console.log(`  ⏭️ Intervention "${def.titre}" — client manquant`); continue; }

      const now = new Date();
      let dateDebut, dateFin;
      if (def.daysAgo !== undefined) {
        dateDebut = new Date(now);
        dateDebut.setDate(dateDebut.getDate() - def.daysAgo);
        dateDebut.setHours(8, 0, 0, 0);
      } else {
        dateDebut = new Date(now);
        dateDebut.setDate(dateDebut.getDate() + def.daysAhead);
        dateDebut.setHours(9, 0, 0, 0);
      }
      dateFin = new Date(dateDebut);
      dateFin.setHours(dateDebut.getHours() + def.dureeH);

      await db.execute(
        `INSERT INTO interventions (artisanId, clientId, titre, description, dateDebut, dateFin, statut)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [artisanId, def.clientId, def.titre, def.desc, dateDebut, dateFin, def.statut]
      );
      console.log(`  ✅ Intervention: ${def.titre} — ${def.statut}`);
    }
  } else {
    console.log(`\n  ⏭️ Interventions: ${counts.interventions} existantes (≥8) → skip`);
  }

  // ============================================================================
  // COMMANDES FOURNISSEURS
  // ============================================================================
  if (counts.commandes < 4) {
    const needed = 4 - counts.commandes;
    console.log(`\n  📦 Commandes: ${counts.commandes} existantes, besoin de ${needed} supplémentaires`);

    // Get next CMD number
    const [cmdNums] = await db.execute(
      `SELECT numero FROM commandes_fournisseurs WHERE artisanId = ? ORDER BY id DESC LIMIT 1`, [artisanId]
    );
    let cmdCounter = 1;
    if (cmdNums.length > 0) {
      const match = cmdNums[0].numero?.match(/(\d+)$/);
      if (match) cmdCounter = parseInt(match[1]) + 1;
    }

    const commandesDefs = [
      {
        fournisseurIdx: 0,
        statut: 'confirmee',
        delai: '5 jours ouvrés',
        adresse: '15 Rue des Artisans, 69001 Lyon',
        notes: 'Livraison à confirmer par téléphone la veille.',
        lignes: [
          { designation: 'Tube cuivre 22mm (barre 4m)', ref: 'CU-22-4M', qty: 10, pu: 28.50, unite: 'barre' },
          { designation: 'Raccord laiton T 22mm', ref: 'RL-T22', qty: 20, pu: 4.80, unite: 'unité' },
          { designation: 'Coude cuivre 90° 22mm', ref: 'CC-90-22', qty: 15, pu: 2.40, unite: 'unité' },
          { designation: 'Flux décapant 250ml', ref: 'FD-250', qty: 5, pu: 8.90, unite: 'flacon' },
        ]
      },
      {
        fournisseurIdx: 1,
        statut: 'envoyee',
        delai: '3 jours ouvrés',
        adresse: '15 Rue des Artisans, 69001 Lyon',
        notes: 'Commande urgente pour chantier en cours.',
        lignes: [
          { designation: 'Chauffe-eau thermodynamique 200L Atlantic', ref: 'CET-200-ATL', qty: 1, pu: 980, unite: 'unité' },
          { designation: 'Groupe de sécurité', ref: 'GS-20', qty: 1, pu: 22, unite: 'unité' },
          { designation: 'Kit raccordement hydraulique', ref: 'KRH-20', qty: 1, pu: 45, unite: 'lot' },
        ]
      },
      {
        fournisseurIdx: 2,
        statut: 'brouillon',
        delai: '7 jours ouvrés',
        adresse: '15 Rue des Artisans, 69001 Lyon',
        notes: 'Réapprovisionnement stock mensuel.',
        lignes: [
          { designation: 'Joint fibre 20/27 (lot 100)', ref: 'JF-2027-100', qty: 2, pu: 12.50, unite: 'lot' },
          { designation: 'Téflon 12mm x 12m', ref: 'TEF-12', qty: 10, pu: 2.80, unite: 'rouleau' },
          { designation: 'Siphon laiton 32mm', ref: 'SL-32', qty: 5, pu: 18.50, unite: 'unité' },
          { designation: 'Flexible inox 50cm', ref: 'FI-50', qty: 10, pu: 8.90, unite: 'unité' },
          { designation: 'Vanne d\'arrêt 1/4 tour 20/27', ref: 'VA-2027', qty: 5, pu: 12.80, unite: 'unité' },
        ]
      },
      {
        fournisseurIdx: 0,
        statut: 'livree',
        delai: '5 jours ouvrés',
        adresse: '15 Rue des Artisans, 69001 Lyon',
        notes: 'Commande livrée complète. RAS.',
        lignes: [
          { designation: 'Robinet thermostatique Danfoss', ref: 'RT-DAN', qty: 8, pu: 24.50, unite: 'unité' },
          { designation: 'Radiateur acier double 1000W', ref: 'RAD-1000', qty: 6, pu: 98, unite: 'unité' },
          { designation: 'Kit raccordement radiateur', ref: 'KRR-15', qty: 6, pu: 12.50, unite: 'kit' },
        ]
      },
    ];

    for (let i = 0; i < Math.min(needed, commandesDefs.length); i++) {
      const def = commandesDefs[i];
      const fournisseur = allFournisseurs[def.fournisseurIdx % allFournisseurs.length];
      if (!fournisseur) { console.log('  ⏭️ Pas de fournisseur disponible'); continue; }

      const numero = `CMD-${String(cmdCounter++).padStart(5, '0')}`;
      const dateCommande = new Date(2025, 11, 5 + i * 7);

      let totalHT = 0;
      for (const l of def.lignes) totalHT += l.qty * l.pu;
      const totalTVA = totalHT * 0.20;
      const totalTTC = totalHT + totalTVA;

      const [result] = await db.execute(
        `INSERT INTO commandes_fournisseurs (artisanId, fournisseurId, numero, dateCommande, statut, totalHT, totalTVA, totalTTC, montantTotal, delaiLivraison, adresseLivraison, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [artisanId, fournisseur.id, numero, dateCommande, def.statut,
         totalHT.toFixed(2), totalTVA.toFixed(2), totalTTC.toFixed(2), totalTTC.toFixed(2),
         def.delai, def.adresse, def.notes]
      );
      const commandeId = result.insertId;

      for (const l of def.lignes) {
        const montantTotal = (l.qty * l.pu).toFixed(2);
        await db.execute(
          `INSERT INTO lignes_commandes_fournisseurs (commandeId, designation, reference, quantite, unite, prixUnitaire, tauxTVA, montantTotal)
           VALUES (?, ?, ?, ?, ?, ?, '20.00', ?)`,
          [commandeId, l.designation, l.ref, l.qty.toFixed(2), l.unite, l.pu.toFixed(2), montantTotal]
        );
      }

      console.log(`  ✅ Commande ${numero} → ${fournisseur.nom} — ${def.statut} — ${totalTTC.toFixed(2)}€ TTC`);
    }
  } else {
    console.log(`\n  ⏭️ Commandes: ${counts.commandes} existantes (≥4) → skip`);
  }

  // ============================================================================
  // STOCKS
  // ============================================================================
  if (counts.stocks < 12) {
    const needed = 12 - counts.stocks;
    console.log(`\n  📦 Stocks: ${counts.stocks} existants, besoin de ${needed} supplémentaires`);

    const stocksDefs = [
      // Normal stock
      { ref: 'CU-22-4M', designation: 'Tube cuivre 22mm (barre 4m)', qty: 18, seuil: 5, prix: 28.50, emplacement: 'Étagère A1', fournisseur: 'Point P Lyon' },
      { ref: 'CU-15-4M', designation: 'Tube cuivre 15mm (barre 4m)', qty: 12, seuil: 5, prix: 22.00, emplacement: 'Étagère A1', fournisseur: 'Point P Lyon' },
      { ref: 'PER-16', designation: 'Tube PER 16mm (couronne 50m)', qty: 3, seuil: 1, prix: 45.00, emplacement: 'Étagère A2', fournisseur: 'Rexel Lyon Sud' },
      { ref: 'RL-T22', designation: 'Raccord laiton T 22mm', qty: 35, seuil: 10, prix: 4.80, emplacement: 'Tiroir B1', fournisseur: 'Point P Lyon' },
      { ref: 'CC-90-22', designation: 'Coude cuivre 90° 22mm', qty: 28, seuil: 10, prix: 2.40, emplacement: 'Tiroir B1', fournisseur: 'Point P Lyon' },
      { ref: 'VA-2027', designation: 'Vanne d\'arrêt 1/4 tour 20/27', qty: 8, seuil: 3, prix: 12.80, emplacement: 'Tiroir B2', fournisseur: 'Sonepar Rhône' },
      { ref: 'SL-32', designation: 'Siphon laiton chromé 32mm', qty: 6, seuil: 3, prix: 18.50, emplacement: 'Étagère C1', fournisseur: 'Rexel Lyon Sud' },
      { ref: 'FI-50', designation: 'Flexible inox alimentation 50cm', qty: 14, seuil: 5, prix: 8.90, emplacement: 'Tiroir C2', fournisseur: 'Sonepar Rhône' },
      { ref: 'GS-20', designation: 'Groupe de sécurité 20x27', qty: 4, seuil: 2, prix: 22.00, emplacement: 'Étagère D1', fournisseur: 'Point P Lyon' },
      // 3 articles EN DESSOUS du seuil d'alerte
      { ref: 'JF-2027', designation: 'Joint fibre 20/27 (lot 10)', qty: 1, seuil: 5, prix: 3.50, emplacement: 'Tiroir B3', fournisseur: 'Leborgne Outillage' },
      { ref: 'TEF-12', designation: 'Téflon PTFE 12mm x 12m', qty: 2, seuil: 5, prix: 2.80, emplacement: 'Tiroir B3', fournisseur: 'Leborgne Outillage' },
      { ref: 'FD-250', designation: 'Flux décapant brasure 250ml', qty: 0, seuil: 2, prix: 8.90, emplacement: 'Étagère A3', fournisseur: 'Point P Lyon' },
      // Extra if needed
      { ref: 'RT-DAN', designation: 'Robinet thermostatique Danfoss', qty: 3, seuil: 2, prix: 24.50, emplacement: 'Étagère D2', fournisseur: 'Rexel Lyon Sud' },
      { ref: 'CC-90-15', designation: 'Coude cuivre 90° 15mm', qty: 22, seuil: 10, prix: 1.90, emplacement: 'Tiroir B1', fournisseur: 'Point P Lyon' },
      { ref: 'MAN-001', designation: 'Manomètre 0-10 bar radial', qty: 2, seuil: 1, prix: 15.00, emplacement: 'Étagère D1', fournisseur: 'Sonepar Rhône' },
    ];

    for (let i = 0; i < Math.min(needed, stocksDefs.length); i++) {
      const s = stocksDefs[i];
      // Check if stock with same reference already exists
      const [existing] = await db.execute(
        'SELECT id FROM stocks WHERE artisanId = ? AND reference = ?', [artisanId, s.ref]
      );
      if (existing.length > 0) {
        console.log(`  ⏭️ Stock existe déjà: ${s.ref}`);
        continue;
      }

      const alertFlag = s.qty <= s.seuil ? ' ⚠️ ALERTE' : '';
      await db.execute(
        `INSERT INTO stocks (artisanId, reference, designation, quantiteEnStock, seuilAlerte, unite, prixAchat, emplacement, fournisseur)
         VALUES (?, ?, ?, ?, ?, 'unité', ?, ?, ?)`,
        [artisanId, s.ref, s.designation, s.qty.toFixed(2), s.seuil.toFixed(2), s.prix.toFixed(2), s.emplacement, s.fournisseur]
      );
      console.log(`  ✅ Stock: ${s.ref} — ${s.designation} — Qté: ${s.qty}${alertFlag}`);
    }
  } else {
    console.log(`\n  ⏭️ Stocks: ${counts.stocks} existants (≥12) → skip`);
  }

  // ============================================================================
  // TOTAUX FINAUX
  // ============================================================================
  console.log('\n' + '='.repeat(60));
  console.log('📊 TOTAUX FINAUX');
  console.log('='.repeat(60));

  const finalCounts = {
    clients: await count('clients'),
    fournisseurs: await count('fournisseurs'),
    bibliotheque: await countAll('bibliotheque_articles'),
    devis: await count('devis'),
    factures: await count('factures'),
    interventions: await count('interventions'),
    commandes: await count('commandes_fournisseurs'),
    stocks: await count('stocks'),
  };

  for (const [k, v] of Object.entries(finalCounts)) {
    const prev = counts[k];
    const diff = v - prev;
    const diffStr = diff > 0 ? ` (+${diff})` : '';
    console.log(`  ${k}: ${v}${diffStr}`);
  }

  console.log('\n✅ Seed terminé avec succès !');
  await db.end();
}

seed().catch(err => {
  console.error('❌ Erreur:', err);
  process.exit(1);
});
