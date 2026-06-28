/**
 * Résolveur de secrets coexistant : Bitwarden Secrets Manager (priorité) + fallback `.env`.
 *
 * Utilisation au boot :
 *   await hydrateSecrets();   // lit BW si BWS_ACCESS_TOKEN configuré, sinon no-op
 *   getSecret("STRIPE_SECRET_KEY")  // BW en priorité, sinon process.env, sinon undefined
 *
 * Si BWS_ACCESS_TOKEN est absent (dev/local/staging) → mode .env pur, comportement inchangé.
 * Tout secret présent dans BW **remplace** la valeur .env pour la durée du processus.
 */

let secretCache: Record<string, string> = {};

/**
 * Charge les secrets Bitwarden dans le cache mémoire.
 * No-op si BWS_ACCESS_TOKEN est absent (mode .env pur).
 * Fail-closed si la connexion à Bitwarden échoue.
 */
export async function hydrateSecrets(): Promise<void> {
  const token = process.env.BWS_ACCESS_TOKEN;
  if (!token) return;

  const orgId = process.env.BWS_ORGANIZATION_ID ?? "";

  const { BitwardenClient } = await import("@bitwarden/sdk-napi");
  const client = new BitwardenClient();
  await client.auth().loginAccessToken(token);

  const identifiers = (await client.secrets().list(orgId)).data;
  if (!identifiers.length) return;

  const secrets = (await client.secrets().getByIds(identifiers.map((s) => s.id))).data;
  secretCache = Object.fromEntries(secrets.map((s) => [s.key, s.value]));
  console.warn(`[secrets] ${secrets.length} secret(s) Bitwarden chargé(s)`);
}

/**
 * Retourne la valeur du secret : cache Bitwarden d'abord, sinon process.env[key].
 * Retourne undefined si la clé est absente des deux sources.
 */
export function getSecret(key: string): string | undefined {
  return secretCache[key] ?? process.env[key];
}
