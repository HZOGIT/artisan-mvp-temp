// Registre des routes migrées vers le front neuf (`/v2`). Source de vérité de la bascule strangler-fig :
// tant qu'une route legacy n'est PAS listée ici, la bascule la laisse au legacy (intact). À chaque page
// migrée (Vague 1+), on ajoute son entrée `'<chemin legacy>': '<chemin /v2>'`.
export const V2_ROUTES: Readonly<Record<string, string>> = {
  "/clients": "/v2/clients",
  "/notifications": "/v2/notifications",
  "/techniciens": "/v2/techniciens",
  "/fournisseurs": "/v2/fournisseurs",
  "/articles": "/v2/articles",
  "/devis": "/v2/devis",
  "/factures": "/v2/factures",
  "/interventions": "/v2/interventions",
  "/commandes": "/v2/commandes",
  "/stocks": "/v2/stocks",
};

// Normalise un chemin pour la résolution : retire la query string et le slash final.
function normalize(pathname: string): string {
  const noQuery = pathname.split("?")[0].split("#")[0];
  const trimmed = noQuery.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

// Renvoie le chemin `/v2` correspondant à une route legacy SI elle est migrée, sinon `null`.
export function resolveV2Path(legacyPath: string): string | null {
  return V2_ROUTES[normalize(legacyPath)] ?? null;
}

// Vrai si le chemin appartient déjà au sous-arbre du front neuf (`/v2` ou `/v2/...`).
export function isV2Path(pathname: string): boolean {
  const p = normalize(pathname);
  return p === "/v2" || p.startsWith("/v2/");
}
