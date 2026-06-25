/*
 * Domaine comptabilité (LECTURE) : agrégats à partir des écritures comptables (`ecritures_comptables`,
 * sous RLS). Fonctions PURES (parité legacy `db.getGrandLivre`/`getBalance`/`getRapportTVA`).
 * ⚠️ Invariants financiers : pas d'arrondi destructif (sommes en centimes par `parseFloat`), comptes
 * TVA reconnus par préfixe (44571x collectée / 44566x déductible).
 */

import { round2 } from '../../../shared/money';

export interface Ecriture {
  readonly id: number;
  readonly dateEcriture: Date;
  readonly journal: string;
  readonly numeroCompte: string;
  readonly libelleCompte: string | null;
  readonly libelle: string;
  readonly pieceRef: string | null;
  readonly debit: string | null;
  readonly credit: string | null;
  readonly factureId: number | null;
  readonly lettrage: string | null;
  readonly pointage: boolean | null;
}

export interface CompteGrandLivre {
  readonly numeroCompte: string;
  readonly libelleCompte: string;
  readonly ecritures: Ecriture[];
  readonly totalDebit: number;
  readonly totalCredit: number;
  readonly solde: number;
}

export interface LigneBalance {
  readonly numeroCompte: string;
  readonly libelleCompte: string;
  readonly debit: number;
  readonly credit: number;
  readonly soldeDebiteur: number;
  readonly soldeCrediteur: number;
}

export interface RapportTVA {
  readonly tvaCollectee: number;
  readonly tvaDeductible: number;
  readonly tvaNette: number;
}

export interface DeclarationTVADetail {
  readonly parTaux: { taux: number; baseHT: number; tvaCollectee: number }[];
  readonly tvaCollectee: number;
  readonly tvaDeductible: number;
  readonly tvaNette: number;
}

const num = (v: unknown): number => parseFloat(String(v ?? "0")) || 0;

/*
 * Grand livre : groupé par compte (ordre d'apparition = tri numeroCompte/date en amont), avec totaux
 * et solde (débit − crédit). Parité legacy `getGrandLivre`.
 */
export function computeGrandLivre(ecritures: readonly Ecriture[]): CompteGrandLivre[] {
  const comptes = new Map<string, { numeroCompte: string; libelleCompte: string; ecritures: Ecriture[]; totalDebit: number; totalCredit: number; solde: number }>();
  for (const e of ecritures) {
    let c = comptes.get(e.numeroCompte);
    if (!c) {
      c = { numeroCompte: e.numeroCompte, libelleCompte: e.libelleCompte || "", ecritures: [], totalDebit: 0, totalCredit: 0, solde: 0 };
      comptes.set(e.numeroCompte, c);
    }
    c.ecritures.push(e);
    c.totalDebit += num(e.debit);
    c.totalCredit += num(e.credit);
    c.solde = c.totalDebit - c.totalCredit;
  }
  return Array.from(comptes.values());
}

/** Balance : un poste par compte (débit/crédit cumulés + solde débiteur/créditeur), triée par compte. */
export function computeBalance(ecritures: readonly Ecriture[]): LigneBalance[] {
  const comptes = new Map<string, { numeroCompte: string; libelleCompte: string; debit: number; credit: number; soldeDebiteur: number; soldeCrediteur: number }>();
  for (const e of ecritures) {
    let c = comptes.get(e.numeroCompte);
    if (!c) {
      c = { numeroCompte: e.numeroCompte, libelleCompte: e.libelleCompte || "", debit: 0, credit: 0, soldeDebiteur: 0, soldeCrediteur: 0 };
      comptes.set(e.numeroCompte, c);
    }
    c.debit += num(e.debit);
    c.credit += num(e.credit);
    const solde = c.debit - c.credit;
    c.soldeDebiteur = solde > 0 ? solde : 0;
    c.soldeCrediteur = solde < 0 ? Math.abs(solde) : 0;
  }
  return Array.from(comptes.values()).sort((a, b) => a.numeroCompte.localeCompare(b.numeroCompte));
}

/*
 * Rapport TVA simplifié depuis les écritures : collectée = SOLDE des comptes 44571x (crédit − débit),
 * déductible = SOLDE des comptes 44566x (débit − crédit). ⚠️ On NETTE débit/crédit : un AVOIR génère
 * une écriture INVERSE (TVA collectée au débit) qui DOIT réduire la TVA collectée — sinon la note de
 * crédit ne diminue jamais la TVA déclarée (sur-déclaration).
 */
export function computeRapportTVA(ecritures: readonly Ecriture[]): RapportTVA {
  let tvaCollectee = 0;
  let tvaDeductible = 0;
  for (const e of ecritures) {
    if (e.numeroCompte.startsWith("44571")) tvaCollectee += num(e.credit) - num(e.debit);
    else if (e.numeroCompte.startsWith("44566")) tvaDeductible += num(e.debit) - num(e.credit);
  }
  return { tvaCollectee, tvaDeductible, tvaNette: tvaCollectee - tvaDeductible };
}

/*
 * Assemble la déclaration TVA détaillée (CA3) à partir des bases/TVA par taux (factures) + TVA
 * déductible (dépenses). Arrondis à 2 décimales (parité legacy `getDeclarationTVADetail`).
 */
export function assembleDeclarationTVA(parTauxBrut: ReadonlyArray<{ taux: number; baseHT: number; tvaCollectee: number }>, tvaDeductible: number): DeclarationTVADetail {
  const parTaux = parTauxBrut.map((t) => ({ taux: t.taux, baseHT: round2(t.baseHT), tvaCollectee: round2(t.tvaCollectee) }));
  const tvaCollectee = round2(parTaux.reduce((s, t) => s + t.tvaCollectee, 0));
  const ded = round2(tvaDeductible);
  return { parTaux, tvaCollectee, tvaDeductible: ded, tvaNette: round2(tvaCollectee - ded) };
}
