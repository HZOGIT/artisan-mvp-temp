import { NotFoundError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";
import type { IContratRepository } from "./contrat-repository";
import type {
  ContratIntervention,
  ContratAFacturer,
  CreateContratInterventionInput,
  UpdateContratInterventionInput,
} from "../domain/contrat";

// Use-cases de la sous-ressource « interventions de contrat » + liste « à facturer ». Purs (repo
// injecté). ⚠️ Anti-IDOR : toute opération sur une intervention exige que le contrat parent
// appartienne au tenant (vérifié via getById → 404 sinon), ET que l'intervention relève bien de ce
// contrat (appariement id↔contratId) — sinon un id d'intervention d'un autre tenant serait modifiable.

// Contrats dont l'échéance de facturation est atteinte, enrichis (TTC dérivé HT×(1+TVA), jours de
// retard depuis `prochainFacturation`). Parité legacy `contrats.getAFacturer`.
export async function listContratsAFacturer(
  repo: IContratRepository,
  ctx: TenantContext,
  maintenant: () => Date = () => new Date(),
): Promise<ContratAFacturer[]> {
  const now = maintenant().getTime();
  const rows = await repo.listAFacturer(ctx);
  return rows.map((c) => {
    const montantHT = parseFloat(c.montantHT || "0") || 0;
    const tauxTVA = parseFloat(c.tauxTVA || "0") || 0;
    const montantTTC = montantHT * (1 + tauxTVA / 100);
    const joursRetard = c.prochainFacturation
      ? Math.max(0, Math.floor((now - c.prochainFacturation.getTime()) / 86_400_000))
      : 0;
    return { ...c, montantTTC: montantTTC.toFixed(2), joursRetard };
  });
}

// Interventions d'un contrat (ownership du contrat requis → 404 sinon).
export async function getInterventionsContrat(
  repo: IContratRepository,
  ctx: TenantContext,
  contratId: number,
): Promise<ContratIntervention[]> {
  if (!(await repo.getById(ctx, contratId))) throw new NotFoundError("Contrat introuvable");
  return repo.listInterventions(ctx, contratId);
}

// Crée une intervention sous un contrat possédé (404 si le contrat n'est pas du tenant).
export async function creerInterventionContrat(
  repo: IContratRepository,
  ctx: TenantContext,
  input: CreateContratInterventionInput,
): Promise<ContratIntervention> {
  if (!(await repo.getById(ctx, input.contratId))) throw new NotFoundError("Contrat introuvable");
  return repo.createIntervention(ctx, input);
}

// Met à jour une intervention. ⚠️ Anti-IDOR (parité legacy/OPE-89) : le contrat parent doit être du
// tenant ET l'intervention doit relever de CE contrat (sinon `id` découplé de `contratId` → IDOR).
export async function modifierInterventionContrat(
  repo: IContratRepository,
  ctx: TenantContext,
  id: number,
  contratId: number,
  input: UpdateContratInterventionInput,
): Promise<ContratIntervention> {
  if (!(await repo.getById(ctx, contratId))) throw new NotFoundError("Contrat introuvable");
  const existante = await repo.getInterventionById(ctx, id);
  if (!existante || existante.contratId !== contratId) throw new NotFoundError("Intervention introuvable");
  const updated = await repo.updateIntervention(ctx, id, input);
  if (!updated) throw new NotFoundError("Intervention introuvable");
  return updated;
}
