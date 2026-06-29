import { ValidationError } from "./errors";

/**
 * Vérifie qu'une date de document n'est pas dans une période verrouillée comptablement.
 * `documentDate` : YYYY-MM-DD ou Date. `lockDate` : YYYY-MM-DD ou null (pas de verrou).
 * Lève ValidationError si documentDate ≤ lockDate.
 */
export function assertDateNonVerrouillee(documentDate: Date | string, lockDate: string | null): void {
  if (!lockDate) return;
  const docStr = documentDate instanceof Date ? documentDate.toISOString().slice(0, 10) : documentDate;
  if (docStr <= lockDate) {
    throw new ValidationError(`Période verrouillée jusqu'au ${lockDate} — création ou modification interdite sur cette date`);
  }
}
