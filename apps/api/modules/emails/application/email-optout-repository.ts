/** Port de persistance des opt-outs email (plateforme-level, pas de tenant). */
export interface IEmailOptoutRepository {
  /** Renvoie true si l'adresse a demandé un opt-out. */
  isOptedOut(email: string): Promise<boolean>;
  /** Insère l'opt-out (idempotent — pas d'erreur si déjà présent). */
  addOptout(email: string, reason?: string): Promise<void>;
}
