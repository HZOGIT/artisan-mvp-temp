import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;

async function seedSuivi() {
  const connection = await mysql.createConnection({ uri: DATABASE_URL, charset: 'utf8mb4' });
  await connection.execute('SET NAMES utf8mb4');

  console.log('🔧 Insertion des etapes de suivi chantier...');

  try {
    // Trouver le chantier "Mise aux normes" (bureaux Lafayette ou autre)
    const [chantiers] = await connection.execute(
      "SELECT id, nom FROM chantiers WHERE nom LIKE '%Mise aux normes%' LIMIT 1"
    );

    let chantierId;
    if (chantiers.length > 0) {
      chantierId = chantiers[0].id;
      console.log(`✅ Chantier trouve: "${chantiers[0].nom}" (ID: ${chantierId})`);
    } else {
      // Si pas de chantier "Mise aux normes", prendre le premier en_cours
      const [fallback] = await connection.execute(
        "SELECT id, nom FROM chantiers WHERE statut = 'en_cours' LIMIT 1"
      );
      if (fallback.length === 0) {
        console.log('❌ Aucun chantier trouve.');
        return;
      }
      chantierId = fallback[0].id;
      console.log(`⚠️ Chantier "Mise aux normes" non trouve, utilisation de "${fallback[0].nom}" (ID: ${chantierId})`);
    }

    // Supprimer les etapes existantes pour ce chantier (pour re-seed propre)
    await connection.execute('DELETE FROM suivi_chantier WHERE chantierId = ?', [chantierId]);

    // Inserer les 4 etapes
    const etapes = [
      { titre: 'Diagnostic electrique initial', statut: 'termine', pourcentage: 100, ordre: 1, visibleClient: true },
      { titre: 'Remplacement tableau electrique', statut: 'termine', pourcentage: 100, ordre: 2, visibleClient: true },
      { titre: 'Mise en conformite des circuits', statut: 'en_cours', pourcentage: 60, ordre: 3, visibleClient: true },
      { titre: 'Controle Consuel et finitions', statut: 'a_faire', pourcentage: 0, ordre: 4, visibleClient: true },
    ];

    for (const etape of etapes) {
      await connection.execute(`
        INSERT INTO suivi_chantier (chantierId, titre, statut, pourcentage, ordre, visibleClient)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [chantierId, etape.titre, etape.statut, etape.pourcentage, etape.ordre, etape.visibleClient]);
      console.log(`  ✅ Etape ${etape.ordre}: "${etape.titre}" (${etape.statut}, ${etape.pourcentage}%)`);
    }

    // Verifier l'insertion
    const [result] = await connection.execute(
      'SELECT id, titre, statut, pourcentage, ordre, visibleClient FROM suivi_chantier WHERE chantierId = ? ORDER BY ordre',
      [chantierId]
    );

    console.log('\n📋 Etapes de suivi inserees:');
    console.table(result);
    console.log(`\n✅ ${result.length} etapes inserees pour le chantier ID ${chantierId}`);

  } catch (error) {
    console.error('❌ Erreur:', error.message);
  } finally {
    await connection.end();
  }
}

seedSuivi();
