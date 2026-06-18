// Logique PURE du routeur d'ENTRÉE (App.tsx, sans wouter) : classe une location en redirection legacy→/v2,
// montage public /v2, ou route authentifiée. Extrait d'App.tsx pour être testable (anti-régression du routeur).

export const ENTRY_REDIRECTS: Record<string, string> = {
  "/": "/v2/home", "/signin": "/v2/signin", "/sign-in": "/v2/sign-in", "/signup": "/v2/signup",
  "/forgot-password": "/v2/forgot-password", "/reset-password": "/v2/reset-password",
  "/contact": "/v2/contact", "/aide": "/v2/aide", "/guide": "/v2/guide",
  "/paiement/succes": "/v2/paiement/succes", "/paiement/annule": "/v2/paiement/annule",
  "/mentions-legales": "/v2/mentions-legales", "/cgu": "/v2/cgu", "/cgv": "/v2/cgv", "/confidentialite": "/v2/confidentialite",
};
const PARAM_REDIRECTS: { re: RegExp; to: string }[] = [
  { re: /^\/(signature|devis-public|portail|avis)\/(.+)$/, to: "/v2/$1/$2" },
  { re: /^\/vitrine\/(.+)$/, to: "/v2/vitrine/$1" },
];
export const PUBLIC_V2_EXACT = new Set([
  "/v2/contact", "/v2/aide", "/v2/guide", "/v2/paiement/succes", "/v2/paiement/annule", "/v2/home",
  "/v2/signin", "/v2/sign-in", "/v2/signup", "/v2/forgot-password", "/v2/reset-password",
  "/v2/mentions-legales", "/v2/cgu", "/v2/cgv", "/v2/confidentialite",
]);
export const PUBLIC_V2_PARAM_PREFIXES = ["/v2/signature/", "/v2/devis-public/", "/v2/portail/", "/v2/avis/", "/v2/vitrine/"];

export type EntryRoute =
  | { kind: "redirect"; to: string }
  | { kind: "public" }
  | { kind: "auth" };

// Classe une location (sans la query) selon l'ordre de l'ancien Switch wouter. `search` est concaténé aux redirects.
export function resolveEntryRoute(location: string, search = ""): EntryRoute {
  const exact = ENTRY_REDIRECTS[location];
  if (exact) return { kind: "redirect", to: `${exact}${search}` };
  for (const { re, to } of PARAM_REDIRECTS) {
    if (re.test(location)) return { kind: "redirect", to: `${location.replace(re, to)}${search}` };
  }
  if (PUBLIC_V2_EXACT.has(location) || PUBLIC_V2_PARAM_PREFIXES.some((p) => location.startsWith(p))) {
    return { kind: "public" };
  }
  return { kind: "auth" };
}
