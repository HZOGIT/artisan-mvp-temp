// Logique PURE du routeur d'ENTRÉE (App.tsx) : classe une location en montage PUBLIC (hors auth) ou route
// AUTHENTIFIÉE. Plus de préfixe /v2 ni de redirections legacy→/v2 (le legacy est mort, routes directes).
// Seule redirection conservée : `/` → `/home` (confort racine). Extrait d'App.tsx pour être testable.

export const ENTRY_REDIRECTS: Record<string, string> = { "/": "/home" };

// Pages PUBLIQUES (hors auth) servies par PublicModernRouterMount — exactes + à paramètre (token/slug).
export const PUBLIC_EXACT = new Set([
  "/home", "/signin", "/sign-in", "/signup", "/forgot-password", "/reset-password",
  "/contact", "/aide", "/guide", "/paiement/succes", "/paiement/annule",
  "/mentions-legales", "/cgu", "/cgv", "/confidentialite",
]);
export const PUBLIC_PARAM_PREFIXES = ["/signature/", "/devis-public/", "/portail/", "/avis/", "/vitrine/"];

export type EntryRoute =
  | { kind: "redirect"; to: string }
  | { kind: "public" }
  | { kind: "auth" };

// Classe une location selon l'ordre : (1) redirection racine, (2) public, (3) authentifié. `search` concaténé.
export function resolveEntryRoute(location: string, search = ""): EntryRoute {
  const redirect = ENTRY_REDIRECTS[location];
  if (redirect) return { kind: "redirect", to: `${redirect}${search}` };
  if (PUBLIC_EXACT.has(location) || PUBLIC_PARAM_PREFIXES.some((p) => location.startsWith(p))) {
    return { kind: "public" };
  }
  return { kind: "auth" };
}
