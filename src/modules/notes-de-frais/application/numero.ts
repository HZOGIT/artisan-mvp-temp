// Numérotation des notes de frais — PURE, testable. Parité legacy `getNextNoteFraisNumero` :
// le numéro est `NDF-<n>` (n sur 5 chiffres), n = suffixe numérique de la dernière note + 1
// (ou 1 si aucune). ⚠️ Généré côté serveur (jamais fourni par le client).
export function computeNextNoteFraisNumero(lastNumero: string): string {
  const m = (lastNumero || "").match(/-(\d+)$/);
  const n = m ? parseInt(m[1], 10) + 1 : 1;
  return `NDF-${String(n).padStart(5, "0")}`;
}
