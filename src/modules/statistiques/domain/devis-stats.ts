// Statistiques agrégées des devis du tenant (parité legacy `statistiques.getDevisStats`).
export interface DevisStats {
  readonly total: number;
  readonly parStatut: Record<string, number>;
  readonly montantTotal: number;
}

// Ligne minimale nécessaire au calcul (statut + montant TTC). `statut`/`totalTTC` peuvent être nuls.
export interface DevisStatRow {
  readonly statut: string | null;
  readonly totalTTC: string | null;
}

// Agrège un lot de devis : compte par statut (défaut « brouillon ») et somme les TTC. Fonction PURE
// (testable sans DB) — somme brute des `parseFloat` comme le legacy (pas d'arrondi imposé).
export function computeDevisStats(devis: readonly DevisStatRow[]): DevisStats {
  const parStatut: Record<string, number> = {};
  let montantTotal = 0;
  for (const d of devis) {
    const statut = d.statut || "brouillon";
    parStatut[statut] = (parStatut[statut] || 0) + 1;
    montantTotal += parseFloat(d.totalTTC ?? "0") || 0;
  }
  return { total: devis.length, parStatut, montantTotal };
}
