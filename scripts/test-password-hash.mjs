import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';

async function testPasswordHash() {
  try {
    console.log('🔐 Test du hash du password...\n');
    
    const connection = await mysql.createConnection({
      host: 'gateway02.us-east-1.prod.aws.tidbcloud.com',
      port: 4000,
      user: '3Df5Vmfjhp6Bzkk.79acb552eee2',
      password: 'r19o8hiVVYo5doye80LR',
      database: 'J25kfT9jDPLP68WkWNhvrq',
      ssl: { rejectUnauthorized: true }
    });
    
    // Récupérer le hash de la base
    const [rows] = await connection.query(
      'SELECT id, email, password FROM users WHERE email = ?',
      ['zoubej@gmail.com']
    );
    
    if (rows.length === 0) {
      console.log('❌ Compte non trouvé !');
      await connection.end();
      return;
    }
    
    const user = rows[0];
    console.log('📧 Email :', user.email);
    console.log('🔑 Hash stocké :', user.password.substring(0, 20) + '...');
    console.log('✅ Hash commence par :', user.password.substring(0, 7));
    
    // Tester le password
    const testPassword = 'Zoubej@6691';
    const isValid = await bcrypt.compare(testPassword, user.password);
    
    console.log('\n🧪 Test bcrypt.compare :');
    console.log('Password testé :', testPassword);
    console.log('Résultat :', isValid ? '✅ VALIDE' : '❌ INVALIDE');
    
    if (!isValid) {
      console.log('\n⚠️ Le password ne correspond pas au hash !');
      console.log('Cela signifie que soit :');
      console.log('  1. Le password utilisé est incorrect');
      console.log('  2. Le hash a été corrompu');
      console.log('  3. Il y a un problème avec bcrypt');
    }
    
    await connection.end();
  } catch (error) {
    console.error('❌ Erreur :', error.message);
    process.exit(1);
  }
}

testPasswordHash();
