// Registre des routes HORS-tRPC migrées et servies par le new-stack (le jeton/chemin EST la capacité,
// pas de cookie tenant). Source de vérité côté src, mirroir-ée par l'edge (`functions/_lib/dispatch.mjs`
// MIGRATED_ROUTES), verrouillée par `edge-dispatch.test.ts`. On n'y inscrit une route qu'une fois
// portée en Fastify (`src/**`) ET déployée sur le backend new-stack.
export interface MigratedRoute {
  readonly name: string;
  readonly pattern: RegExp;
}

export const MIGRATED_ROUTES: readonly MigratedRoute[] = [
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
  // Export en lot des XML CII Factur-X d'une période (`/api/comptabilite/export-facturx-lot`, ZIP, auth cookie).
  { name: "export-facturx-lot", pattern: /^\/api\/comptabilite\/export-facturx-lot$/ },
  // Export en lot des PDF facture d'une période (`/api/comptabilite/export-pdf-lot`, ZIP, auth cookie).
  { name: "export-pdf-lot", pattern: /^\/api\/comptabilite\/export-pdf-lot$/ },
];

// Le chemin correspond-il à une route HORS-tRPC migrée (→ new-stack) ?
export function matchesMigratedRoute(pathname: string): boolean {
  return MIGRATED_ROUTES.some((r) => r.pattern.test(pathname));
}
