import type { RouterOutputs } from "@/shared/trpc";

// Couche DOMAINE de la feature `comptabilite` (lecture seule) (clean-archi) : types dérivés des sorties
// du routeur tRPC + règles PURES testables sans réseau ni i18n (totaux balance, sérialisation CSV).

export type Balance = RouterOutputs["comptabilite"]["getBalance"];
export type BalanceLine = Balance[number];
export type GrandLivre = RouterOutputs["comptabilite"]["getGrandLivre"];
export type GrandLivreCompte = GrandLivre[number];
export type GrandLivreEcriture = GrandLivreCompte["ecritures"][number];
export type JournalVentes = RouterOutputs["comptabilite"]["getJournalVentes"];
export type JournalEcriture = JournalVentes[number];
export type FecPreview = RouterOutputs["comptabilite"]["getFecPreview"];
export type TvaDetail = RouterOutputs["comptabilite"]["getDeclarationTVADetail"];

// Solde NET PUR d'une ligne de balance = solde débiteur − solde créditeur (l'un des deux est nul). Le
// DTO `LigneBalance` n'a pas de champ `solde` unique (le legacy lisait `ligne.solde` → undefined).
export function ligneSoldeNet(l: Pick<BalanceLine, "soldeDebiteur" | "soldeCrediteur">): number {
  return l.soldeDebiteur - l.soldeCrediteur;
}

export interface BalanceTotals {
  debit: number;
  credit: number;
  solde: number;
}

// Totaux PURS de la balance (Σ débit / crédit / solde net).
export function balanceTotals(balance: readonly BalanceLine[]): BalanceTotals {
  return balance.reduce<BalanceTotals>(
    (acc, l) => ({ debit: acc.debit + l.debit, credit: acc.credit + l.credit, solde: acc.solde + ligneSoldeNet(l) }),
    { debit: 0, credit: 0, solde: 0 },
  );
}

export type CsvCell = string | number | null | undefined;
export type CsvRow = Record<string, CsvCell>;

// Sérialisation CSV PURE (séparateur `;`, en-tête = clés de la 1re ligne). "" si vide.
export function toCsv(rows: readonly CsvRow[]): string {
  const first = rows[0];
  if (!first) return "";
  const headers = Object.keys(first);
  return [
    headers.join(";"),
    ...rows.map((row) => headers.map((h) => row[h] ?? "").join(";")),
  ].join("\n");
}
