// Types de domaine du module interventions (cœur métier terrain) — découplés du schéma
// Drizzle. ⚠️ Domaine sensible : machine à états du statut (pas de transition arbitraire),
// FK scopées tenant (clientId/technicienId/devisId/factureId = anti-IDOR-FK), isolation
// cross-tenant. Le détail des transitions est porté aux étapes ultérieures.

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
  // ⚠️ Le statut n'est pas un champ libre d'update : les transitions seront contrôlées par
  // une machine à états (étape ultérieure). Présent ici pour la complétude du modèle.
  readonly statut?: InterventionStatut;
  readonly adresse?: string | null;
  readonly notes?: string | null;
  readonly devisId?: number | null;
  readonly factureId?: number | null;
  readonly technicienId?: number | null;
}
