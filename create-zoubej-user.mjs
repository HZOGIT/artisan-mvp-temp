import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';

async function createTestUser() {
  try {
    console.log('🚀 Création du compte de test pour zoubej@gmail.com...');
    
    const connection = await mysql.createConnection({
      host: 'gateway02.us-east-1.prod.aws.tidbcloud.com',
      port: 4000,
      user: '3Df5Vmfjhp6Bzkk.79acb552eee2',
      password: 'r19o8hiVVYo5doye80LR',
      database: 'J25kfT9jDPLP68WkWNhvrq',
      ssl: { rejectUnauthorized: true }
    });
    
    console.log('✅ Connecté à TiDB');
    
    // Hasher le password
    const hashedPassword = await bcrypt.hash('Zoubej@6691', 10);
    console.log('✅ Password hashé');
    
    // Insérer l'utilisateur
    await connection.query(
      'INSERT INTO users (email, password, name, createdAt, updatedAt) VALUES (?, ?, ?, NOW(), NOW())',
      ['zoubej@gmail.com', hashedPassword, 'Test User']
    );
    
    console.log('✅ Compte créé avec succès !');
    console.log('📧 Email : zoubej@gmail.com');
    console.log('🔑 Password : Zoubej@6691');
    
    await connection.end();
  } catch (error) {
    console.error('❌ Erreur :', error.message);
    process.exit(1);
  }
}

createTestUser();
