import { jwtVerify, SignJWT } from "jose";
import type { TokenClaims } from "./tenant-context";

/*
 * Émet un JWT HS256 d'authentification (contrepartie de `verifyAuthToken`). Secret INJECTÉ (pas d'env
 * ici) → pur/testable. Algo épinglé HS256, claims `{userId,email}` + expiration (défaut 7 j, parité
 * legacy `createToken`). ⚠️ Utiliser le MÊME secret que le legacy (JWT_SECRET) pendant la transition
 * pour que les tokens soient inter-opérables (legacy ↔ new-stack).
 */
export async function signAuthToken(claims: TokenClaims, secret: string, expiresIn: string | number = "7d"): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ userId: claims.userId, email: claims.email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key);
}

/*
 * Vérifie un JWT HS256 et en extrait les claims d'authentification. Le secret est
 * INJECTÉ (pas de lecture d'env ici) → fonction pure, testable, découplée du legacy.
 * L'algorithme est épinglé (HS256) en défense contre la confusion d'algo / alg:none.
 * Retourne null si le token est absent, invalide, expiré, ou de forme inattendue.
 */
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
    const base: TokenClaims = { userId, email };
    return typeof payload.iat === "number" ? { ...base, iat: payload.iat } : base;
  } catch {
    /* ponytail: best-effort — JWT invalide → null */
    return null;
  }
}

/** Extrait la valeur d'un cookie d'un header `Cookie` brut, sans dépendance Express. */
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
