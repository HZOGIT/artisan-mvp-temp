import { SignJWT, jwtVerify } from "jose";
import type { Request, Response } from "express";
import { getDb } from "../db";
import { users, permissionsUtilisateur } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { ALL_PERMISSIONS } from "../../shared/permissions";

const JWT_SECRET = process.env.JWT_SECRET || "monartisan-dev-secret-2026";
const SECRET_KEY = new TextEncoder().encode(JWT_SECRET);
const COOKIE_NAME = "token";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Create a JWT token for a user
 */
export async function createToken(user: { id: number; email: string }): Promise<string> {
  const token = await new SignJWT({
    userId: user.id,
    email: user.email,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(SECRET_KEY);

  return token;
}

/**
 * Verify and decode a JWT token
 */
export async function verifyToken(
  token: string
): Promise<{ userId: number; email: string } | null> {
  try {
    const verified = await jwtVerify(token, SECRET_KEY);
    return verified.payload as { userId: number; email: string };
  } catch (error) {
    return null;
  }
}

/**
 * Set authentication cookie
 */
export function setAuthCookie(res: Response, token: string, req: Request): void {
  const isProduction = process.env.NODE_ENV === "production";

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
}

/**
 * Clear authentication cookie
 */
export function clearAuthCookie(res: Response): void {
  const isProduction = process.env.NODE_ENV === "production";

  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
  });
}

/**
 * Get user from request (read cookie → verify JWT → get user from db)
 */
export async function getUserFromRequest(req: Request) {
  try {
    // Get token from cookies
    const token = req.cookies?.[COOKIE_NAME];

    if (!token) {
      return null;
    }

    // Verify JWT token
    const payload = await verifyToken(token);

    if (!payload) {
      return null;
    }

    // Get user from database
    const db = await getDb();
    if (!db) {
      return null;
    }

    const result = await db
      .select()
      .from(users)
      .where(eq(users.id, payload.userId))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const user = result[0];
    // Block inactive users
    if (user.actif === false) {
      return null;
    }

    // Load permissions
    let permissions: string[] = [];
    if (user.role === "admin") {
      // Admin bypass: always has all permissions, no DB query needed
      permissions = [...ALL_PERMISSIONS];
    } else {
      const permRows = await db.select({ permission: permissionsUtilisateur.permission })
        .from(permissionsUtilisateur)
        .where(and(
          eq(permissionsUtilisateur.userId, user.id),
          eq(permissionsUtilisateur.autorise, true)
        ));
      permissions = permRows.map(r => r.permission);
    }

    return {
      id: user.id,
      email: user.email || "",
      name: user.name || null,
      prenom: user.prenom || null,
      role: user.role || "admin",
      artisanId: user.artisanId || null,
      actif: user.actif,
      permissions,
    };
  } catch (error) {
    console.error("[Auth] Error getting user from request:", error);
    return null;
  }
}
