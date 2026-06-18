import type { TenantContext } from "../../../shared/tenant";
import type { CreateRapportInput, RapportPersonnalise, RapportType } from "../domain/rapport";

// Données d'une exécution à journaliser (table `executions_rapports`).
export interface ExecutionLog {
  readonly rapportId: number;
  readonly parametres: unknown;
  readonly resultats: unknown[];
  readonly nombreLignes: number;
  readonly tempsExecution: number;
}

// Port du repository « rapports ». Tables sous RLS (`artisanId`) → toutes les opérations scopées tenant.
export interface IRapportRepository {
  // Rapports du tenant, triés `updatedAt` desc.
  list(ctx: TenantContext): Promise<RapportPersonnalise[]>;
  // Rapport du tenant par id (null si inexistant / autre tenant → anti-IDOR via RLS + filtre).
  getById(ctx: TenantContext, id: number): Promise<RapportPersonnalise | null>;
  // Crée un rapport pour le tenant.
  create(ctx: TenantContext, input: CreateRapportInput): Promise<RapportPersonnalise>;
  // Supprime un rapport (cascade ses exécutions). `false` si non possédé.
  remove(ctx: TenantContext, id: number): Promise<boolean>;
  // Bascule le drapeau favori. `null` si non possédé.
  toggleFavori(ctx: TenantContext, id: number): Promise<RapportPersonnalise | null>;
  // Exécute la sélection associée au `type` (toutes les lignes de l'entité scopée tenant).
  runReport(ctx: TenantContext, type: RapportType): Promise<unknown[]>;
  // Journalise une exécution.
  saveExecution(ctx: TenantContext, log: ExecutionLog): Promise<void>;
}
