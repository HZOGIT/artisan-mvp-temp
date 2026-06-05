import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;
console.log('Testing TiDB connection...');
console.log('DATABASE_URL:', DATABASE_URL ? 'Set' : 'Missing');

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL not set');
  process.exit(1);
}

try {
  console.log('Creating connection pool...');
  const pool = mysql.createPool(DATABASE_URL);
  console.log('Pool created successfully');
  
  const connection = await pool.getConnection();
  console.log('Got connection from pool');
  
  const [rows] = await connection.execute('SELECT 1 as test');
  console.log('✅ TiDB connection successful!');
  console.log('Test result:', rows);
  
  connection.release();
  await pool.end();
  console.log('✅ Connection closed');
} catch (error) {
  console.error('❌ TiDB connection failed:');
  console.error('Error:', error.message);
  console.error('Code:', error.code);
  console.error('Full error:', error);
  process.exit(1);
}
