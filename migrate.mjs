import { migrate } from 'drizzle-orm/mysql2/migrator';
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';

async function runMigrations() {
  try {
    console.log('[MIGRATE] Starting database migrations...');
    
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      console.log('[MIGRATE] DATABASE_URL not set, skipping migrations');
      return;
    }

    // Parse the connection string
    const url = new URL(databaseUrl);
    const connection = await mysql.createConnection({
      host: url.hostname,
      port: url.port || 3306,
      user: url.username,
      password: url.password,
      database: url.pathname.slice(1),
    });

    const db = drizzle(connection);
    
    // Run migrations
    await migrate(db, { migrationsFolder: './drizzle/migrations' });
    
    console.log('[MIGRATE] Migrations completed successfully');
    await connection.end();
    
  } catch (error) {
    console.error('[MIGRATE] Migration failed:', error);
    process.exit(1);
  }
}

runMigrations();
