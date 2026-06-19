/*
 * Types de domaine du module interventions (cœur métier terrain) — découplés du schéma
 * Drizzle. ⚠️ Domaine sensible : machine à états du statut (pas de transition arbitraire),
 * FK scopées tenant (clientId/technicienId/devisId/factureId = anti-IDOR-FK), isolation
 * cross-tenant. Le détail des transitions est porté aux étapes ultérieures.
 */

export type InterventionStatut = "planifiee" | "en_cours" | "terminee" | "annulee";

export interface Intervention {
  readonly id: number;
  readonly artisanId: number;
  readonly clientId: number;
  readonly titre: string;
  readonly description: string | null;
  readonly dateDebut: Date;
  readonly dateFin: Date | null;
  readonly statut: InterventionStatut;
  readonly adresse: string | null;
  readonly notes: string | null;
  readonly devisId: number | null;
  readonly factureId: number | null;
  readonly technicienId: number | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateInterventionInput {
  readonly clientId: number;
  readonly titre: string;
  readonly description?: string | null;
  readonly dateDebut: Date;
  readonly dateFin?: Date | null;
  readonly statut?: InterventionStatut;
  readonly adresse?: string | null;
  readonly notes?: string | null;
  readonly devisId?: number | null;
  readonly factureId?: number | null;
  readonly technicienId?: number | null;
}

export interface UpdateInterventionInput {
  readonly titre?: string;
  readonly description?: string | null;
  readonly dateDebut?: Date;
  readonly dateFin?: Date | null;
  /*
   * ⚠️ Le statut n'est pas un champ libre d'update : les transitions seront contrôlées par
   * une machine à états (étape ultérieure). Présent ici pour la complétude du modèle.
   */
  readonly statut?: InterventionStatut;
  readonly adresse?: string | null;
  readonly notes?: string | null;
  readonly devisId?: number | null;
  readonly factureId?: number | null;
  readonly technicienId?: number | null;
}

/*
 * ── Équipe d'intervention (sous-ressource `interventions_techniciens`) ────────────────────────
 * Plusieurs intervenants par intervention (le « responsable » reste `intervention.technicienId` ;
 * l'équipe gère les intervenants supplémentaires). La table porte un `artisanId` (double
 * cloisonnement) ; l'accès est TOUJOURS borné par l'intervention parente du tenant (anti-IDOR).
 */
export interface EquipeMembre {
  readonly id: number; // id de la liaison
  readonly technicienId: number;
  readonly role: string | null;
  readonly nom: string | null; // dénormalisé (jointure technicien) pour l'affichage
  readonly prenom: string | null;
}

// Membre d'équipe enrichi de son intervention (affichage liste/planning, 1 requête, anti-N+1).
export interface EquipeMembreArtisan extends EquipeMembre {
  readonly interventionId: number;
}

// Entrée d'ajout d'un membre (artisanId forcé serveur ; idempotent sur intervention+technicien).
export interface AjouterMembreEquipeInput {
  readonly interventionId: number;
  readonly technicienId: number;
  readonly role?: string | null;
}
