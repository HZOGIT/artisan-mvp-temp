/*
 * Catalogue d'outils de l'assistant agentique — PUR et neutre (aucune dépendance provider).
 * 
 * Le legacy (`server/_core/assistantTools.ts`) déclare ces outils en `FunctionDeclaration`
 * `@google/genai` (`Type.OBJECT`, …). Pour garder le domaine indépendant du provider, on les
 * redéclare ici avec un type `ToolSchema` neutre (chaînes `"object" | "string" | …`). Un mapper
 * côté adapter (infra) traduit `ToolSchema` → schéma Gemini. **Noms + descriptions + paramètres
 * doivent rester identiques au legacy** : le comportement du modèle en dépend (parité agentique).
 */

/** Type d'un paramètre d'outil (sous-ensemble JSON-Schema commun à Gemini/OpenAI). */
export type ToolParamType = "object" | "string" | "number" | "boolean" | "array";

export interface ToolParamSchema {
  readonly type: ToolParamType;
  readonly description?: string;
  readonly properties?: Record<string, ToolParamSchema>;
  readonly items?: ToolParamSchema;
  readonly required?: readonly string[];
}

/** Attributs de l'utilisateur utilisés pour filtrer le catalogue d'outils par profil. */
export type ToolContext = { readonly isAdmin: boolean };

/** Déclaration d'un outil exposé au modèle (function-calling). `parameters` a toujours un objet racine. */
export interface ToolSchema {
  readonly name: string;
  readonly description: string;
  readonly parameters: ToolParamSchema;
  /** Prédicat d'activation — absent = accessible à tous (rétrocompat). */
  readonly enabledFor?: (ctx: ToolContext) => boolean;
}

/** Helpers de construction (concision sans perte de fidélité au schéma legacy). */
const str = (description?: string): ToolParamSchema => ({ type: "string", ...(description ? { description } : {}) });
const num = (description?: string): ToolParamSchema => ({ type: "number", ...(description ? { description } : {}) });
const obj = (properties: Record<string, ToolParamSchema>, required?: readonly string[]): ToolParamSchema => ({
  type: "object",
  properties,
  ...(required ? { required } : {}),
});
const arr = (items: ToolParamSchema, description?: string): ToolParamSchema => ({
  type: "array",
  items,
  ...(description ? { description } : {}),
});

/** Ligne de devis/facture (designation/quantite/prixUnitaireHT requis). */
const ligneVente = obj(
  {
    designation: str(),
    quantite: num(),
    unite: str("Ex: u, h, m, m², forfait"),
    prixUnitaireHT: num(),
    tauxTVA: num("En pourcentage, ex: 20"),
    tvaCategorieId: str('"FR_20"|"FR_10"|"FR_5_5"|"FR_2_1"|"FR_FRANCHISE"|"FR_EXONERE"|"FR_AUTO"'),
  },
  ["designation", "quantite", "prixUnitaireHT"],
);
/** Ligne de devis/facture sans description d'unité (variante creer_et_envoyer_devis / creer_facture). */
const ligneVenteSimple = obj(
  { designation: str(), quantite: num(), unite: str(), prixUnitaireHT: num(), tauxTVA: num(), tvaCategorieId: str() },
  ["designation", "quantite", "prixUnitaireHT"],
);

/** Description (longue) de la cible de navigation — assemblée à l'identique du legacy. */
const naviguerPageDescription =
  "Chemin de destination. DEEP-LINKS vers un document précis (utilise l'id réel retourné par l'outil de création) : /devis/<id>, /factures/<id>, /clients/<id>, /contrats/<id>, /commandes/<id>. " +
  "PAGES LISTE / SECTIONS (liste non exhaustive, choisis la plus pertinente) : " +
  "cœur métier → /dashboard, /clients, /devis, /factures, /interventions, /calendrier, /stocks, /articles, /fournisseurs, /commandes, /contrats ; " +
  "compta & dépenses → /comptabilite (TVA, FEC, écritures), /depenses, /notes-de-frais, /tableau-bord-depenses, /budgets-depenses, /regles-depenses, /import-releve, /integrations-comptables, /tableau-bord-sync-comptable ; " +
  "chantiers & planning → /chantiers (rentabilité chantier), /calendrier-chantiers, /planification, /previsions, /alertes-previsions ; " +
  "équipe & véhicules → /techniciens, /conges, /utilisateurs, /vehicules, /flotte, /geolocalisation, /classement, /badges ; " +
  "commercial & IA → /devis-ia, /devis-options, /relances, /avis, /analyses-photos, /rdv-en-ligne ; " +
  "stats & rapports → /statistiques, /rapports, /rapport-commande, /performances-fournisseurs ; " +
  "vitrine & comm → /ma-vitrine, /portail-gestion, /notifications, /modeles-email, /modeles-email-transactionnels ; " +
  "compte & réglages → /profil, /parametres, /modules, /import, /documentation, /support. " +
  "Pas de /interventions/<id> (la nav intervention va sur /interventions ou /calendrier).";

