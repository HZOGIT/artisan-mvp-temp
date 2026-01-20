import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { users, artisans } from './drizzle/schema.js';
import { eq } from 'drizzle-orm';

async function seedDatabase() {
  try {
    console.log('[SEED] Starting database seeding...');
    
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      console.log('[SEED] DATABASE_URL not set, skipping seeding');
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
    
    // Check if user already exists
    const existingUsers = await db.select()
      .from(users)
      .where(eq(users.email, 'zouiten@biopp.fr'))
      .limit(1);
    
    if (existingUsers.length > 0) {
      console.log('[SEED] User zouiten@biopp.fr already exists, skipping seeding');
      await connection.end();
      return;
    }
    
    // Create test user
    console.log('[SEED] Creating test user zouiten@biopp.fr');
    const insertedUsers = await db.insert(users).values({
      email: 'zouiten@biopp.fr',
      name: 'Zouiten Biopp',
      openId: 'demo-zouiten-' + Date.now(),
      loginMethod: 'demo',
      role: 'user',
    });
    
    // Get the inserted user ID
    const userResult = await db.select()
      .from(users)
      .where(eq(users.email, 'zouiten@biopp.fr'))
      .limit(1);
    
    if (userResult.length === 0) {
      throw new Error('Failed to create user');
    }
    
    const userId = userResult[0].id;
    
    // Create associated artisan
    console.log('[SEED] Creating artisan profile for user', userId);
    await db.insert(artisans).values({
      userId: userId,
      nomEntreprise: 'Biopp Électricité',
      siret: '12345678901234',
      adresse: '123 Rue de la Paix',
      codePostal: '75001',
      ville: 'Paris',
      telephone: '0123456789',
      email: 'zouiten@biopp.fr',
      specialite: 'electricite',
    });
    
    console.log('[SEED] Database seeding completed successfully');
    await connection.end();
    
  } catch (error) {
    console.error('[SEED] Seeding failed:', error);
    process.exit(1);
  }
}

seedDatabase();
