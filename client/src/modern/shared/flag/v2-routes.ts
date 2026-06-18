// Registre des routes migrées vers le front neuf (`/v2`). Source de vérité de la bascule strangler-fig :
// tant qu'une route legacy n'est PAS listée ici, la bascule la laisse au legacy (intact). À chaque page
// migrée (Vague 1+), on ajoute son entrée `'<chemin legacy>': '<chemin /v2>'`.
export const V2_ROUTES: Readonly<Record<string, string>> = {
  "/": "/v2/home",
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
  "/depenses": "/v2/depenses",
  "/comptabilite": "/v2/comptabilite",
  "/portail-gestion": "/v2/portail-gestion",
  "/budgets-depenses": "/v2/budgets-depenses",
  "/regles-depenses": "/v2/regles-depenses",
  "/historique-emails": "/v2/historique-emails",
  "/support": "/v2/support",
  "/avis": "/v2/avis",
  "/chat": "/v2/chat",
  "/badges": "/v2/badges",
  "/classement": "/v2/classement",
  "/modeles-email": "/v2/modeles-email",
  "/modeles-email-transactionnels": "/v2/modeles-email-transactionnels",
  "/assistant/conversations": "/v2/assistant/conversations",
  "/vehicules": "/v2/vehicules",
  "/rapport-commande": "/v2/rapport-commande",
  "/rapports": "/v2/rapports",
  "/documentation": "/v2/documentation",
  "/ma-vitrine": "/v2/ma-vitrine",
  "/rdv-en-ligne": "/v2/rdv-en-ligne",
  "/alertes-previsions": "/v2/alertes-previsions",
  "/previsions": "/v2/previsions",
  "/performances-fournisseurs": "/v2/performances-fournisseurs",
  "/tableau-bord-depenses": "/v2/tableau-bord-depenses",
  "/import-releve": "/v2/import-releve",
  "/tableau-bord-sync-comptable": "/v2/tableau-bord-sync-comptable",
  "/geolocalisation": "/v2/geolocalisation",
  "/planification": "/v2/planification",
  "/depenses/nouvelle": "/v2/nouvelle-depense",
  "/integrations-comptables": "/v2/integrations-comptables",
  "/analyses-photos": "/v2/analyses-photos",
  "/import": "/v2/import",
  "/devis-ia": "/v2/devis-ia",
  "/chantiers": "/v2/chantiers",
  "/assistant": "/v2/assistant",
  "/clients/nouveau": "/v2/clients/nouveau",
  "/clients/import": "/v2/clients/import",
  "/mobile": "/v2/mobile",
  "/calendrier-chantiers": "/v2/calendrier-chantiers",
  "/signin": "/v2/signin",
  "/sign-in": "/v2/sign-in",
  "/signup": "/v2/signup",
  "/forgot-password": "/v2/forgot-password",
  "/reset-password": "/v2/reset-password",
  "/mentions-legales": "/v2/mentions-legales",
  "/cgu": "/v2/cgu",
  "/cgv": "/v2/cgv",
  "/confidentialite": "/v2/confidentialite",
  "/flotte": "/v2/flotte",
  "/statistiques": "/v2/statistiques",
  "/modules": "/v2/modules",
  "/conges": "/v2/conges",
  "/contrats": "/v2/contrats",
  "/relances": "/v2/relances-devis",
  "/calendrier": "/v2/calendrier",
  "/utilisateurs": "/v2/utilisateurs",
  "/devis-options": "/v2/devis-options",
  "/parametres": "/v2/parametres",
  "/dashboard": "/v2/dashboard",
  "/notes-de-frais": "/v2/notes-frais",
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
