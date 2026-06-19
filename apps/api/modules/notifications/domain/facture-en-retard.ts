/*
 * Vue lecture seule d'une facture en retard de paiement, utilisée pour générer des
 * rappels. Domaine sensible (facturation) : aucune écriture sur les factures.
 */
export interface FactureEnRetard {
  readonly id: number;
  readonly numero: string;
  /** numeric PG en string (précision préservée) */
  readonly totalTTC: string;
  readonly dateEcheance: Date;
  readonly clientNom: string | null;
}

/** Données d'une notification à créer (rappel généré). */
export interface CreerNotificationInput {
  readonly type: import("./notification").NotificationType;
  readonly titre: string;
  readonly message: string;
  readonly lien: string;
}
