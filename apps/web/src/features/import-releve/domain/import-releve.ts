import type { RouterOutputs } from "@/shared/trpc";

/**
 * Couche DOMAIN de la feature `import-releve` (import d'un relevé bancaire CSV). Types dérivés du routeur,
 * parsing d'aperçu CSV PUR et testable. 0 dépendance React/tRPC.
 */

export type Transaction = RouterOutputs["depenses"]["getTransactionsBancaires"][number];
export type Categorie = RouterOutputs["depenses"]["getCategories"][number];
export type ImportResult = RouterOutputs["depenses"]["importReleve"];

export type ReleveMapping = {
  date: string;
  libelle: string;
  montant?: string;
  debit?: string;
  credit?: string;
};

/** Montant € (entiers), tolérant string/number/null. PUR. */
export function eur(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? parseFloat(n) : Number(n || 0);
  return (Number.isFinite(v) ? v : 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

/** Séparateur CSV dominant d'une ligne (`;` si plus fréquent que `,`, sinon `,`). PUR. */
export function detectSeparator(line: string): string {
  return (line.match(/;/g)?.length || 0) > (line.match(/,/g)?.length || 0) ? ";" : ",";
}

/** Aperçu des 6 premières lignes non vides (5 colonnes max), séparateur auto-détecté. PUR. */
export function parsePreview(csvText: string): string[][] {
  const lignes = csvText.split(/\r?\n/).filter((l) => l.trim()).slice(0, 6);
  const sep = detectSeparator(lignes[0] || "");
  return lignes.map((l) => l.split(sep).slice(0, 5));
}

/** Retourne tous les en-têtes de la première ligne non vide. PUR. */
export function parseHeaders(csvText: string): string[] {
  const firstLine = csvText.split(/\r?\n/).find((l) => l.trim()) ?? "";
  const sep = detectSeparator(firstLine);
  return firstLine.split(sep).map((h) => h.trim().replace(/^"|"$/g, ""));
}

function normFr(s: string): string {
  return s.toLowerCase()
    .replace(/[éèêë]/g, "e").replace(/[àâä]/g, "a").replace(/[îï]/g, "i")
    .replace(/[ôö]/g, "o").replace(/[ùûü]/g, "u").replace(/[ç]/g, "c")
    .trim();
}

const DATE_NORM = ["date", "date operation", "date d'operation", "date valeur", "date de valeur"];
const LIB_NORM  = ["libelle", "description", "motif", "wording", "label", "intitule", "commentaire", "designation"];
const MON_NORM  = ["montant", "amount", "montant operation", "valeur"];
const DEB_NORM  = ["debit", "montant debit", "sorties", "retrait"];
const CRE_NORM  = ["credit", "montant credit", "entrees", "versement"];

/** Auto-détecte le mapping {date, libellé, montant?, débit?, crédit?} depuis les en-têtes CSV. PUR. */
export function autoDetectMapping(headers: string[]): Partial<ReleveMapping> {
  const find = (aliases: string[]) => headers.find((h) => aliases.includes(normFr(h)));
  return {
    date:    find(DATE_NORM),
    libelle: find(LIB_NORM),
    montant: find(MON_NORM),
    debit:   find(DEB_NORM),
    credit:  find(CRE_NORM),
  };
}
