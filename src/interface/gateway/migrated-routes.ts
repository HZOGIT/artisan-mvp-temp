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
];

// Le chemin correspond-il à une route HORS-tRPC migrée (→ new-stack) ?
export function matchesMigratedRoute(pathname: string): boolean {
  return MIGRATED_ROUTES.some((r) => r.pattern.test(pathname));
}
