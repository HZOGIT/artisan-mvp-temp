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
  "/devis/nouveau": "/v2/devis/nouveau",
  "/factures": "/v2/factures",
  "/interventions": "/v2/interventions",
  "/commandes": "/v2/commandes",
  "/commandes/nouvelle": "/v2/commandes/nouvelle",
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
  "/profil": "/v2/profil",
  "/contact": "/v2/contact",
  "/aide": "/v2/aide",
  "/guide": "/v2/guide",
  "/relances": "/v2/relances-devis",
  "/calendrier": "/v2/calendrier",
  "/utilisateurs": "/v2/utilisateurs",
  "/devis-options": "/v2/devis-options",
  "/parametres": "/v2/parametres",
  "/dashboard": "/v2/dashboard",
  "/notes-de-frais": "/v2/notes-frais",
};

// Routes À PARAMÈTRE migrées (le lookup exact de `V2_ROUTES` ne les couvre pas). `:x` = un segment quelconque.
// Le matching exige le MÊME nombre de segments → pas de collision entre `/devis/:id` et `/devis/:id/ligne/nouvelle`,
// et les chemins statiques (`/devis/nouveau`, `/clients/import`…) sont résolus AVANT via `V2_ROUTES` (priorité exacte).
const V2_PARAM_ROUTES: ReadonlyArray<{ legacy: string; v2: string }> = [
  { legacy: "/devis/:id/ligne/nouvelle", v2: "/v2/devis/:id/ligne/nouvelle" },
  { legacy: "/commandes/:id/modifier", v2: "/v2/commandes/:id/modifier" },
  { legacy: "/clients/:id", v2: "/v2/clients/:id" },
  { legacy: "/devis/:id", v2: "/v2/devis/:id" },
  { legacy: "/factures/:id", v2: "/v2/factures/:id" },
  { legacy: "/contrats/:id", v2: "/v2/contrats/:id" },
  { legacy: "/commandes/:id", v2: "/v2/commandes/:id" },
];

// Normalise un chemin pour la résolution : retire la query string et le slash final.
function normalize(pathname: string): string {
  const noQuery = pathname.split("?")[0].split("#")[0];
  const trimmed = noQuery.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

// Tente de faire correspondre un chemin à une route à paramètre migrée → chemin `/v2` substitué, sinon `null`. PUR.
function matchParamRoute(path: string): string | null {
  const segs = path.split("/").filter(Boolean);
  for (const { legacy, v2 } of V2_PARAM_ROUTES) {
    const lsegs = legacy.split("/").filter(Boolean);
    if (lsegs.length !== segs.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < lsegs.length; i++) {
      if (lsegs[i].startsWith(":")) { if (!segs[i]) { ok = false; break; } params[lsegs[i].slice(1)] = segs[i]; }
      else if (lsegs[i] !== segs[i]) { ok = false; break; }
    }
    if (!ok) continue;
    let out = v2;
    for (const [k, val] of Object.entries(params)) out = out.replace(`:${k}`, val);
    return out;
  }
  return null;
}

// Renvoie le chemin `/v2` correspondant à une route legacy SI elle est migrée, sinon `null`. Essaie d'abord le
// registre EXACT (`V2_ROUTES`, priorité aux chemins statiques) puis les routes à paramètre (`V2_PARAM_ROUTES`).
export function resolveV2Path(legacyPath: string): string | null {
  const p = normalize(legacyPath);
  return V2_ROUTES[p] ?? matchParamRoute(p) ?? null;
}

// Vrai si le chemin appartient déjà au sous-arbre du front neuf (`/v2` ou `/v2/...`).
export function isV2Path(pathname: string): boolean {
  const p = normalize(pathname);
  return p === "/v2" || p.startsWith("/v2/");
}

// Résout une URL (chemin + query/hash) vers /v2 en PRÉSERVANT la query/hash. Utilisé pour les liens fournis par
// le backend (notif.lien, action assistant) qui sont des chemins LEGACY : `resolveV2Path` seul stripperait la query.
export function resolveV2Url(url: string): string {
  const qIdx = url.search(/[?#]/);
  const path = qIdx === -1 ? url : url.slice(0, qIdx);
  const rest = qIdx === -1 ? "" : url.slice(qIdx);
  return `${resolveV2Path(path) ?? path}${rest}`;
}
