import type { FastifyReply } from "fastify";

/*
 * Gestion du cookie d'authentification `token` (httpOnly), parité legacy `setAuthCookie`/`clearAuthCookie`.
 * Nécessite `@fastify/cookie` enregistré (cf. buildApp). `secure` actif en production uniquement (HTTPS).
 */
export const AUTH_COOKIE_NAME = "token";
/** 7 jours (cohérent avec l'expiration du JWT) */
export const AUTH_COOKIE_MAX_AGE_S = 7 * 24 * 60 * 60;

function baseOptions(): { httpOnly: true; secure: boolean; sameSite: "lax"; path: string } {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" };
}

/** Pose le cookie `token` (httpOnly, secure en prod, sameSite=lax, path=/, maxAge 7 j). */
export function setAuthCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(AUTH_COOKIE_NAME, token, { ...baseOptions(), maxAge: AUTH_COOKIE_MAX_AGE_S });
}

/** Efface le cookie `token` (mêmes attributs que la pose, sans maxAge). */
export function clearAuthCookie(reply: FastifyReply): void {
  reply.clearCookie(AUTH_COOKIE_NAME, baseOptions());
}