/** Les 23 outils exposés au modèle (parité legacy `AGENT_TOOLS`). */
export const ASSISTANT_TOOLS: readonly ToolSchema[] = [
  {
    name: "chercher_client",
    description:
      "Recherche un client par nom, prénom, entreprise ou email. Insensible à la casse et aux accents. Accepte une requête multi-mots (ex: 'Michel dad' trouve DAD Michel) : matche TOUS les mots dans n'importe quel ordre, et tombe en mode partiel scoré si aucun match strict. Retourne jusqu'à 5 résultats. À utiliser AVANT toute action liée à un client si tu n'as pas son ID.",
    parameters: obj(
      { nom: str("Mots à chercher (nom, prénom, entreprise, email). Peut contenir plusieurs mots séparés par des espaces.") },
      ["nom"],
    ),
  },
  {
    name: "creer_devis",
    description:
      "Crée un nouveau devis en brouillon pour un client avec ses lignes. Retourne le numéro et l'ID du devis créé. Calcule automatiquement les totaux HT/TVA/TTC.",
    parameters: obj(
      {
        clientId: num("ID du client (obtenu via chercher_client)"),
        objet: str("Objet/titre du devis"),
        lignes: arr(ligneVente, "Lignes du devis avec leurs montants"),
        notes: str("Notes ou conditions particulières (optionnel)"),
        validiteDays: num("Nombre de jours de validité du devis (défaut: 30)"),
      },
      ["clientId", "objet", "lignes"],
    ),
  },
  {
    name: "envoyer_devis",
    description:
      "Envoie un devis existant par email au client. Le PDF est généré et joint automatiquement. Le statut du devis passe à 'envoye'.",
    parameters: obj(
      { devisId: num(), messagePersonnalise: str("Message libre ajouté au corps de l'email (optionnel)") },
      ["devisId"],
    ),
  },
  {
    name: "creer_et_envoyer_devis",
    description:
      "Crée un devis ET l'envoie immédiatement par email au client. Combine creer_devis et envoyer_devis en une seule action.",
    parameters: obj(
      {
        clientId: num(),
        objet: str(),
        lignes: arr(ligneVenteSimple),
        messageEmail: str("Message personnalisé pour l'email (optionnel)"),
      },
      ["clientId", "objet", "lignes"],
    ),
  },
  {
    name: "creer_facture",
    description:
      "Crée une facture pour un client. Si devisId est fourni, la facture est créée à partir du devis (recopie clientId, lignes, totaux). Sinon, crée la facture avec les lignes fournies.",
    parameters: obj(
      {
        clientId: num("Requis si pas de devisId"),
        devisId: num("ID du devis source (optionnel)"),
        objet: str(),
        lignes: arr(ligneVenteSimple, "Requis si pas de devisId"),
      },
      ["objet"],
    ),
  },
  {
    name: "envoyer_facture",
    description: "Envoie une facture par email au client avec son PDF en pièce jointe.",
    parameters: obj({ factureId: num(), messagePersonnalise: str() }, ["factureId"]),
  },
  {
    name: "envoyer_relance",
    description:
      "Envoie une relance pour une facture impayée. Utilise un message de rappel adapté avec le nombre de jours de retard.",
    parameters: obj({ factureId: num(), messagePersonnalise: str() }, ["factureId"]),
  },
  {
    name: "creer_intervention",
    description:
      "Planifie une intervention dans le calendrier. Les dates doivent être au format ISO 8601 (ex: 2026-05-13T08:00:00). Le titre doit décrire la nature du travail (ex: 'Débouchage WC', 'Réparation fuite', 'Entretien chaudière') — pas un libellé générique. L'adresse est facultative : si non fournie, l'adresse postale du client est utilisée automatiquement.",
    parameters: obj(
      {
        clientId: num(),
        titre: str(
          "Nature du travail à effectuer, déduite de la demande de l'artisan. Exemples : 'Débouchage WC', 'Réparation fuite cuisine', 'Entretien chaudière annuel', 'Installation chauffe-eau'. Utilise 'Intervention' uniquement si aucun détail n'a été donné.",
        ),
        description: str("Notes ou détails complémentaires (optionnel)."),
        dateDebut: str("Date/heure ISO 8601"),
        dateFin: str("Date/heure ISO 8601"),
        adresse: str("Adresse de l'intervention (optionnel). Si vide, l'adresse postale du client est utilisée automatiquement."),
      },
      ["clientId", "titre", "dateDebut", "dateFin"],
    ),
  },
  {
    name: "lister_factures_impayees",
    description:
      "Liste toutes les factures non payées (statut envoyée ou en retard). Retourne id, numéro, client, montantTTC, date échéance, jours de retard.",
    parameters: obj({}),
  },
  {
    name: "lister_devis_en_attente",
    description:
      "Liste les devis envoyés en attente de réponse du client (statut envoye). Retourne id, numéro, client, montantTTC, date du devis.",
    parameters: obj({}),
  },
  {
    name: "lister_factures",
    description:
      "Liste TOUTES les factures de l'artisan, TOUS STATUTS confondus (brouillon, envoyée, payée, annulée), de la plus récente à la plus ancienne. À utiliser pour répondre à toute question générale sur les factures : « mes factures », « la dernière / la première facture », « combien de factures », « la plus grosse facture », ou un statut autre qu'impayées. N'utilise lister_factures_impayees QUE pour le sous-ensemble impayé. Retourne count + id, numéro, client, statut, montantTTC, dateFacture, dateEcheance.",
    parameters: obj({
      statut: str("Filtre optionnel : brouillon | envoyee | payee | annulee. Omettre pour TOUTES les factures."),
    }),
  },
  {
    name: "lister_devis",
    description:
      "Liste TOUS les devis de l'artisan, TOUS STATUTS confondus (brouillon, envoye, accepte, refuse), du plus récent au plus ancien. À utiliser pour toute question générale sur les devis : « mes devis », « le dernier devis », « combien de devis », « le plus gros devis ». N'utilise lister_devis_en_attente QUE pour le sous-ensemble envoyé/en attente. Retourne count + id, numéro, client, statut, montantTTC, dateDevis.",
    parameters: obj({
      statut: str("Filtre optionnel : brouillon | envoye | accepte | refuse. Omettre pour TOUS les devis."),
    }),
  },
  {
    name: "verifier_stocks",
    description:
      "Vérifie tous les niveaux de stock. Retourne la liste des articles avec leur quantité, seuil d'alerte et statut (rupture | alerte | ok), ainsi qu'un récapitulatif des articles à réapprovisionner.",
    parameters: obj({}),
    /* ponytail: PoC enabledFor — admin-only ; retirer la gate dès qu'un vrai outil de diagnostic existe */
    enabledFor: ({ isAdmin }) => isAdmin,
  },
  {
    name: "creer_commande_fournisseur",
    description:
      "Crée un bon de commande fournisseur en brouillon pour réapprovisionner des articles. Retourne le numéro et l'id de la commande créée.",
    parameters: obj(
      {
        fournisseurId: num("ID du fournisseur (obtenu via chercher_fournisseur ou lister_fournisseurs)"),
        lignes: arr(
          obj({ designation: str(), quantite: num(), unite: str(), prixUnitaireHT: num() }, ["designation", "quantite"]),
        ),
        notes: str(),
        delaiLivraison: str("Texte libre, ex: '2 semaines'"),
      },
      ["fournisseurId", "lignes"],
    ),
  },
  {
    name: "envoyer_commande_fournisseur",
    description: "Envoie un bon de commande par email au fournisseur avec le PDF en pièce jointe.",
    parameters: obj({ commandeId: num(), messagePersonnalise: str() }, ["commandeId"]),
  },
  {
    name: "lister_clients",
    description:
      "Liste les clients de l'artisan. Filtre optionnel par substring sur le nom/prénom/entreprise. Limite à 50 résultats.",
    parameters: obj({ filtre: str("Texte de filtrage (optionnel)") }),
  },
  {
    name: "creer_client",
    description: "Crée un nouveau client dans la base. Retourne l'id et le nom du client créé.",
    parameters: obj(
      {
        nom: str(),
        prenom: str(),
        email: str(),
        telephone: str(),
        adresse: str(),
        ville: str(),
        codePostal: str(),
        type: str(),
      },
      ["nom"],
    ),
  },
  {
    name: "get_statistiques",
    description:
      "Récupère les statistiques complètes de l'activité : CA du mois, CA de l'année, nombre de clients, devis en cours, factures impayées, interventions à venir, articles en rupture.",
    parameters: obj({
      periode: str("Optionnel — par défaut renvoie un récapitulatif complet incluant mois et année."),
    }),
  },
  {
    name: "lister_fournisseurs",
    description: "Liste tous les fournisseurs enregistrés avec leurs coordonnées.",
    parameters: obj({}),
  },
  {
    name: "chercher_fournisseur",
    description: "Recherche un fournisseur par nom. Insensible à la casse, retourne jusqu'à 5 résultats.",
    parameters: obj({ nom: str() }, ["nom"]),
  },
  {
    name: "lister_interventions",
    description: "Liste les interventions planifiées. Filtres optionnels par statut, dateDebut (>=), dateFin (<=).",
    parameters: obj({
      statut: str("planifiee | en_cours | terminee | annulee"),
      dateDebut: str("ISO 8601"),
      dateFin: str("ISO 8601"),
    }),
  },
  {
    name: "modifier_intervention",
    description: "Modifie une intervention existante. Seuls les champs fournis sont mis à jour.",
    parameters: obj(
      {
        interventionId: num(),
        titre: str(),
        dateDebut: str(),
        dateFin: str(),
        statut: str("planifiee | en_cours | terminee | annulee"),
        notes: str(),
      },
      ["interventionId"],
    ),
  },
  {
    name: "naviguer_vers",
    description:
      "Ouvre une page de l'application pour l'artisan (avec un filtre optionnel). Deux usages : (1) après avoir listé des données, ouvrir la page liste filtrée ; (2) après une ACTION de création/modification, ouvrir le DEEP-LINK du document créé (ex. /devis/<id>). Le résumé court reste dans le panneau de chat. N'invente JAMAIS de chemin : utilise uniquement une page connue ou un deep-link vers un id réel retourné par un outil.",
    parameters: obj(
      {
        page: str(naviguerPageDescription),
        filtre: str(
          "Filtre à appliquer sur la page liste (ignoré pour un deep-link). Valeurs valides selon la page : factures → impayees, en_retard, brouillon ; devis → brouillon, envoye, accepte, refuse ; interventions → planifiee, en_cours, terminee ; stocks → rupture, alerte ; commandes → brouillon, envoyee.",
        ),
        message: str("Message court affiché à l'artisan pour confirmer la navigation (optionnel)."),
      },
      ["page"],
    ),
  },
];

