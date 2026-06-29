import type { EcritureComptable, JournalComptable } from "../domain/ecriture";

/*
 * Export FEC — Fichier des Écritures Comptables (format légal DGFiP, arrêté du 29 juillet 2013).
 * PUR, testable. Fichier **tabulé (TAB)**, **18 colonnes**, dates `YYYYMMDD`, montants à
 * **virgule** décimale. Les écritures sont regroupées en **pièces** (EcritureNum incrémental) :
 * une pièce = les lignes partageant (factureId, journal) — elles portent le même EcritureNum et
 * sont équilibrées (Σdébit = Σcrédit par pièce).
 */

export const FEC_HEADER = [
  "JournalCode", "JournalLib", "EcritureNum", "EcritureDate", "CompteNum",
  "CompteLib", "CompAuxNum", "CompAuxLib", "PieceRef", "PieceDate",
  "EcritureLib", "Debit", "Credit", "EcritureLet", "DateLet",
  "ValidDate", "Montantdevise", "Idevise",
] as const;

const SEP = "\t";

const LIB_JOURNAL: Record<JournalComptable, string> = {
  VE: "Ventes",
  AC: "Achats",
  BQ: "Banque",
  OD: "Opérations diverses",
};

/** Nettoie un libellé (retire TAB/CR/LF, qui casseraient le format tabulé) ; trim. */
function clean(v: string | null | undefined): string {
  return String(v ?? "").replace(/[\t\r\n]+/g, " ").trim();
}
/** Montant FEC : 2 décimales, séparateur **virgule**. */
function amt(v: string): string {
  return (Number(v) || 0).toFixed(2).replace(".", ",");
}
/** Date FEC : YYYYMMDD. */
function ymd(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

/** Clé de pièce : (factureId, journal) — sinon (pieceRef, journal) si pas de factureId. */
function clePiece(e: EcritureComptable): string {
  return `${e.factureId ?? `P:${e.pieceRef ?? ""}`}|${e.journal}`;
}

/*
 * Génère le contenu FEC (string) à partir d'écritures déjà filtrées par période. Trie par date,
 * puis par ecritureNum, puis par id. Utilise ecritureNum persisté (permanent, A47 A-1 LPF) ;
 * repli calculé pour les écritures en brouillon ou non encore backfillées.
 */
export function exporterFEC(ecritures: readonly EcritureComptable[]): string {
  const tri = ecritures
    .slice()
    .sort((a, b) => a.dateEcriture.getTime() - b.dateEcriture.getTime() || a.id - b.id);

  /* Offset calculé au-delà des ecritureNum déjà persistés pour éviter les collisions */
  const maxPersisted = ecritures.reduce((m, e) => (e.ecritureNum != null && e.ecritureNum > m ? e.ecritureNum : m), 0);
  let prochainNum = maxPersisted;
  const numParPiece = new Map<string, number>();
  for (const e of tri) {
    const cle = clePiece(e);
    if (!numParPiece.has(cle)) {
      numParPiece.set(cle, e.ecritureNum ?? ++prochainNum);
    }
  }

  const lignes = [FEC_HEADER.join(SEP)];
  for (const e of tri) {
    const num = numParPiece.get(clePiece(e));
    if (num === undefined) continue;
    const dateF = ymd(e.dateEcriture);
    lignes.push(
      [
        e.journal,
        LIB_JOURNAL[e.journal],
        String(num),
        dateF,
        e.numeroCompte,
        clean(e.libelleCompte),
        "",
        "",
        clean(e.pieceRef),
        dateF,
        clean(e.libelle),
        amt(e.debit),
        amt(e.credit),
        clean(e.lettrage),
        "",
        dateF,
        "",
        "",
      ].join(SEP),
    );
  }
  return lignes.join("\n");
}
