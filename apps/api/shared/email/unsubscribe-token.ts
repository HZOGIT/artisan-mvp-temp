import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Génère un token de désinscription signé : base64url(email) + "." + HMAC-SHA256(email, secret).
 * Déterministe pour un email+secret donné — pas d'expiration (le désabonnement est permanent).
 */
export function signUnsubscribeToken(email: string, secret: string): string {
  const emailB64 = Buffer.from(email).toString("base64url");
  const sig = createHmac("sha256", secret).update(email).digest("base64url");
  return `${emailB64}.${sig}`;
}

/** Vérifie le token et renvoie l'email s'il est valide, sinon null. */
export function verifyUnsubscribeToken(token: string, secret: string): string | null {
  const dotIdx = token.indexOf(".");
  if (dotIdx === -1) return null;
  const emailB64 = token.slice(0, dotIdx);
  const providedSig = token.slice(dotIdx + 1);
  let email: string;
  try {
    email = Buffer.from(emailB64, "base64url").toString("utf8");
  } catch {
    /* ponytail: best-effort — base64 invalide → null */
    return null;
  }
  if (!email) return null;
  const expectedSig = createHmac("sha256", secret).update(email).digest("base64url");
  try {
    if (!timingSafeEqual(Buffer.from(providedSig), Buffer.from(expectedSig))) return null;
  } catch {
    /* ponytail: best-effort — timingSafeEqual impossible → null */
    return null;
  }
  return email;
}
