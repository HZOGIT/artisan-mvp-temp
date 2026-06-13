import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL not set. Run: $env:DATABASE_URL = "mysql://..."');
  process.exit(1);
}

const pool = mysql.createPool(DATABASE_URL);
const conn = await pool.getConnection();

try {
  // Note: la colonne s'appelle "name" dans le schema (pas "nom") pour la table users.
  const [users] = await conn.execute(
    "SELECT id, email, name AS nom, prenom, role, createdAt FROM users ORDER BY id"
  );
  const [clients] = await conn.execute(
    "SELECT id, nom, email, telephone, ville FROM clients ORDER BY id"
  );

  console.log(`\n=== USERS (${users.length}) ===`);
  console.table(users);

  console.log(`\n=== CLIENTS (${clients.length}) ===`);
  console.table(clients);
} finally {
  conn.release();
  await pool.end();
}
