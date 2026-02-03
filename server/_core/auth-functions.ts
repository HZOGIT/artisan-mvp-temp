/**
 * Fonctions d'authentification avec bcrypt
 * Utilisées par les procédures signin/signup
 */

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
) {
  try {
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
      role: 'user',
    });

    // Retrieve created user
    const created = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (created.length === 0) {
      throw new Error('Failed to retrieve created user');
    }

    return created[0];
  } catch (error) {
    console.error('[Auth] createUserWithPassword failed:', error);
    throw error;
  }
}

/**
 * Authenticate user with email and password
 */
export async function authenticateUser(email: string, password: string) {
  try {
    const db = await getDb();
    if (!db) return null;

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

    // Verify password
    if (!user.password) {
      return null;
    }

    const isValid = await verifyPassword(password, user.password);
    if (!isValid) {
      return null;
    }

    return user;
  } catch (error) {
    console.error('[Auth] authenticateUser failed:', error);
    return null;
  }
}
