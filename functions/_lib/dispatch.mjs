// Logique de dispatch « edge » pour la Pages Function (JS pur — la Function tourne en JS, pas de
// build TS, donc pas d'import depuis src/**). Tenue synchronisée avec src/interface/gateway via le
// test de parité anti-drift `src/interface/gateway/edge-dispatch.test.ts`.
//
// Décision PAR DOMAINE et GLOBALE : un domaine migré + activé est servi par le nouveau stack, sinon
// legacy. Défaut sûr : tout domaine NON activé part en legacy. La liste `DEFAULT_ENABLED` active la
// bascule réelle du trafic en staging dès le déploiement (pas besoin de variable d'env) ; elle ne
// contient que des domaines à **parité de surface vérifiée** (le nouveau stack expose toutes les
// procédures appelées par le client). `NEW_STACK_DOMAINS` peut en ajouter d'autres ponctuellement.

// Domaines portés par le nouveau stack (clés tRPC top-level appelées par le client). == MIGRATED_DOMAINS.
export const MIGRATED = [
  "vehicules", "avis", "badges", "techniciens", "notifications", "fournisseurs", "commandesFournisseurs", "stocks",
  "clients", "interventions", "conges", "notesDeFrais", "chantiers", "depenses", "devis", "factures",
  "ecritures", "articles", "parametres", "modelesEmail", "modelesDevis", "configRelances", "rdv",
  "relances", "categoriesDepenses", "contrats", "demandesContact", "budgetsCategories",
  "reglesCategorisation", "previsions", "artisan", "devisOptions", "activites", "modules", "statistiques", "calendrier", "emails", "search", "geolocalisation", "dashboard", "rapports", "utilisateurs", "comptabilite", "auth", "subscription", "signature", "conseilsIA", "assistant", "chat",
];
const MIGRATED_SET = new Set(MIGRATED);

// Domaines servis par défaut par le nouveau stack en staging. == STAGING_NEW_STACK_DEFAULT_DOMAINS
// (src/interface/gateway/migrated-domains.ts). Parité de surface vérifiée (diff appels client vs
// procédures montées). On élargit cette liste domaine par domaine au fil de la parité.
export const DEFAULT_ENABLED = [
  "vehicules", "notifications", "fournisseurs", "parametres", "modelesEmail", "relances", "conges", "badges", "stocks", "techniciens", "rdv", "clients", "factures", "contrats", "commandesFournisseurs", "devis", "avis", "interventions", "chantiers", "articles", "previsions", "depenses", "artisan", "devisOptions", "activites", "modules", "statistiques", "calendrier", "emails", "search", "geolocalisation", "dashboard", "rapports", "utilisateurs", "comptabilite", "auth", "subscription", "signature", "conseilsIA", "assistant", "chat",
];

const TRPC_PREFIX = "/api/trpc/";

