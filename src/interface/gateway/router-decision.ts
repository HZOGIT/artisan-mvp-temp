import type { FeatureFlags } from "./flags";

// Décide si une requête d'un domaine donné doit être routée vers le NOUVEAU stack
// (true) ou rester sur le legacy (false). OFF PAR DÉFAUT : sans flag explicite, legacy.
// Ordre des règles : denylist (rollback ciblé) > enabled global > allowlist (canary).
export function shouldRouteToNewStack(
  domain: string,
  tenantId: number | undefined,
  flags: FeatureFlags,
): boolean {
  const flag = flags[domain];
  if (!flag) return false;
  if (tenantId !== undefined && flag.tenantDenylist?.includes(tenantId)) return false;
  if (flag.enabled) return true;
  if (tenantId !== undefined && flag.tenantAllowlist?.includes(tenantId)) return true;
  return false;
}

// Alias métier : un domaine est-il « migré » (servi par le nouveau stack) pour ce tenant ?
// Même logique que shouldRouteToNewStack, nommage consommable par le flag store.
export function isMigrated(domain: string, artisanId: number | undefined, flags: FeatureFlags): boolean {
  return shouldRouteToNewStack(domain, artisanId, flags);
}

// Extrait le domaine d'un chemin tRPC : "vehicules.list" → "vehicules".
// Renvoie null si le chemin n'a pas de préfixe de domaine.
export function domainFromTrpcPath(path: string): string | null {
  const trimmed = path.replace(/^\/+/, "");
  const dot = trimmed.indexOf(".");
  if (dot <= 0) return null;
  return trimmed.slice(0, dot);
}
