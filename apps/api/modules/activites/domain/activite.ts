/*
 * Activité = tâche de suivi commercial (« à faire ») du tenant : appel/email/rdv/relance à échéance,
 * optionnellement rattachée à une entité métier (client/devis/facture/chantier). Table `activites`
 * (porte `artisanId` → sous RLS tenant). `echeance` est une date pure (YYYY-MM-DD).
 */
export type ActiviteType = "appel" | "email" | "rdv" | "relance" | "autre";
export type ActiviteEntiteType = "client" | "devis" | "facture" | "chantier" | "aucun";

export interface Activite {
  readonly id: number;
  readonly artisanId: number;
  readonly type: ActiviteType;
  readonly titre: string;
  readonly echeance: string;
  readonly entiteType: ActiviteEntiteType;
  readonly entiteId: number | null;
  readonly responsableUserId: number | null;
  readonly fait: boolean;
  readonly faitAt: Date | null;
  readonly note: string | null;
  readonly createdAt: Date;
}

/** Champs de création d'une activité (le rattachement entité est vérifié possédé avant insert). */
export interface CreateActiviteInput {
  readonly type: ActiviteType;
  readonly titre: string;
  readonly echeance: string;
  readonly entiteType?: ActiviteEntiteType;
  readonly entiteId?: number | null;
  readonly note?: string | null;
}
