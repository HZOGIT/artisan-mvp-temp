import type { RouterOutputs } from "@/shared/trpc";

/*
 * Couche DOMAIN de la feature `import-releve` (import d'un relevé bancaire CSV). Types dérivés du routeur,
 * parsing d'aperçu CSV PUR et testable. 0 dépendance React/tRPC.
 */

export type Transaction = RouterOutputs["depenses"]["getTransactionsBancaires"][number];
export type Categorie = RouterOutputs["depenses"]["getCategories"][number];
export type ImportResult = RouterOutputs["depenses"]["importReleve"];

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