// Routes HORS-tRPC migrées ET servies par le new-stack (le jeton/chemin EST la capacité — pas de
// cookie tenant). On n'y inscrit une route qu'une fois portée dans `src/**` ET déployée sur le
// backend new-stack. Mirroir-é par `src/interface/gateway/migrated-routes.ts` (parité `edge-dispatch.test`).
export const MIGRATED_ROUTES = [
  // Flux iCal public d'abonnement au calendrier des interventions (`/api/calendar/:token.ics`).
  { name: "ical", pattern: /^\/api\/calendar\/.+\.ics$/ },
  // Webhook Stripe signé (`/api/stripe/webhook`) — vérif signature fail-closed + sync subscriptions/factures.
  { name: "stripe-webhook", pattern: /^\/api\/stripe\/webhook$/ },
  // Upload/suppression du logo artisan (`/api/upload-logo`, auth cookie JWT).
  { name: "upload-logo", pattern: /^\/api\/upload-logo$/ },
  // Export FEC opposable (`/api/comptabilite/fec`, auth cookie JWT, Σdébit=Σcrédit).
  { name: "comptabilite-fec", pattern: /^\/api\/comptabilite\/fec$/ },
  // Export CSV des factures (`/api/comptabilite/export-csv`, auth cookie JWT, anti-injection CSV).
  { name: "comptabilite-csv", pattern: /^\/api\/comptabilite\/export-csv$/ },
  // Statut de paiement d'une facture (`/api/paiement/status/:factureId`, public par token portail).
  { name: "paiement-status", pattern: /^\/api\/paiement\/status\/[^/]+$/ },
  // Ouverture d'un Checkout Stripe pour payer une facture (`/api/paiement/create-checkout-session`).
  { name: "paiement-checkout", pattern: /^\/api\/paiement\/create-checkout-session$/ },
  // Recherche publique du catalogue de référence (`/api/articles/search`, sans auth, catalogue global).
  { name: "articles-search", pattern: /^\/api\/articles\/search$/ },
  // Persistance des transcripts de la session vocale (`/api/voice/persist`, auth cookie JWT).
  { name: "voice-persist", pattern: /^\/api\/voice\/persist$/ },
  // Assistant IA AGENTIQUE en streaming SSE (`/api/assistant/stream`, auth cookie JWT, function-calling).
  { name: "assistant-stream", pattern: /^\/api\/assistant\/stream$/ },
  // Exécution d'UN outil de la session vocale Live (`/api/voice/tool`, auth cookie JWT).
  { name: "voice-tool", pattern: /^\/api\/voice\/tool$/ },
  // Mint d'un token éphémère pour la session vocale Live (`/api/voice/token`, auth cookie JWT, Gemini Live).
  { name: "voice-token", pattern: /^\/api\/voice\/token$/ },
  // PDF d'un bon de commande fournisseur (`/api/commandes-fournisseurs/:id/pdf`, auth cookie JWT, jsPDF).
  { name: "commande-pdf", pattern: /^\/api\/commandes-fournisseurs\/[^/]+\/pdf$/ },
  // PDF d'un contrat de maintenance (`/api/contrats/:id/pdf`, auth cookie JWT, jsPDF).
  { name: "contrat-pdf", pattern: /^\/api\/contrats\/[^/]+\/pdf$/ },
  // Bon d'intervention en PDF (`/api/interventions/:id/bon-pdf`, auth cookie JWT, jsPDF).
  { name: "intervention-bon-pdf", pattern: /^\/api\/interventions\/[^/]+\/bon-pdf$/ },
  // PDF d'un devis depuis le portail client (`/api/portail/:token/devis/:id/pdf`, PUBLIC par token, jsPDF).
  { name: "portail-devis-pdf", pattern: /^\/api\/portail\/[^/]+\/devis\/[^/]+\/pdf$/ },
  // PDF d'une facture depuis le portail client (`/api/portail/:token/factures/:id/pdf`, PUBLIC par token, jsPDF).
  { name: "portail-facture-pdf", pattern: /^\/api\/portail\/[^/]+\/factures\/[^/]+\/pdf$/ },
  // Factur-X XML CII d'une facture (`/api/comptabilite/facturx-xml/:id`, auth cookie JWT, EN 16931).
  { name: "facturx-xml", pattern: /^\/api\/comptabilite\/facturx-xml\/[^/]+$/ },
  // PDF Factur-X d'une facture (`/api/comptabilite/facturx/:id`, auth cookie JWT, jsPDF).
  { name: "facturx-pdf", pattern: /^\/api\/comptabilite\/facturx\/[^/]+$/ },
];

// Le chemin correspond-il à une route HORS-tRPC migrée (→ new-stack) ?
export function matchesMigratedRoute(pathname) {
  return typeof pathname === "string" && MIGRATED_ROUTES.some((r) => r.pattern.test(pathname));
}

// Domaines d'un chemin tRPC, BATCH inclus : "/api/trpc/a.list,b.get" → ["a","b"]. tRPC `httpBatchLink`
// concatène les procédures d'un même tick par des virgules. Renvoie [] hors /api/trpc.
export function domainsFromTrpcPath(pathname) {
  if (typeof pathname !== "string" || !pathname.startsWith(TRPC_PREFIX)) return [];
  const rest = pathname.slice(TRPC_PREFIX.length);
  const domains = [];
  for (const segment of rest.split(",")) {
    const dot = segment.indexOf(".");
    const domain = dot > 0 ? segment.slice(0, dot) : segment;
    const trimmed = (domain || "").trim();
    if (trimmed && !domains.includes(trimmed)) domains.push(trimmed);
  }
  return domains;
}

// Domaine de la 1re procédure (compat). Préférer domainsFromTrpcPath pour la décision.
export function domainFromTrpcPath(pathname) {
  return domainsFromTrpcPath(pathname)[0] ?? null;
}

// Domaines activés : DEFAULT_ENABLED (code) ∪ NEW_STACK_DOMAINS (env de la Pages Function).
export function enabledDomains(env) {
  const raw = (env && env.NEW_STACK_DOMAINS) || "";
  const fromEnv = String(raw).split(",").map((s) => s.trim()).filter(Boolean);
  return new Set([...DEFAULT_ENABLED, ...fromEnv]);
}

// Cible de dispatch : "new-stack" SEULEMENT si le chemin cible au moins un domaine ET que TOUS les
// domaines (batch inclus) sont migrés ET activés. Sinon "legacy" (défaut sûr, sert tout) → un batch
// mêlant un domaine activé et un domaine legacy part en legacy (jamais de procédure manquante).
export function decideTarget(pathname, env) {
  // Routes HORS-tRPC migrées (ex. flux iCal public) → new-stack, indépendamment des domaines tRPC.
  if (matchesMigratedRoute(pathname)) return "new-stack";
  const domains = domainsFromTrpcPath(pathname);
  if (domains.length === 0) return "legacy";
  const enabled = enabledDomains(env);
  const allOnNewStack = domains.every((d) => MIGRATED_SET.has(d) && enabled.has(d));
  return allOnNewStack ? "new-stack" : "legacy";
}
