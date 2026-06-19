/*
 * Navigation UI de l'assistant (outil `naviguer_vers`) — PUR (aucun accès données). Parité legacy
 * `server/_core/assistantTools.ts` : whitelist de pages connues + deep-links `/<ressource>/<id>`. La
 * route SSE consomme `navigate` pour émettre un event au client AVANT de renvoyer le résultat au modèle.
 */

/** Pages connues du front (whitelist stricte — le modèle ne doit JAMAIS inventer un chemin). */
export const VALID_NAV_PAGES: readonly string[] = [
  /** Cœur métier */
  "/dashboard",
  "/clients",
  "/devis",
  "/factures",
  "/interventions",
  "/calendrier",
  "/stocks",
  "/articles",
  "/fournisseurs",
  "/commandes",
  "/contrats",
  /** Compta / dépenses / finances */
  "/comptabilite",
  "/integrations-comptables",
  "/tableau-bord-sync-comptable",
  "/depenses",
  "/notes-de-frais",
  "/tableau-bord-depenses",
  "/import-releve",
  "/budgets-depenses",
  "/regles-depenses",
  /** Chantiers / planification / rentabilité */
  "/chantiers",
  "/calendrier-chantiers",
  "/planification",
  "/previsions",
  "/alertes-previsions",
  /** Équipe / RH / véhicules */
  "/techniciens",
  "/conges",
  "/utilisateurs",
  "/vehicules",
  "/flotte",
  "/geolocalisation",
  "/classement",
  "/badges",
  /** Commercial / IA / relances / avis */
  "/devis-ia",
  "/devis-options",
  "/relances",
  "/avis",
  "/analyses-photos",
  "/rdv-en-ligne",
  /** Stats & rapports */
  "/statistiques",
  "/rapports",
  "/rapport-commande",
  "/performances-fournisseurs",
  /** Vitrine / portail / divers */
  "/ma-vitrine",
  "/portail-gestion",
  "/notifications",
  "/modeles-email",
  "/modeles-email-transactionnels",
  /** Paramétrage / compte */
  "/profil",
  "/parametres",
  "/modules",
  "/import",
  "/documentation",
  "/support",
];

/*
 * Deep-links autorisés : `/<ressource>/<id numérique>` (ouvre la vue détail du document). Pas de
 * `/interventions/:id` côté front → la nav intervention va sur `/interventions` ou `/calendrier`.
 */
export const NAV_DEEP_LINK_RE = /^\/(devis|factures|clients|contrats|commandes)\/\d+$/;

/** La page est-elle une cible de navigation valide (page connue OU deep-link autorisé) ? */
export function isValidNavPage(page: string): boolean {
  return VALID_NAV_PAGES.includes(page) || NAV_DEEP_LINK_RE.test(page);
}

export type NavigationResult =
  | { readonly ok: true; readonly navigate: { page: string; filtre?: string; message?: string }; readonly confirmation: string }
  | { readonly ok: false; readonly error: string };

/*
 * Résout l'intention de navigation (parité legacy `execNaviguerVers`) : valide la page, normalise
 * filtre/message, renvoie le payload `navigate` + une confirmation lisible. Page invalide → erreur.
 */
export function resolveNavigation(input: { page?: unknown; filtre?: unknown; message?: unknown }): NavigationResult {
  const page = String(input?.page ?? "").trim();
  if (!isValidNavPage(page)) {
    return {
      ok: false,
      error: `Page invalide : ${page || "(vide)"}. Utilise une page connue (ex. /devis, /comptabilite, /chantiers) ou un deep-link vers un document existant (/devis/<id>, /factures/<id>, /clients/<id>, /contrats/<id>, /commandes/<id>).`,
    };
  }
  const filtre = input?.filtre ? String(input.filtre).trim() : undefined;
  const message = input?.message ? String(input.message).trim() : undefined;
  return {
    ok: true,
    navigate: { page, filtre, message },
    confirmation: filtre ? `Page ${page} ouverte avec le filtre « ${filtre} »` : `Page ${page} ouverte`,
  };
}
