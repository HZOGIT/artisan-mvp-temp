/** MAJ du statut de délivrabilité d'un email journalisé. Opération système cross-tenant. */
export interface IEmailLogWriter {
  /**
   * Met à jour le statut d'une ligne `emails_log` par son `resendId`.
   * Renvoie les données de la ligne mise à jour, ou `null` si aucune ligne ne correspond
   * (resendId inconnu ou pas encore renseigné à l'envoi).
   */
  updateStatutByResendId(
    resendId: string,
    statut: "delivre" | "bounce" | "plainte",
  ): Promise<{ artisanId: number | null; destinataire: string } | null>;
}
