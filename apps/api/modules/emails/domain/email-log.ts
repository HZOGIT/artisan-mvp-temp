/** Journal des emails envoyés (table `emails_log`, sous RLS via `artisanId`). Lecture seule. */
export interface EmailLogEntry {
  readonly id: number;
  readonly artisanId: number | null;
  readonly destinataire: string;
  readonly sujet: string;
  readonly type: string | null;
  readonly resendId: string | null;
  readonly statut: string;
  readonly erreur: string | null;
  readonly entiteType: string | null;
  readonly entiteId: number | null;
  readonly createdAt: Date;
}

export type EmailEntiteType = "devis" | "facture" | "intervention";

export interface EmailLogFilter {
  readonly entiteType?: EmailEntiteType;
  readonly entiteId?: number;
  readonly limit?: number;
}

/** Borne le nombre de lignes (défaut 100, plage [1, 500]) — parité legacy `getEmailsLog`. Fonction PURE. */
export function clampLimit(limit?: number): number {
  return Math.min(Math.max(limit ?? 100, 1), 500);
}
