/*
 * Export CSV des factures (parité legacy `/api/comptabilite/export-csv`). Helpers PURS d'anti-injection
 * et de formatage, + assemblage du CSV. Aucun effet de bord.
 */

/** Montant FR (virgule décimale, 2 décimales) — parité legacy `fecAmount`. */
export function fecAmount(val: string | number | null | undefined): string {
  const num = typeof val === "string" ? parseFloat(val) : val || 0;
  return (Number.isFinite(num) ? num : 0).toFixed(2).replace(".", ",");
}

/** Date FR déterministe `JJ/MM/AAAA` (≠ toLocaleDateString, indépendant de la locale système). */
export function formatDateFr(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/** Date `AAAAMMJJ` (nom de fichier) — parité legacy `fecDate`. */
export function ymdCompact(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

/*
 * Neutralise une cellule CSV (parité legacy `csvCell`) : (1) injection de formule (cellule
 * commençant par = + - @ TAB CR exécutée par Excel/LibreOffice) → préfixe apostrophe ; (2) rupture de
 * structure (`;` `"` newline) → échappement RFC 4180. Nombres/dates sains laissés inchangés. PUR.
 */
export function csvCell(val: string | number | null | undefined): string {
  let s = String(val ?? "");
  /** nombre pur : inchangé */
  if (/^-?\d+(?:[.,]\d+)?$/.test(s)) return s;
  /** anti injection de formule */
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  /** anti rupture de structure */
  if (/[;"\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export interface FactureCsvRow {
  readonly dateFacture: Date;
  readonly numero: string;
  readonly clientNom: string;
  readonly totalHT: string;
  readonly totalTVA: string;
  readonly totalTTC: string;
  readonly statut: string;
}

const CSV_HEADER = "Date;Numéro;Client;HT;TVA;TTC;Statut";

/** Assemble le CSV des factures (entête + lignes neutralisées) avec BOM Excel. PUR. */
export function buildFacturesCsv(rows: readonly FactureCsvRow[]): string {
  const lignes = [CSV_HEADER];
  for (const f of rows) {
    lignes.push(
      [formatDateFr(f.dateFacture), f.numero, f.clientNom || "Client", fecAmount(f.totalHT), fecAmount(f.totalTVA), fecAmount(f.totalTTC), f.statut]
        .map(csvCell)
        .join(";"),
    );
  }
  /** BOM UTF-8 (Excel) */
  return "﻿" + lignes.join("\n");
}

/** Nom de fichier de l'export CSV (parité legacy : `factures_<début>_<fin>.csv`). PUR. */
export function csvFileName(dateDebut: Date, dateFin: Date): string {
  return `factures_${ymdCompact(dateDebut)}_${ymdCompact(dateFin)}.csv`;
}
