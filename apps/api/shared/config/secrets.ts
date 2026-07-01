/**
 * Résolveur de secrets multi-providers, async + fallback cache.
 *
 * Séquence au boot :
 *   await hydrateSecrets();          // provider.load() BLOQUANT (sans timeout) → réchauffe le cache
 *   getSecretSync("DATABASE_URL")    // lecture SYNCHRONE du cache chaud (infra/boot, singletons)
 *   await getSecret("STRIPE_...")    // lecture LIVE avec timeout + fallback (re-lectures runtime)
 *
 * Sélection du provider (SECRETS_PROVIDER=ovh|bitwarden|env, sinon auto par credentials présentes) :
 *   ovh (prod) → bitwarden (alternative) → process.env (défaut dev/staging).
 *
 * Sémantique fail-closed : le provider actif est la SEULE source autoritaire. En cas de timeout
 * ou d'erreur, on retombe sur le CACHE (chaud via load()), JAMAIS sur `process.env`. Un secret
 * absent du provider ET du cache → `undefined` (misconfig visible en prod, pas masqué par une
 * valeur d'env résiduelle). `process.env` n'est lu QUE par ProcessDotEnvSecretProvider (son magasin)
 * et pour les credentials d'amorçage du vault (BWS_ACCESS_TOKEN / OVH_* / SECRETS_PROVIDER).
 */
import type { SecretProvider } from "./providers/secret-provider";
import { OvhSecretsManagerProvider } from "./providers/ovh-secrets-manager-provider";
import { BitwardenSecretProvider } from "./providers/bitwarden-secret-provider";
import { ProcessDotEnvSecretProvider } from "./providers/process-dot-env-secret-provider";

let secretCache: Record<string, string> = {};

let providerInstance: SecretProvider | null = null;

function selectProvider(): SecretProvider {
  const explicit = process.env.SECRETS_PROVIDER;
  if (explicit === "ovh") return new OvhSecretsManagerProvider();
  if (explicit === "bitwarden") return new BitwardenSecretProvider();
  if (explicit === "env") return new ProcessDotEnvSecretProvider();
  if (process.env.OVH_SECRET_MANAGER_TOKEN) return new OvhSecretsManagerProvider();
  if (process.env.BWS_ACCESS_TOKEN) return new BitwardenSecretProvider();
  return new ProcessDotEnvSecretProvider();
}

function provider(): SecretProvider {
  if (!providerInstance) providerInstance = selectProvider();
  return providerInstance;
}

const DEFAULT_GET_TIMEOUT_MS = 300;
function getTimeoutMs(): number {
  const raw = Number(process.env.SECRET_GET_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_GET_TIMEOUT_MS;
}

/** Fallback : le CACHE chaud (hydraté au boot / write-through), jamais process.env. */
function cached(key: string): string | undefined {
  return secretCache[key];
}

/**
 * Réchauffe le cache au boot via `provider().load()`. BLOQUANT et SANS timeout : les lectures de
 * config de boot (getSecretSync) lisent ce cache chaud. Fail-closed si le provider échoue.
 */
export async function hydrateSecrets(): Promise<void> {
  const loaded = await provider().load();
  const count = Object.keys(loaded).length;
  if (count) {
    secretCache = { ...secretCache, ...loaded };
    console.warn(`[secrets] ${count} secret(s) chargé(s) via ${provider().name}`);
  }
}

const TIMEOUT = Symbol("secret-get-timeout");

/**
 * Valeur LIVE du secret chez le provider, avec garde-fou. Course `provider().get(key)` contre
 * `SECRET_GET_TIMEOUT_MS` (défaut 300 ms) : résout à temps → rafraîchit le cache + renvoie la
 * valeur live ; timeout OU erreur → renvoie la valeur du CACHE (jamais process.env). Absent du
 * provider ET du cache → undefined (fail-closed).
 *
 * ponytail: live-get à CHAQUE lecture ; si le rate-limit du coffre devient un souci, ajouter un
 * cache TTL court en amont (YAGNI pour l'instant). Pour les lectures de boot / singletons mémoïsés,
 * préférer getSecretSync (cache chaud, pas de course).
 */
export async function getSecret(key: string): Promise<string | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<typeof TIMEOUT>((resolve) => {
      timer = setTimeout(() => resolve(TIMEOUT), getTimeoutMs());
    });
    const result = await Promise.race([provider().get(key), timeout]);
    if (result === TIMEOUT) return cached(key);
    if (result !== undefined) {
      secretCache[key] = result;
      return result;
    }
    return cached(key);
  } catch {
    /* ponytail: erreur provider (réseau/coffre) → fallback cache, jamais process.env (fail-closed) */
    return cached(key);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Lecture SYNCHRONE du cache chaud (hydraté au boot via provider.load(), + write-through). Pas de
 * course live-provider, pas de lecture process.env. Réservé aux lectures de boot et aux singletons
 * mémoïsés (URLs DB, credentials d'infra) où une valeur live n'apporte rien et où rendre l'appelant
 * async ripplerait des centaines de sites (getDbHandle, etc.).
 */
export function getSecretSync(key: string): string | undefined {
  return cached(key);
}

/** Écrit le secret dans le provider primaire, puis write-through cache (valeur live immédiate). */
export async function setSecret(key: string, value: string): Promise<void> {
  await provider().set(key, value);
  secretCache[key] = value;
}

/** Signing secret dédié de l'endpoint webhook Connect (connect=true). Lecture cache chaud au boot. */
export const getStripeConnectWebhookSecret = (): string | undefined =>
  getSecretSync("STRIPE_CONNECT_WEBHOOK_SECRET");
