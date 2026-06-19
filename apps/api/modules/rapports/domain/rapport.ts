/*
 * Rapports personnalisables (table `rapports_personnalises`, sous RLS via `artisanId`). L'exécution
 * (`executerRapport`) sélectionne, selon le `type`, toutes les lignes de l'entité scopée tenant et
 * journalise l'exécution (table `executions_rapports`, sous RLS).
 */
export type RapportType = "ventes" | "clients" | "interventions" | "stocks" | "fournisseurs" | "techniciens" | "financier";
export type RapportFormat = "tableau" | "graphique" | "liste";
export type RapportGraphiqueType = "bar" | "line" | "pie" | "doughnut";

export interface RapportPersonnalise {
  readonly id: number;
  readonly artisanId: number;
  readonly nom: string;
  readonly description: string | null;
  readonly type: RapportType;
  readonly filtres: unknown;
  readonly colonnes: unknown;
  readonly groupement: string | null;
  readonly tri: string | null;
  readonly format: RapportFormat | null;
  readonly graphiqueType: RapportGraphiqueType | null;
  readonly favori: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateRapportInput {
  readonly nom: string;
  readonly description?: string;
  readonly type: RapportType;
  readonly filtres?: unknown;
  readonly colonnes?: unknown;
  readonly groupement?: string;
  readonly tri?: string;
  readonly format?: RapportFormat;
  readonly graphiqueType?: RapportGraphiqueType;
}

export interface ExecutionResult {
  readonly resultats: unknown[];
  readonly nombreLignes: number;
  readonly tempsExecution: number;
}

/** Agrégat du rapport « financier » (parité legacy `executerRapport` case 'financier'). PURE. */
export function computeFinancier(factures: ReadonlyArray<{ statut: string | null; totalTTC: string | null }>): Array<{ totalCA: number; nombreFactures: number; facturesPayees: number }> {
  const payees = factures.filter((f) => f.statut === "payee");
  const totalCA = payees.reduce((sum, f) => sum + (parseFloat(String(f.totalTTC ?? "0")) || 0), 0);
  return [{ totalCA, nombreFactures: factures.length, facturesPayees: payees.length }];
}
