import type { EcritureComptable } from "../domain/ecriture";

/** Agrégats comptables de lecture — PURS, testables sans DB sur un `EcritureComptable[]`. */

export interface LigneBalance {
  readonly numeroCompte: string;
  readonly libelleCompte: string | null;
  readonly totalDebit: string;
  readonly totalCredit: string;
  /** débit − crédit (signé) */
  readonly solde: string;
}

/*
 * Balance générale : agrège les écritures par compte (Σdébit, Σcrédit, solde), triée par compte.
 * ⚠️ Invariant : sur un ensemble équilibré, **Σ des soldes = 0** (Σdébit = Σcrédit).
 */
export function calculerBalance(ecritures: readonly EcritureComptable[]): LigneBalance[] {
  const parCompte = new Map<string, { lib: string | null; debit: number; credit: number }>();
  for (const e of ecritures) {
    const cur = parCompte.get(e.numeroCompte) ?? { lib: e.libelleCompte, debit: 0, credit: 0 };
    cur.debit += Number(e.debit) || 0;
    cur.credit += Number(e.credit) || 0;
    if (cur.lib == null && e.libelleCompte != null) cur.lib = e.libelleCompte;
    parCompte.set(e.numeroCompte, cur);
  }
  return Array.from(parCompte.entries())
    .map(([numeroCompte, v]) => ({
      numeroCompte,
      libelleCompte: v.lib,
      totalDebit: v.debit.toFixed(2),
      totalCredit: v.credit.toFixed(2),
      solde: (v.debit - v.credit).toFixed(2),
    }))
    .sort((a, b) => a.numeroCompte.localeCompare(b.numeroCompte));
}

export interface LigneGrandLivre {
  readonly id: number;
  readonly dateEcriture: Date;
  readonly journal: EcritureComptable["journal"];
  readonly numeroCompte: string;
  readonly libelle: string;
  readonly pieceRef: string | null;
  readonly debit: string;
  readonly credit: string;
  /** cumul (débit − crédit) jusqu'à cette ligne incluse */
  readonly soldeProgressif: string;
}

/*
 * Grand livre : écritures (optionnellement filtrées sur un compte) triées par date puis id, avec
 * le **solde progressif** cumulé. Si `numeroCompte` fourni, le solde progressif est par compte.
 */
export function grandLivre(ecritures: readonly EcritureComptable[], numeroCompte?: string): LigneGrandLivre[] {
  const filtrees = (numeroCompte ? ecritures.filter((e) => e.numeroCompte === numeroCompte) : ecritures)
    .slice()
    .sort((a, b) => a.dateEcriture.getTime() - b.dateEcriture.getTime() || a.id - b.id);
  const cumul = new Map<string, number>();
  return filtrees.map((e) => {
    const cle = numeroCompte ? numeroCompte : e.numeroCompte;
    const next = (cumul.get(cle) ?? 0) + (Number(e.debit) || 0) - (Number(e.credit) || 0);
    cumul.set(cle, next);
    return {
      id: e.id,
      dateEcriture: e.dateEcriture,
      journal: e.journal,
      numeroCompte: e.numeroCompte,
      libelle: e.libelle,
      pieceRef: e.pieceRef,
      debit: e.debit,
      credit: e.credit,
      soldeProgressif: next.toFixed(2),
    };
  });
}
