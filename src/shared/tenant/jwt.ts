import { jwtVerify } from "jose";
import type { TokenClaims } from "./tenant-context";

// Vérifie un JWT HS256 et en extrait les claims d'authentification. Le secret est
// INJECTÉ (pas de lecture d'env ici) → fonction pure, testable, découplée du legacy.
// L'algorithme est épinglé (HS256) en défense contre la confusion d'algo / alg:none.
// Retourne null si le token est absent, invalide, expiré, ou de forme inattendue.
export async function verifyAuthToken(
  token: string | undefined | null,
  secret: string,
): Promise<TokenClaims | null> {
  if (!token || !secret) return null;
  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    const userId = payload.userId;
    const email = payload.email;
    if (typeof userId !== "number" || typeof email !== "string") return null;
    return { userId, email };
  } catch {
    return null;
  }
}

// Extrait la valeur d'un cookie d'un header `Cookie` brut, sans dépendance Express.
export function extractTokenFromCookieHeader(
  cookieHeader: string | undefined | null,
  cookieName = "token",
): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    if (name === cookieName) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}
