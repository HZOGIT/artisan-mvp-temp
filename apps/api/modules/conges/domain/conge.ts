/*
 * Types de domaine du module conges (RH — demandes de congés) — découplés du schéma Drizzle.
 * ⚠️ Domaine sensible : **anti self-approbation** (l'approbateur `validePar` ≠ le demandeur
 * `technicienId`), **idempotence du décompte de solde** (approuver 2× ne double-décompte pas),
 * **recrédit à l'annulation**, isolation cross-tenant. Le workflow d'approbation/solde est
 * porté aux étapes ultérieures ; ici, modèle + CRUD de la demande.
 */

export type CongeStatut = "en_attente" | "approuve" | "refuse" | "annule";
export type CongeType = "conge_paye" | "rtt" | "maladie" | "sans_solde" | "formation" | "autre";

export interface Conge {
  readonly id: number;
  readonly artisanId: number;
  /** demandeur */
  readonly technicienId: number;
  readonly type: CongeType;
  /** date PG (YYYY-MM-DD) */
  readonly dateDebut: string;
  readonly dateFin: string;
  readonly demiJourneeDebut: boolean;
  readonly demiJourneeFin: boolean;
  readonly motif: string | null;
  readonly statut: CongeStatut;
  readonly commentaireValidation: string | null;
  readonly dateValidation: Date | null;
  /** approbateur (≠ demandeur) */
  readonly validePar: number | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateCongeInput {
  readonly technicienId: number;
  readonly type: CongeType;
  readonly dateDebut: string;
  readonly dateFin: string;
  readonly demiJourneeDebut?: boolean;
  readonly demiJourneeFin?: boolean;
  readonly motif?: string | null;
}

export interface UpdateCongeInput {
  /*
   * Métadonnées de la demande (tant qu'elle est modifiable). ⚠️ `statut`/`validePar`/
   * `dateValidation` ne sont PAS modifiables ici : ils changent via le workflow
   * approuver/refuser/annuler (étape ultérieure) qui porte les invariants de solde.
   */
  readonly type?: CongeType;
  readonly dateDebut?: string;
  readonly dateFin?: string;
  readonly demiJourneeDebut?: boolean;
  readonly demiJourneeFin?: boolean;
  readonly motif?: string | null;
}
