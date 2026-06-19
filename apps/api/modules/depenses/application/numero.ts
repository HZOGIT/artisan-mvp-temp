/*
 * Numérotation des dépenses — PURE, testable. Parité legacy `getNextDepenseNumero` :
 * le numéro est `DEP-<n>` (n sur 5 chiffres), n = suffixe numérique de la dernière dépense + 1
 * (ou 1 si aucune). ⚠️ Généré côté serveur (jamais fourni par le client) → numérotation
 * comptable maîtrisée.
 */
export function computeNextNumero(lastNumero: string): string {
  const m = (lastNumero || "").match(/-(\d+)$/);
  const n = m ? parseInt(m[1], 10) + 1 : 1;
  return `DEP-${String(n).padStart(5, "0")}`;
}
