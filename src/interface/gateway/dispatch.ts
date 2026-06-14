import type { FeatureFlags } from "./flags";
import { domainFromTrpcPath, shouldRouteToNewStack } from "./router-decision";
import { isMigratedDomainAvailable } from "./migrated-domains";

// Cible de dispatch d'une requête : le nouveau stack clean-archi ou le legacy.
export type DispatchTarget = "new-stack" | "legacy";

// Résout, pour une requête tRPC, quel stack doit la traiter — **composition pure** des briques du
// gateway (extraction du domaine + registre des domaines portés + décision de flag). C'est l'unité de
// décision qu'un dispatcher runtime (middleware/edge/reverse-proxy) consommera au cutover ; elle ne
// fait aucune I/O.
//
// Règles (sûres par défaut → legacy) :
//   1. chemin sans préfixe de domaine (`health`, `whoami`, racine) → **legacy** (servi par les deux ;
//      on ne détourne pas les utilitaires transverses) ;
//   2. domaine non porté par le nouveau stack (absent de `MIGRATED_DOMAINS`) → **legacy** (le nouveau
//      stack ne saurait pas le servir) ;
//   3. domaine porté → décision de flag `shouldRouteToNewStack` (OFF par défaut) → new-stack | legacy.
//
// ⚠️ Requêtes tRPC **batchées** (`a.proc,b.proc`) : `domainFromTrpcPath` lit le préfixe de la 1re
// procédure ; un batch mêlant des domaines de stacks différents ne peut pas être éclaté → préférer
// désactiver le batching côté client/edge, ou router le batch en legacy. Cf. runbook (§ Gap).
export function resolveDispatchTarget(
  trpcPath: string,
  tenantId: number | undefined,
  flags: FeatureFlags,
): DispatchTarget {
  const domain = domainFromTrpcPath(trpcPath);
  if (!domain) return "legacy";
  if (!isMigratedDomainAvailable(domain)) return "legacy";
  return shouldRouteToNewStack(domain, tenantId, flags) ? "new-stack" : "legacy";
}

// Helper booléen équivalent (lisibilité côté appelant).
export function dispatchesToNewStack(trpcPath: string, tenantId: number | undefined, flags: FeatureFlags): boolean {
  return resolveDispatchTarget(trpcPath, tenantId, flags) === "new-stack";
}
