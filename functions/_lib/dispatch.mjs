// Logique de dispatch « edge » pour la Pages Function (JS pur — la Function tourne en JS, pas de
// build TS, donc pas d'import depuis src/**). Tenue synchronisée avec src/interface/gateway via le
// test de parité anti-drift `src/interface/gateway/edge-dispatch.test.ts`.
//
// Décision PAR DOMAINE et GLOBALE (flag NEW_STACK_DOMAINS) : suffisant pour une bascule progressive
// en staging. Le canary par tenant (qui exige l'auth) n'est PAS fait à l'edge — il restera côté
// backend si besoin. Défaut sûr : tout part en legacy tant qu'un domaine n'est pas explicitement migré
// ET activé.

// Domaines portés par le nouveau stack (clés tRPC top-level appelées par le client). == MIGRATED_DOMAINS.
export const MIGRATED = [
  "vehicules", "avis", "badges", "techniciens", "notifications", "fournisseurs", "commandes", "stocks",
  "clients", "interventions", "conges", "notesDeFrais", "chantiers", "depenses", "devis", "factures",
  "ecritures", "articles", "parametres", "modelesEmail", "modelesDevis", "configRelances", "rdvEnLigne",
  "relancesDevis", "categoriesDepenses", "contratsMaintenance", "demandesContact", "budgetsCategories",
  "reglesCategorisation", "previsions",
];
const MIGRATED_SET = new Set(MIGRATED);

const TRPC_PREFIX = "/api/trpc/";

// Domaine d'un chemin tRPC : "/api/trpc/articles.list" → "articles" ; null si hors /api/trpc.
// ⚠️ Batch tRPC ("a.x,b.y") : on lit le préfixe de la 1re procédure → un batch multi-domaines ne peut
// pas être éclaté ; par sûreté il faut éviter le batching client (ou il partira selon son 1er domaine).
export function domainFromTrpcPath(pathname) {
  if (typeof pathname !== "string" || !pathname.startsWith(TRPC_PREFIX)) return null;
  const rest = pathname.slice(TRPC_PREFIX.length);
  const dot = rest.indexOf(".");
  const seg = dot > 0 ? rest.slice(0, dot) : rest;
  return seg || null;
}

// Domaines activés globalement via l'env de la Pages Function : NEW_STACK_DOMAINS="articles,clients".
export function enabledDomains(env) {
  const raw = (env && env.NEW_STACK_DOMAINS) || "";
  return new Set(String(raw).split(",").map((s) => s.trim()).filter(Boolean));
}

// Cible de dispatch : "new-stack" (domaine migré ET activé) ou "legacy" (défaut sûr).
export function decideTarget(pathname, env) {
  const domain = domainFromTrpcPath(pathname);
  if (!domain) return "legacy";
  if (!MIGRATED_SET.has(domain)) return "legacy";
  return enabledDomains(env).has(domain) ? "new-stack" : "legacy";
}
