/*
 * Couche DOMAIN de la feature `auth` (pages publiques connexion/inscription/mot de passe). Règles de
 * validation PURES et testables ; renvoient une clé i18n d'erreur (ou null si OK). 0 React/tRPC.
 */

export const MIN_PASSWORD = 6;

/** Validation du formulaire de connexion. PUR. */
export function validateSignin(email: string, password: string): string | null {
  if (!email || !password) return "errChamps";
  return null;
}

/** Validation de l'inscription (champs requis + concordance + longueur min). PUR. */
export function validateSignup(email: string, password: string, confirm: string): string | null {
  if (!email || !password || !confirm) return "errChamps";
  if (password !== confirm) return "errMatch";
  if (password.length < MIN_PASSWORD) return "errLen";
  return null;
}

/** Validation de la réinitialisation (longueur min + concordance). PUR. */
export function validateReset(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD) return "errLen";
  if (password !== confirm) return "errMatch";
  return null;
}

/** Jeton de réinitialisation extrait d'une query string (`?token=…`). PUR. */
export function tokenFromSearch(search: string): string {
  return new URLSearchParams(search).get("token") || "";
}
