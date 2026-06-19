/*
 * Types de domaine du module rdv-en-ligne (demandes de rendez-vous en ligne) — découplés du schéma
 * Drizzle. Table `rdv_en_ligne` (RLS sur artisanId). Un client demande un créneau ; l'artisan
 * confirme/refuse/annule. Domaine semi-sensible : `clientId` anti-IDOR-FK (doit appartenir au
 * tenant), statut initial non usurpable, transitions de statut maîtrisées.
 * 
 * Invariants (étapes ultérieures) : isolation cross-tenant ; artisanId forcé ; clientId du tenant ;
 * statut="en_attente" à la création (jamais fourni par le client) ; statut NON modifiable via
 * l'update libre — transitions par use-cases dédiés (confirmer / refuser[motif] / annuler) ; pas de
 * retour arrière depuis annule/refuse. `interventionId` est une réf. lâche (pas de FK au schéma).
 */

export type RdvStatut = "en_attente" | "confirme" | "refuse" | "annule";
export type RdvUrgence = "normale" | "urgente" | "tres_urgente";

export interface Rdv {
  readonly id: number;
  readonly artisanId: number;
  readonly clientId: number;
  readonly titre: string;
  readonly description: string | null;
  readonly dateProposee: Date;
  readonly dureeEstimee: number;
  readonly statut: RdvStatut;
  readonly motifRefus: string | null;
  readonly urgence: RdvUrgence;
  readonly interventionId: number | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/*
 * Entrée de création : `statut` (en_attente) et `motifRefus` (null) sont posés par l'infra ; jamais
 * fournis par l'appelant.
 */
export interface CreateRdvInput {
  readonly clientId: number;
  readonly titre: string;
  readonly dateProposee: Date;
  readonly description?: string | null;
  readonly dureeEstimee?: number;
  readonly urgence?: RdvUrgence;
}

/*
 * Update des métadonnées uniquement. ⚠️ `statut`/`motifRefus` ABSENTS → transitions via use-cases
 * dédiés (anti-usurpation de l'état machine).
 */
export interface UpdateRdvInput {
  readonly titre?: string;
  readonly description?: string | null;
  readonly dateProposee?: Date;
  readonly dureeEstimee?: number;
  readonly urgence?: RdvUrgence;
}