/*
 * Mapping outil → caches tRPC à invalider côté client après une exécution réussie (parité legacy
 * `TOOL_INVALIDATIONS`). La route SSE émet un event `{ invalidate: [...] }` après chaque tool_use.
 * Les clés sont matchées en substring sur le queryKey. `notifications` est inclus pour les outils
 * qui créent une notification (envoi devis/facture/relance/commande) — rafraîchit la cloche.
 */
export const TOOL_INVALIDATIONS: Record<string, readonly string[]> = {
  creer_client: ["clients"],
  creer_devis: ["devis"],
  envoyer_devis: ["devis", "notifications"],
  creer_et_envoyer_devis: ["devis", "notifications"],
  creer_facture: ["factures", "devis"],
  envoyer_facture: ["factures", "notifications"],
  envoyer_relance: ["factures", "notifications"],
  creer_intervention: ["interventions"],
  modifier_intervention: ["interventions"],
  creer_commande_fournisseur: ["commandesFournisseurs"],
  envoyer_commande_fournisseur: ["commandesFournisseurs", "notifications"],
};

/*
 * Outils d'ÉCRITURE = exactement ceux qui déclarent une invalidation de cache (effet de bord tenant).
 * Les écritures sont portées EN DERNIER et avec garde-fous (cf. plan de portage agentique).
 */
export const WRITE_TOOL_NAMES: ReadonlySet<string> = new Set(Object.keys(TOOL_INVALIDATIONS));

/** Un outil a-t-il un effet d'écriture (vs lecture/navigation) ? */
export function isWriteTool(name: string): boolean {
  return WRITE_TOOL_NAMES.has(name);
}

/** Recherche d'un outil par nom (null si inconnu). */
export function findTool(name: string): ToolSchema | null {
  return ASSISTANT_TOOLS.find((t) => t.name === name) ?? null;
}
