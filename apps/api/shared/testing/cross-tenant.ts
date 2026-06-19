/*
 * Harnais d'isolation cross-tenant réutilisable par tous les domaines.
 * 
 * Idée : pour un accès « par id » (ou une liste) effectué EN TANT QUE tenant A sur une
 * ressource appartenant au tenant B, l'accès doit être refusé — sans révéler la ressource.
 * Un refus valide = soit une erreur de refus (NOT_FOUND / FORBIDDEN / non authentifié /
 * tenant manquant), soit un résultat vide (null / undefined / tableau vide). Toute autre
 * issue (renvoi de la ressource) est une FUITE cross-tenant et fait échouer le test.
 */

const DENIAL_NAMES = new Set([
  "NotFoundError",
  "ForbiddenError",
  "UnauthenticatedError",
  "MissingTenantError",
  "TRPCError",
]);
const DENIAL_CODES = new Set(["NOT_FOUND", "FORBIDDEN", "UNAUTHORIZED", "UNAUTHENTICATED"]);

export function isCrossTenantDenial(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: unknown; code?: unknown };
  if (typeof e.name === "string" && DENIAL_NAMES.has(e.name)) return true;
  if (e.code !== undefined && DENIAL_CODES.has(String(e.code))) return true;
  return false;
}

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || (Array.isArray(value) && value.length === 0);
}

/*
 * Exécute `action` (un accès cross-tenant qui DEVRAIT être refusé) et vérifie qu'il ne
 * fuit aucune ressource. Lève une erreur explicite en cas de fuite ou d'erreur inattendue.
 */
export async function expectCrossTenantDenied(action: () => Promise<unknown>): Promise<void> {
  let result: unknown;
  try {
    result = await action();
  } catch (err) {
    if (isCrossTenantDenial(err)) return;
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    throw new Error(`Accès cross-tenant rejeté par une erreur INATTENDUE (ni NOT_FOUND/FORBIDDEN) : ${msg}`);
  }
  if (isEmpty(result)) return;
  throw new Error(
    `FUITE CROSS-TENANT : l'accès aurait dû être refusé mais a renvoyé une ressource : ${safeStringify(result)}`,
  );
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
