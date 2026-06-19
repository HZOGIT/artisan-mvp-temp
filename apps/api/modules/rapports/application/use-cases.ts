import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { CreateRapportInput, ExecutionResult, RapportPersonnalise } from "../domain/rapport";
import type { IRapportRepository } from "./rapport-repository";

/** Horloge en millisecondes (injectable pour des tests déterministes de `tempsExecution`). */
type ClockMs = () => number;

export function listRapports(repo: IRapportRepository, ctx: TenantContext): Promise<RapportPersonnalise[]> {
  return repo.list(ctx);
}

export function creerRapport(repo: IRapportRepository, ctx: TenantContext, input: CreateRapportInput): Promise<RapportPersonnalise> {
  return repo.create(ctx, input);
}

/** Suppression : anti-IDOR (parité legacy `assertRapportOwner` → 404 si non possédé). */
export async function supprimerRapport(repo: IRapportRepository, ctx: TenantContext, id: number): Promise<{ success: true }> {
  if (!(await repo.remove(ctx, id))) throw new NotFoundError("Rapport non trouvé");
  return { success: true };
}

export async function basculerFavori(repo: IRapportRepository, ctx: TenantContext, id: number): Promise<RapportPersonnalise> {
  const rapport = await repo.toggleFavori(ctx, id);
  if (!rapport) throw new NotFoundError("Rapport non trouvé");
  return rapport;
}

/*
 * Exécute un rapport possédé (anti-IDOR via getById scopé), journalise l'exécution et renvoie les
 * lignes + métadonnées. `tempsExecution` mesuré via l'horloge injectée (parité legacy `executerRapport`).
 */
export async function executerRapport(repo: IRapportRepository, ctx: TenantContext, rapportId: number, parametres: unknown, now: ClockMs = () => Date.now()): Promise<ExecutionResult> {
  const start = now();
  const rapport = await repo.getById(ctx, rapportId);
  if (!rapport) throw new NotFoundError("Rapport non trouvé");
  const resultats = await repo.runReport(ctx, rapport.type);
  const nombreLignes = resultats.length;
  const tempsExecution = now() - start;
  await repo.saveExecution(ctx, { rapportId, parametres: parametres ?? {}, resultats, nombreLignes, tempsExecution });
  return { resultats, nombreLignes, tempsExecution };
}
