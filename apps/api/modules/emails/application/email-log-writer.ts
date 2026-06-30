export interface CreateEmailLogEntry {
  readonly artisanId: number;
  readonly destinataire: string;
  readonly sujet: string;
  readonly type: string;
  readonly entiteType?: string | null;
  readonly entiteId?: number | null;
  readonly statut?: string;
}

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

  /** Journalise un envoi email transactionnel (best-effort — toujours appeler avec .catch(() => {})). */
  create(entry: CreateEmailLogEntry): Promise<void>;
}
