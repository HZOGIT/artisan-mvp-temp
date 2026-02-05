import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: mysql.Pool | null = null;
let _lastConnectionError: Error | null = null;
let _connectionInProgress = false;

// Parser la DATABASE_URL pour extraire les composants
function parseDatabaseUrl(url: string) {
  try {
    const dbUrl = new URL(url);
    return {
      host: dbUrl.hostname,
      port: parseInt(dbUrl.port) || 3306,
      user: decodeURIComponent(dbUrl.username),
      password: decodeURIComponent(dbUrl.password),
      database: dbUrl.pathname.substring(1),
      ssl: dbUrl.searchParams.get('ssl') ? JSON.parse(dbUrl.searchParams.get('ssl')!) : undefined,
    };
  } catch (error) {
    console.error('[Database] Failed to parse DATABASE_URL:', error);
    throw new Error('Invalid DATABASE_URL format');
  }
}

export async function getDb() {
  // Si la connexion est déjà établie, la retourner
  if (_db) {
    return _db;
  }

  // Si une connexion est en cours, attendre qu'elle se termine
  if (_connectionInProgress) {
    let attempts = 0;
    while (_connectionInProgress && attempts < 50) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    if (_db) return _db;
  }

  _connectionInProgress = true;

  try {
    // Parser la DATABASE_URL
    if (!ENV.databaseUrl) {
      throw new Error('DATABASE_URL is not defined');
    }
    
    const dbConfig = parseDatabaseUrl(ENV.databaseUrl);
    
    // Créer le pool de connexion
    _pool = mysql.createPool({
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
      database: dbConfig.database,
      ssl: dbConfig.ssl,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelayMs: 0,
    });

    // Tester la connexion
    const connection = await _pool.getConnection();
    await connection.ping();
    connection.release();

    // Créer l'instance Drizzle
    _db = drizzle(_pool);

    console.log('[Database] Connected successfully');
    _lastConnectionError = null;
    return _db;
  } catch (error) {
    _lastConnectionError = error as Error;
    console.error('[Database] Connection failed:', error);
    _db = null;
    throw error;
  } finally {
    _connectionInProgress = false;
  }
}

// Types are imported directly from schema in the routers
// No re-exports needed here to avoid module loading issues
