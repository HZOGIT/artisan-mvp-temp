import { readFileSync } from 'fs';
import mysql from 'mysql2/promise';

async function migrate() {
  try {
    console.log('🚀 Démarrage de la migration...');
    
    // Créer la connexion
    const connection = await mysql.createConnection({ uri: process.env.DATABASE_URL, charset: 'utf8mb4' });
    await connection.execute('SET NAMES utf8mb4');
    console.log('✅ Connecté à la base de données');
    
    // Lire le fichier SQL
    let sql = readFileSync('./drizzle/0020_simple_nextwave.sql', 'utf8');
    console.log('✅ Fichier SQL chargé');
    
    // Nettoyer le SQL
    // 1. Supprimer les commentaires Drizzle
    sql = sql.replace(/--> statement-breakpoint\n/g, '');
    
    // 2. Ajouter IF NOT EXISTS à tous les CREATE TABLE
    sql = sql.replace(/^CREATE TABLE/gm, 'CREATE TABLE IF NOT EXISTS');
    
    // 3. Diviser par CREATE TABLE pour obtenir les statements individuels
    const tables = sql.split('CREATE TABLE IF NOT EXISTS').filter(t => t.trim());
    
    console.log(`📋 ${tables.length} tables à créer/vérifier`);
    
    // Exécuter chaque table
    let created = 0;
    let skipped = 0;
    let errors = 0;
    
    for (let i = 0; i < tables.length; i++) {
      const tableStmt = 'CREATE TABLE IF NOT EXISTS' + tables[i];
      try {
        await connection.query(tableStmt);
        created++;
        process.stdout.write(`\r⏳ Progression: ${i + 1}/${tables.length} (${created} créées)`);
      } catch (error) {
        if (error.code === 'ER_TABLE_EXISTS_ERROR') {
          skipped++;
          process.stdout.write(`\r⏳ Progression: ${i + 1}/${tables.length} (${created} créées, ${skipped} ignorées)`);
        } else {
          errors++;
          console.error(`\n❌ Erreur sur table ${i + 1}:`, error.message);
        }
      }
    }
    
    console.log(`\n✅ Migration terminée !`);
    console.log(`   - Tables créées: ${created}`);
    console.log(`   - Tables ignorées (existantes): ${skipped}`);
    console.log(`   - Erreurs: ${errors}`);
    
    await connection.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  }
}

migrate();
