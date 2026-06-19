/*
 * Types de domaine du module parametres (configuration de l'artisan) — découplés du schéma
 * Drizzle. Table `parametres_artisan` : **singleton par tenant** (artisanId UNIQUE, RLS). Forme
 * get/upsert et NON CRUD by-id. Regroupe : numérotation (préfixes + compteurs), CGV/mentions,
 * délais & conditions de paiement, notifications/rappels, objectifs, couleurs de marque.
 * 
 * ⚠️ INVARIANT MÉTIER CENTRAL : les **compteurs** de numérotation (compteurDevis/Facture/Avoir)
 * sont **pilotés par la numérotation** des documents (devis/factures/avoir) et NE sont PAS
 * modifiables via la configuration — les exposer en écriture libre casserait la séquence (doublons
 * de numéros). Ils sont donc en lecture seule ici et ABSENTS de UpdateParametresInput. Les préfixes
 * restent modifiables. La vitrine publique est une concern séparée (hors périmètre de ce domaine).
 */

export interface ParametresArtisan {
  readonly artisanId: number;
  // — Numérotation (préfixes modifiables) —
  readonly prefixeDevis: string;
  readonly prefixeFacture: string;
  readonly prefixeAvoir: string;
  // — Compteurs (LECTURE SEULE : pilotés par la numérotation des documents) —
  readonly compteurDevis: number;
  readonly compteurFacture: number;
  readonly compteurAvoir: number;
  // — CGV / mentions —
  readonly mentionsLegales: string | null;
  readonly conditionsGenerales: string | null;
  // — Paiement —
  readonly conditionsPaiementDefaut: string | null;
  readonly delaiPaiementJours: number | null;
  readonly delaiPaiementType: string;
  // — Notifications / rappels —
  readonly notificationsEmail: boolean;
  readonly rappelDevisJours: number;
  readonly rappelFactureJours: number;
  // — Objectifs —
  readonly objectifCA: string; // numeric PG en string
  readonly objectifDevis: number;
  readonly objectifClients: number;
  // — Marque —
  readonly couleurPrincipale: string;
  readonly couleurSecondaire: string;
}

// Champs modifiables via la configuration. ⚠️ AUCUN compteur ici (inviolables via la config).
export interface UpdateParametresInput {
  readonly prefixeDevis?: string;
  readonly prefixeFacture?: string;
  readonly prefixeAvoir?: string;
  readonly mentionsLegales?: string | null;
  readonly conditionsGenerales?: string | null;
  readonly conditionsPaiementDefaut?: string | null;
  readonly delaiPaiementJours?: number | null;
  readonly delaiPaiementType?: string;
  readonly notificationsEmail?: boolean;
  readonly rappelDevisJours?: number;
  readonly rappelFactureJours?: number;
  readonly objectifCA?: string;
  readonly objectifDevis?: number;
  readonly objectifClients?: number;
  readonly couleurPrincipale?: string;
  readonly couleurSecondaire?: string;
}

/*
 * Valeurs par défaut (alignées sur les DEFAULT de la table) renvoyées par `get` quand aucune ligne
 * n'existe encore pour le tenant — le domaine garantit ainsi un singleton toujours lisible.
 */
export function defaultParametres(artisanId: number): ParametresArtisan {
  return {
    artisanId,
    prefixeDevis: "DEV",
    prefixeFacture: "FAC",
    prefixeAvoir: "AV",
    compteurDevis: 1,
    compteurFacture: 1,
    compteurAvoir: 1,
    mentionsLegales: null,
    conditionsGenerales: null,
    conditionsPaiementDefaut: null,
    delaiPaiementJours: null,
    delaiPaiementType: "net",
    notificationsEmail: true,
    rappelDevisJours: 7,
    rappelFactureJours: 30,
    objectifCA: "0",
    objectifDevis: 0,
    objectifClients: 0,
    couleurPrincipale: "#4F46E5",
    couleurSecondaire: "#6366F1",
  };
}
