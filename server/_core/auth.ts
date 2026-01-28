import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { users } from '../../drizzle/schema';

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

/**
 * Compare a password with its hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Create a new user with email and password
 */
export async function createUserWithPassword(
  email: string,
  password: string,
  name?: string
): Promise<{ id: number; email: string; name: string | null }> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  // Check if user already exists
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing.length > 0) {
    throw new Error('User already exists');
  }

  // Hash password
  const hashedPassword = await hashPassword(password);

  // Create user
    const result = await db.insert(users).values({
    email,
    password: hashedPassword,
    name: name || null,
    loginMethod: 'email',
    lastSignedIn: new Date(),
  });

  // Get the ID from the result
  const userId = result.insertId ? Number(result.insertId) : result[0]?.id;
  if (!userId) throw new Error('Failed to get inserted user ID');

  // Retrieve the created user
  const created = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (created.length === 0) throw new Error('Failed to retrieve created user');

  const user = created[0];
  return {
    id: user.id,
    email: user.email || '',
    name: user.name || null,
  };
}

/**
 * Authenticate a user with email and password
 */
export async function authenticateUser(
  email: string,
  password: string
): Promise<{ id: number; email: string; name: string | null } | null> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  // Find user by email
  const result = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (result.length === 0) {
    return null;
  }

  const user = result[0];

  // Check if user has a password (not OAuth-only)
  if (!user.password) {
    return null;
  }

  // Verify password
  const isValid = await verifyPassword(password, user.password);
  if (!isValid) {
    return null;
  }

  // Update last signed in
  await db
    .update(users)
    .set({ lastSignedIn: new Date() })
    .where(eq(users.id, user.id));

  return {
    id: user.id,
    email: user.email || '',
    name: user.name || null,
  };
}

/**
 * Get user by email
 */
export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}
